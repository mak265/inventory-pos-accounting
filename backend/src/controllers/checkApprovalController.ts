import { Request, Response } from 'express';
import * as checkApprovalService from '../services/checkApprovalService.js';
import Payment from '../models/Payment.js';
import CheckRecord from '../models/CheckRecord.js';
import AssetAccount from '../models/AssetAccount.js';
import mongoose from 'mongoose';

export const getCheckRecords = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = { status: req.query.status as string, startDate: req.query.startDate as string, endDate: req.query.endDate as string };
    const records = await checkApprovalService.getCheckRecords(filters);
    res.json(records);
  } catch (error: any) { res.status(500).json({ error: error.message || 'Failed to fetch check records' }); }
};

export const getAvailableBanks = async (_req: Request, res: Response): Promise<void> => {
  try { res.json(checkApprovalService.getAvailableBanks()); } catch (error: any) { res.status(500).json({ error: error.message }); }
};

export const approveCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { bankAccount } = req.body;
    const userId = (req as any).user.userId;
    if (!bankAccount) { res.status(400).json({ error: 'Bank account is required' }); return; }
    const result = await checkApprovalService.approveCheck(id, bankAccount, userId);
    res.json(result);
  } catch (error: any) {
    const msg = error.message || '';
    if (msg === 'Check record not found') res.status(404).json({ error: msg });
    else if (msg.includes('Invalid') || msg.includes('Insufficient') || msg.includes('already')) res.status(400).json({ error: msg });
    else res.status(500).json({ error: 'Failed to approve check' });
  }
};

export const bounceCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const userId = (req as any).user.userId;
    const result = await checkApprovalService.bounceCheck(id, userId);
    res.json(result);
  } catch (error: any) {
    const msg = error.message || '';
    if (msg === 'Check record not found') res.status(404).json({ error: msg });
    else if (msg.includes('Invalid') || msg.includes('already') || msg.includes('Cannot bounce')) res.status(400).json({ error: msg });
    else res.status(500).json({ error: 'Failed to bounce check' });
  }
};

export const approveTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, bankAccount, notes, referenceId } = req.body;
    const userId = (req as any).user.userId;
    if (!bankAccount) { res.status(400).json({ error: 'Bank account is required' }); return; }
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      let checkAcct = await AssetAccount.findOne({ accountType: 'CHECK' }).session(session);
      if (!checkAcct) { throw new Error('CHECK account not found'); }
      if (checkAcct.balance < amount) { throw new Error('Insufficient CHECK account balance'); }
      let bankAcct = await AssetAccount.findOne({ accountType: 'BANK' }).session(session);
      if (!bankAcct) { bankAcct = new AssetAccount({ accountType: 'BANK', balance: 0, transactions: [], syncVersion: 0 }); }
      checkAcct.balance -= amount;
      checkAcct.transactions.push({ date: new Date(), type: 'DEBIT', amount, description: 'Approved - deposited to ' + bankAccount + (notes ? ' | ' + notes : ''), referenceId: referenceId || undefined, referenceType: 'Approval' });
      checkAcct.updatedAt = new Date();
      checkAcct.syncVersion += 1;
      await checkAcct.save({ session });
      bankAcct.balance += amount;
      bankAcct.transactions.push({ date: new Date(), type: 'CREDIT', amount, description: 'Check deposit from CHECK - ' + bankAccount + (notes ? ' | ' + notes : ''), referenceId: referenceId || undefined, referenceType: 'Approval' });
      bankAcct.updatedAt = new Date();
      bankAcct.syncVersion += 1;
      await bankAcct.save({ session });
      await session.commitTransaction();
      res.json({ message: 'Transaction approved', bankAccount, amount });
    } catch (err) { await session.abortTransaction(); throw err; }
    finally { session.endSession(); }
  } catch (error: any) { res.status(400).json({ error: error.message || 'Failed to approve' }); }
};

export const bounceTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, notes, referenceId } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      let checkAcct = await AssetAccount.findOne({ accountType: 'CHECK' }).session(session);
      if (!checkAcct) { throw new Error('CHECK account not found'); }
      checkAcct.balance -= amount;
      checkAcct.transactions.push({ date: new Date(), type: 'DEBIT', amount, description: 'Bounced check' + (notes ? ' | ' + notes : ''), referenceId: referenceId || undefined, referenceType: 'Bounce' });
      checkAcct.updatedAt = new Date();
      checkAcct.syncVersion += 1;
      await checkAcct.save({ session });
      await session.commitTransaction();
      res.json({ message: 'Transaction marked as bounced', amount });
    } catch (err) { await session.abortTransaction(); throw err; }
    finally { session.endSession(); }
  } catch (error: any) { res.status(400).json({ error: error.message || 'Failed to bounce' }); }
};

