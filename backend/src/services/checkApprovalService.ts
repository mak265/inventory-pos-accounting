import CheckRecord, { ICheckRecord } from '../models/CheckRecord.js';
import AssetAccount from '../models/AssetAccount.js';
import mongoose from 'mongoose';

export const AVAILABLE_BANKS = ['BPI', 'AUB'] as const;

export const getCheckRecords = async (filters: {
  status?: string;
  startDate?: string;
  endDate?: string;
} = {}): Promise<ICheckRecord[]> => {
  const query: any = { isDeleted: false };

  if (filters.status && filters.status !== 'ALL') {
    query.status = filters.status;
  }

  if (filters.startDate || filters.endDate) {
    query.receivedDate = {};
    if (filters.startDate) query.receivedDate.$gte = new Date(filters.startDate);
    if (filters.endDate) query.receivedDate.$lte = new Date(filters.endDate);
  }

  return CheckRecord.find(query).sort({ receivedDate: -1 }).lean();
};

export const getAvailableBanks = (): string[] => {
  return [...AVAILABLE_BANKS];
};

export const approveCheck = async (
  id: string,
  bankAccount: string,
  userId: string
): Promise<ICheckRecord> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid check record ID');
  }

  if (!AVAILABLE_BANKS.includes(bankAccount as any)) {
    throw new Error('Invalid bank account');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const check = await CheckRecord.findOne({ _id: id, isDeleted: false }).session(session);
    if (!check) throw new Error('Check record not found');
    if (check.status === 'CLEARED') throw new Error('Check has already been cleared');
    if (check.status === 'BOUNCED') throw new Error('Check is already marked as bounced');

    let checkAccount = await AssetAccount.findOne({ accountType: 'CHECK' }).session(session);
    if (!checkAccount) {
      checkAccount = new AssetAccount({ accountType: 'CHECK', balance: 0, transactions: [], syncVersion: 0 });
    }

    let bankAssetAccount = await AssetAccount.findOne({ accountType: 'BANK' }).session(session);
    if (!bankAssetAccount) {
      bankAssetAccount = new AssetAccount({ accountType: 'BANK', balance: 0, transactions: [], syncVersion: 0 });
    }

    check.status = 'CLEARED';
    check.bankAccount = bankAccount;
    check.approvedDate = new Date();
    check.approvedBy = new mongoose.Types.ObjectId(userId);
    await check.save({ session });

    checkAccount.balance -= check.amount;
    checkAccount.transactions.push({
      date: new Date(),
      type: 'DEBIT',
      amount: check.amount,
      description: `Check cleared - ${check.referenceNumber || 'N/R'} deposited to ${bankAccount}`,
      referenceId: check._id,
      referenceType: 'CheckRecord'
    });
    checkAccount.updatedAt = new Date();
    checkAccount.syncVersion += 1;
    await checkAccount.save({ session });

    bankAssetAccount.balance += check.amount;
    bankAssetAccount.transactions.push({
      date: new Date(),
      type: 'CREDIT',
      amount: check.amount,
      description: `Check deposit from ${check.customerName} - Ref: ${check.referenceNumber || 'N/R'}`,
      referenceId: check._id,
      referenceType: 'CheckRecord'
    });
    bankAssetAccount.updatedAt = new Date();
    bankAssetAccount.syncVersion += 1;
    await bankAssetAccount.save({ session });

    await session.commitTransaction();
    return check;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const migrateExistingChecks = async (): Promise<number> => {
  // Import Payment model
  const Payment = (await import('../models/Payment')).default;

  const BANK_CHANNELS = ['BPI', 'BDO', 'METROBANK', 'AUB', 'LANDBANK', 'PNB', 'RCBC', 'SECURITY BANK', 'UNIONBANK', 'CHINABANK', 'EASTWEST', 'PSBANK', 'CHECK', 'OTHER'];

  // Find all non-deleted payments
  const payments = await Payment.find({ isDeleted: false }).populate('customerId', 'name');

  let created = 0;
  for (const payment of payments) {
    for (const channel of payment.paymentChannels) {
      const chUpper = (channel.channel || '').toUpperCase();
      if (BANK_CHANNELS.includes(chUpper) && channel.amount > 0) {
        const exists = await CheckRecord.findOne({ paymentId: payment._id, amount: channel.amount, referenceNumber: channel.referenceNumber || '' });
        if (!exists) {
          await CheckRecord.create({
            paymentId: payment._id,
            customerName: (payment as any).customerId?.name || (payment as any).customerName || 'Walk-in',
            amount: channel.amount,
            referenceNumber: channel.referenceNumber || '',
            accountName: channel.accountName || '',
            effectiveDate: channel.effectiveDate,
            receivedDate: payment.paymentDate,
            status: 'PENDING'
          });
          created++;
        }
      }
    }
  }
  return created;
};

export const bounceCheck = async (
  id: string,
  userId: string
): Promise<ICheckRecord> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid check record ID');
  }

  const Payment = (await import('../models/Payment')).default;
  const Customer = (await import('../models/Customer')).default;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const check = await CheckRecord.findOne({ _id: id, isDeleted: false }).session(session);
    if (!check) throw new Error('Check record not found');
    if (check.status === 'CLEARED') throw new Error('Cannot bounce a check that has already been cleared');
    if (check.status === 'BOUNCED') throw new Error('Check is already marked as bounced');

    // 1. Mark check as bounced
    check.status = 'BOUNCED';
    check.bouncedDate = new Date();
    check.bouncedBy = new mongoose.Types.ObjectId(userId);
    await check.save({ session });

    // 2. Reverse the CHECK asset account
    let checkAccount = await AssetAccount.findOne({ accountType: 'CHECK' }).session(session);
    if (!checkAccount) {
      checkAccount = new AssetAccount({ accountType: 'CHECK', balance: 0, transactions: [], syncVersion: 0 });
    }
    checkAccount.balance -= check.amount;
    checkAccount.transactions.push({
      date: new Date(),
      type: 'DEBIT',
      amount: check.amount,
      description: `Bounced - ${check.referenceNumber || 'N/R'} from ${check.customerName}`,
      referenceId: check._id,
      referenceType: 'CheckRecord'
    });
    checkAccount.updatedAt = new Date();
    checkAccount.syncVersion += 1;
    await checkAccount.save({ session });

    // 3. Reverse the payment — increase unpaidAmount
    if (check.paymentId) {
      const payment = await Payment.findOne({ _id: check.paymentId, isDeleted: false }).session(session);
      if (payment) {
        payment.totalPaid = Math.max(0, (payment.totalPaid || 0) - check.amount);
        payment.unpaidAmount = (payment.amountDue || 0) - payment.totalPaid;
        if (payment.unpaidAmount < 0) payment.unpaidAmount = 0;
        await payment.save({ session });

        // 4. Add bounced amount back to customer balance
        if (payment.customerId) {
          const customer = await Customer.findOne({ _id: payment.customerId, isDeleted: false }).session(session);
          if (customer) {
            customer.balance += check.amount;
            customer.updatedBy = new mongoose.Types.ObjectId(userId);
            await customer.save({ session });
          }
        }
      }
    }

    await session.commitTransaction();
    return check;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
