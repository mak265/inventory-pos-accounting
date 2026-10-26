import Payment, { IPayment, IPaymentChannel } from '../models/Payment.js';
import Sale from '../models/Sale.js';
import Customer from '../models/Customer.js';
import AssetAccount from '../models/AssetAccount.js';
import CheckRecord from '../models/CheckRecord.js';
import mongoose from 'mongoose';

/**
 * Calculate total paid from all payment channels
 * Property 17: Multi-Channel Payment Total
 */
export const calculateTotalPaid = (paymentChannels: IPaymentChannel[]): number => {
  return paymentChannels.reduce((total, channel) => total + channel.amount, 0);
};

/**
 * Calculate unpaid amount
 * Property 15: Unpaid Amount Calculation
 */
export const calculateUnpaidAmount = (amountDue: number, totalPaid: number): number => {
  const unpaid = amountDue - totalPaid;
  return unpaid > 0 ? unpaid : 0;
};

/**
 * Build a meaningful transaction description for asset account entries.
 * Avoids "N/A" by conditionally including reference number and account name.
 */
export const buildTransactionDescription = (
  channel: string,
  customerName?: string,
  referenceNumber?: string,
  accountName?: string
): string => {
  const name = customerName || 'Walk-in';
  let description = `${channel} payment from ${name}`;

  if (referenceNumber && accountName) {
    description += ` - Ref: ${referenceNumber} (Acct: ${accountName})`;
  } else if (referenceNumber) {
    description += ` - Ref: ${referenceNumber}`;
  } else if (accountName) {
    description += ` - Acct: ${accountName}`;
  }

  return description;
};

export const getAllPayments = async (filters: any = {}) => {
  const query: any = { isDeleted: false };
  
  if (filters.customerId) {
    query.customerId = filters.customerId;
  }
  
  if (filters.saleId) {
    query.saleId = filters.saleId;
  }
  
  if (filters.startDate || filters.endDate) {
    query.paymentDate = {};
    if (filters.startDate) {
      query.paymentDate.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      query.paymentDate.$lte = new Date(filters.endDate);
    }
  }

  const payments = await Payment.find(query)
    .populate('customerId', 'name')
    .populate('saleId', 'drNumber totalAmount')
    .sort({ paymentDate: -1 })
    .lean();
  
  return payments;
};

export const getPaymentById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid payment ID');
  }

  const payment = await Payment.findOne({ _id: id, isDeleted: false })
    .populate('customerId', 'name officeAddress deliveryAddress tin')
    .populate('saleId', 'drNumber totalAmount saleDate')
    .lean();
  
  if (!payment) {
    throw new Error('Payment not found');
  }
  
  return payment;
};

/**
 * Create a payment and update customer balance
 * Property 16: Customer Balance Update on Unpaid
 * Property 17: Multi-Channel Payment Total
 */