export const repayBounced = async (req: Request, res: Response): Promise<void> => {
  try {
    const { checkRecordId, amount, channel, referenceNumber, notes } = req.body;
    const userId = (req as any).user.userId;
    if (!checkRecordId || !amount || !channel) {
      res.status(400).json({ error: 'checkRecordId, amount, and channel are required' });
      return;
    }
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const check = await CheckRecord.findOne({ _id: checkRecordId, status: 'BOUNCED', isDeleted: false }).session(session);
      if (!check) { throw new Error('Bounced check record not found'); }

      const BANK_CHANNELS = ['BPI', 'BDO', 'METROBANK', 'AUB', 'LANDBANK', 'PNB', 'CHECK', 'OTHER_BANK'];
      const ONLINE_CHANNELS = ['GCASH', 'MAYA'];
      const chUpper = (channel || '').toUpperCase();
      let targetAccount = 'CHECK';
      if (chUpper === 'CASH') targetAccount = 'CASH';
      else if (ONLINE_CHANNELS.includes(chUpper)) targetAccount = 'GCASH';
      else if (BANK_CHANNELS.includes(chUpper)) targetAccount = 'CHECK';

      let assetAcct = await AssetAccount.findOne({ accountType: targetAccount }).session(session);
      if (!assetAcct) {
        assetAcct = new AssetAccount({ accountType: targetAccount, balance: 0, transactions: [], syncVersion: 0 });
      }
      assetAcct.balance += amount;
      assetAcct.transactions.push({
        date: new Date(),
        type: 'CREDIT',
        amount,
        description: `Repayment for bounced check from ${check.customerName}${referenceNumber ? ' - Ref: ' + referenceNumber : ''}${notes ? ' | ' + notes : ''}`,
        referenceId: check._id,
        referenceType: 'BouncedRepay'
      });
      assetAcct.updatedAt = new Date();
      assetAcct.syncVersion += 1;
      await assetAcct.save({ session });

      check.status = 'CLEARED';
      check.bankAccount = channel;
      check.approvedDate = new Date();
      check.approvedBy = new mongoose.Types.ObjectId(userId);
      await check.save({ session });

      await session.commitTransaction();
      res.json({ message: 'Repayment recorded', amount, channel });
    } catch (err) { await session.abortTransaction(); throw err; }
    finally { session.endSession(); }
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to record repayment' });
  }
};

export const migrateCheckRecords = async (_req: Request, res: Response): Promise<void> => {
  try {
    const BANK_CHANNELS = ['BPI', 'BDO', 'METROBANK', 'AUB', 'LANDBANK', 'PNB', 'RCBC', 'SECURITY BANK', 'UNIONBANK', 'CHINABANK', 'EASTWEST', 'PSBANK', 'CHECK', 'OTHER'];
    const payments = await Payment.find({ isDeleted: false }).populate('customerId', 'name');
    let created = 0, skipped = 0;
    for (const payment of payments) {
      for (const channel of payment.paymentChannels) {
        const chUpper = (channel.channel || '').toUpperCase();
        if (!BANK_CHANNELS.includes(chUpper) || channel.amount <= 0) continue;
        const exists = await CheckRecord.findOne({ paymentId: payment._id, amount: channel.amount, referenceNumber: channel.referenceNumber || '', isDeleted: false });
        if (exists) { skipped++; continue; }
        await CheckRecord.create({ paymentId: payment._id, customerName: (payment as any).customerId?.name || 'Walk-in', amount: channel.amount, referenceNumber: channel.referenceNumber || '', accountName: channel.accountName || '', effectiveDate: channel.effectiveDate || undefined, receivedDate: payment.paymentDate, status: 'PENDING' });
        created++;
      }
    }
    res.json({ message: 'Migration complete: ' + created + ' created, ' + skipped + ' skipped', count: created });
  } catch (error: any) { res.status(500).json({ error: error.message || 'Failed to migrate' }); }
};