export const createPayment = async (paymentData: Partial<IPayment>, userId: string) => {
  // Validate sale exists
  if (!mongoose.Types.ObjectId.isValid(paymentData.saleId as any)) {
    throw new Error('Invalid sale ID');
  }

  const sale = await Sale.findOne({ _id: paymentData.saleId, isDeleted: false });
  if (!sale) {
    throw new Error('Sale not found');
  }

  // Validate customer exists (optional for walk-in)
  let customer: any = null;
  if (paymentData.customerId) {
    if (!mongoose.Types.ObjectId.isValid(paymentData.customerId as any)) {
      throw new Error('Invalid customer ID');
    }

    const cust = await Customer.findOne({ _id: paymentData.customerId, isDeleted: false });
    if (!cust) {
      throw new Error('Customer not found');
    }
    customer = cust;
  }

  // Calculate total paid from payment channels
  const totalPaid = calculateTotalPaid(paymentData.paymentChannels || []);
  
  // Add cash and charge payments to total
  const cashPayment = paymentData.cashPayment || 0;
  const chargePayment = paymentData.chargePayment || 0;
  const finalTotalPaid = totalPaid + cashPayment + chargePayment;

  // Calculate unpaid amount
  const amountDue = paymentData.amountDue || sale.totalAmount;
  const unpaidAmount = calculateUnpaidAmount(amountDue, finalTotalPaid);

  // Start a session for transaction (only if replica set available)
  let session: any = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch {
    // Standalone MongoDB — no transaction support, proceed without session
    session = null;
  }

  try {
    // Create payment
    const payment = new Payment({
      ...paymentData,
      totalPaid: finalTotalPaid,
      unpaidAmount,
      createdBy: userId
    });

    await payment.save(session ? { session } : {});

    // Update asset accounts for each payment channel
    // Property 33: Asset Account Balance on Payment Receipt
    const BANK_CHANNELS = ['BPI', 'BDO', 'METROBANK', 'AUB', 'LANDBANK', 'PNB', 'RCBC', 'SECURITY BANK', 'UNIONBANK', 'CHINABANK', 'EASTWEST', 'PSBANK', 'CHECK', 'OTHER'];
    const ONLINE_CHANNELS = ['GCASH', 'BPI ONLINE', 'AUB ONLINE', 'MAYA'];

    for (const channel of paymentData.paymentChannels || []) {
      if (channel.amount > 0) {
        const chUpper = (channel.channel || '').toUpperCase();
        let targetAccount: string;

        if (chUpper === 'CASH') {
          targetAccount = 'CASH';
        } else if (BANK_CHANNELS.includes(chUpper)) {
          targetAccount = 'CHECK';
        } else if (ONLINE_CHANNELS.includes(chUpper)) {
          targetAccount = 'GCASH';
        } else {
          targetAccount = 'CHECK'; // default fallback
        }

        let assetAccount = session
          ? await AssetAccount.findOne({ accountType: targetAccount }).session(session)
          : await AssetAccount.findOne({ accountType: targetAccount });
        if (!assetAccount) {
          assetAccount = new AssetAccount({ accountType: targetAccount, balance: 0, transactions: [], syncVersion: 0 });
        }

        assetAccount.balance += channel.amount;
        assetAccount.transactions.push({
          date: paymentData.paymentDate || new Date(),
          type: 'CREDIT',
          amount: channel.amount,
          description: buildTransactionDescription(channel.channel, customer?.name, channel.referenceNumber, channel.accountName),
          referenceId: payment._id,
          referenceType: 'Payment'
        });
        assetAccount.updatedAt = new Date();
        assetAccount.syncVersion += 1;
        await assetAccount.save(session ? { session } : {});
      }
    }

    // Update cash account if cash payment
    if (cashPayment > 0) {
      let cashAccount = session
        ? await AssetAccount.findOne({ accountType: 'CASH' }).session(session)
        : await AssetAccount.findOne({ accountType: 'CASH' });
      
      if (!cashAccount) {
        cashAccount = new AssetAccount({ accountType: 'CASH', balance: 0, transactions: [], syncVersion: 0 });
      }

      cashAccount.balance += cashPayment;
      cashAccount.transactions.push({
        date: paymentData.paymentDate || new Date(),
        type: 'CREDIT',
        amount: cashPayment,
        description: buildTransactionDescription('Cash', customer?.name),
        referenceId: payment._id,
        referenceType: 'Payment'
      });
      cashAccount.updatedAt = new Date();
      cashAccount.syncVersion += 1;
      await cashAccount.save(session ? { session } : {});
    }

    // Update customer balance if there's unpaid amount
    if (customer && unpaidAmount > 0) {
      customer.balance += unpaidAmount;
      customer.updatedBy = new mongoose.Types.ObjectId(userId);
      await customer.save(session ? { session } : {});
    }

    // If payment reduces existing balance, update it
    if (customer && finalTotalPaid > 0 && customer.balance > 0) {
      const balanceReduction = Math.min(finalTotalPaid, customer.balance);
      customer.balance -= balanceReduction;
      customer.updatedBy = new mongoose.Types.ObjectId(userId);
      await customer.save(session ? { session } : {});
    }

    // Create CheckRecords for bank/check payment channels
    const CHECK_RECORD_CHANNELS = ['BPI', 'BDO', 'METROBANK', 'AUB', 'LANDBANK', 'PNB', 'RCBC', 'SECURITY BANK', 'UNIONBANK', 'CHINABANK', 'EASTWEST', 'PSBANK', 'CHECK', 'OTHER'];
    for (const channel of paymentData.paymentChannels || []) {
      const chUpper = (channel.channel || '').toUpperCase();
      if (CHECK_RECORD_CHANNELS.includes(chUpper) && channel.amount > 0) {
        const checkRecord = new CheckRecord({
          paymentId: payment._id,
          customerName: customer?.name || 'Walk-in',
          amount: channel.amount,
          referenceNumber: channel.referenceNumber || '',
          accountName: channel.accountName || '',
          effectiveDate: channel.effectiveDate || undefined,
          receivedDate: paymentData.paymentDate || new Date(),
          status: 'PENDING'
        });
        await checkRecord.save(session ? { session } : {});
      }
    }

    if (session) await session.commitTransaction();
    
    // Verify payment was saved successfully
    const verified = await Payment.findById(payment._id).lean();
    if (!verified) {
      console.error('CRITICAL: Payment created but not found on verification!', payment._id);
      throw new Error('Payment save verification failed');
    }
    
    return payment;
  } catch (error) {
    if (session) await session.abortTransaction();
    throw error;
  } finally {
    if (session) session.endSession();
  }
};

export const deletePayment = async (id: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid payment ID');
  }

  const payment = await Payment.findOne({ _id: id, isDeleted: false });
  
  if (!payment) {
    throw new Error('Payment not found');
  }

  // Start a session for transaction (optional — works without for standalone MongoDB)
  let session: any = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch {
    session = null;
  }

  try {
    // Check for associated CheckRecords before deletion
    const checkRecords = session
      ? await CheckRecord.find({ paymentId: payment._id, isDeleted: false }).session(session)
      : await CheckRecord.find({ paymentId: payment._id, isDeleted: false });
    for (const cr of checkRecords) {
      if (cr.status === 'CLEARED') {
        throw new Error('Cannot delete payment: associated check has already been cleared');
      }
    }
    // Delete PENDING CheckRecords
    if (session) {
      await CheckRecord.updateMany(
        { paymentId: payment._id, status: 'PENDING', isDeleted: false },
        { isDeleted: true },
        { session }
      );
    } else {
      await CheckRecord.updateMany(
        { paymentId: payment._id, status: 'PENDING', isDeleted: false },
        { isDeleted: true }
      );
    }

    // Reverse customer balance changes
    const customer = session
      ? await Customer.findOne({ _id: payment.customerId, isDeleted: false }).session(session)
      : await Customer.findOne({ _id: payment.customerId, isDeleted: false });
    
    if (customer) {
      if (payment.unpaidAmount > 0) {
        customer.balance -= payment.unpaidAmount;
      }
      if (payment.totalPaid > 0) {
        customer.balance += payment.totalPaid;
      }
      customer.updatedBy = new mongoose.Types.ObjectId(userId);
      await customer.save(session ? { session } : {});
    }

    // Soft delete payment
    payment.isDeleted = true;
    await payment.save(session ? { session } : {});

    if (session) await session.commitTransaction();
    return { message: 'Payment deleted successfully' };
  } catch (error) {
    if (session) await session.abortTransaction();
    throw error;
  } finally {
    if (session) session.endSession();
  }
};
