import { Request, Response } from 'express';
import * as svc from '../services/dailyCashDrawerService.js';

export const remitCash = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { cashierId, amount, notes } = req.body;
    if (!cashierId || !amount) return res.status(400).json({ error: 'cashierId and amount required' });
    const record = await svc.remitCash(cashierId, amount, notes || '', userId);
    res.status(201).json(record);
  } catch (error: any) {
    console.error('Error remitting cash:', error);
    if (error.message.includes('Maximum') || error.message.includes('must be')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to remit cash' });
  }
};

export const closeDay = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { cashierId, date, openingBalance, notes, actualCashCount, zeroCarryOver } = req.body;
    if (!cashierId || !date) return res.status(400).json({ error: 'cashierId and date required' });
    console.log(`[DEBUG-CTRL] closeDay called: cashierId=${cashierId} date=${date} openingBalance=${openingBalance} actualCashCount=${actualCashCount} zeroCarryOver=${zeroCarryOver} userId=${userId}`);
    const record = await svc.closeDay(
      cashierId,
      date,
      Number(openingBalance || 0),
      notes || '',
      userId,
      Number(actualCashCount || 0),
      !!zeroCarryOver
    );
    res.status(201).json(record);
  } catch (error: any) {
    console.error('Error closing day:', error);
    if (error.message.includes('already been closed')) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: error.message || 'Failed to close day' });
  }
};

export const getDailyRecords = async (req: Request, res: Response) => {
  try {
    const filters = {
      cashierId: req.query.cashierId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      type: req.query.type as string
    };
    const records = await svc.getDailyRecords(filters);
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch records' });
  }
};

export const getOpeningBalance = async (req: Request, res: Response) => {
  try {
    const { cashierId } = req.params;
    const { date } = req.query;
    if (!cashierId) return res.status(400).json({ error: 'cashierId required' });
    const result = await svc.getOpeningBalance(cashierId, date as string | undefined);
    res.json({ openingBalance: result.openingBalance, _debug: result._debug });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get opening balance' });
  }
};

export const acceptAdvancePayment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { cashierId, customerId, amount, notes, paymentChannel, paymentAccountName, paymentReference } = req.body;
    if (!cashierId || !customerId || !amount) return res.status(400).json({ error: 'cashierId, customerId, and amount required' });
    const record = await svc.acceptAdvancePayment(
      cashierId,
      customerId,
      amount,
      notes || '',
      userId,
      paymentChannel || 'CASH',
      paymentAccountName || '',
      paymentReference || ''
    );
    res.status(201).json(record);
  } catch (error: any) {
    console.error('Error accepting advance payment:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed' });
  }
};

export const adjustOpeningBalance = async (req: Request, res: Response) => {
  console.log(`[DEBUG-CTRL] ========= adjust-opening CONTROLLER HIT! ========`);
  try {
    console.log(`[DEBUG-CTRL] Headers received: Authorization=${String(req.headers.authorization || 'MISSING!').slice(0, 40)}...`);
    const userPayload = (req as any).user;
    console.log(`[DEBUG-CTRL] req.user decoded:`, JSON.parse(JSON.stringify(userPayload || { NULL: true })));
    const userId = userPayload?.userId;
    console.log(`[DEBUG-CTRL] userId extracted=${userId}  typeof=${typeof userId}  falsy?=${!userId}`);
    const rawBody = req.body || {};
    console.log(`[DEBUG-CTRL] req.body keys=${Object.keys(rawBody).join(',')} values: cashierId=${rawBody.cashierId} amount=${rawBody.amount} typeof_amount=${typeof rawBody.amount} notes=${rawBody.notes} date=${rawBody.date}`);
    const { cashierId, amount, notes, date } = rawBody;
    if (!cashierId || !amount) {
      console.error(`[DEBUG-CTRL] MISSING FIELDS: returning 400 cashierId?=${!!cashierId} amount?=${!!amount}`);
      return res.status(400).json({ error: 'cashierId and amount required', debugMissing: { cashierId: !!cashierId, amount: !!amount } });
    }
    console.log(`[DEBUG-CTRL] Calling svc.adjustOpeningBalance(cashierId=${cashierId}, amount=${amount}, notes="${notes || ''}", userId=${userId}, date=${date || 'TODAY'})...`);
    const record = await svc.adjustOpeningBalance(cashierId, Number(amount), notes || '', userId, date);
    console.log(`[DEBUG-CTRL] ✅ SERVICE CALL RETURNED SUCCESS! record._id=${String(record._id)}  record.type=${record.type} saved.openingBalance=${record.openingBalance} saved.remittedAmount=${record.remittedAmount}`);
    return res.status(201).json(record);
  } catch (error: any) {
    console.error(`[DEBUG-CTRL] ❌ TOP LEVEL CATCH IN CONTROLLER:`, { name: error?.name, message: error?.message, errors: error?.errors, code: error?.code, statusCode: error?.statusCode });
    console.trace('[DEBUG-CTRL] ADJUST CONTROLLER TOP-LEVEL STACK TRACE');
    const body = { error: error.message || 'Failed', _error: { name: error?.name, errors: error?.errors, code: error?.code } };
    console.log(`[DEBUG-CTRL] Sending 500 response body:`, JSON.parse(JSON.stringify(body)));
    return res.status(500).json(body);
  }
};

export const resetHistory = async (req: Request, res: Response) => {
  try {
    const { cashierId } = req.body;
    if (!cashierId) return res.status(400).json({ error: 'cashierId required' });

    const result = await svc.resetCashDrawerHistory(cashierId);
    res.json({
      message: 'Cash drawer history reset',
      deletedCount: result.deletedCount,
      openingBalance: 0
    });
  } catch (error: any) {
    console.error('Error resetting cash drawer history:', error);
    res.status(500).json({ error: error.message || 'Failed to reset history' });
  }
};

export const deleteRecord = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mongoose = (await import('mongoose')).default;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID' });

    const DailyCashDrawer = (await import('../models/DailyCashDrawer')).default;
    const record = await DailyCashDrawer.findById(id);
    if (!record) return res.status(404).json({ error: 'Record not found' });

    // Only allow deleting ADVANCE_PAYMENT and OPENING_ADJUST
    if (record.type !== 'ADVANCE_PAYMENT' && record.type !== 'OPENING_ADJUST') {
      return res.status(400).json({ error: 'Cannot delete this record type' });
    }

    // Reverse CASH account credit
    const AssetAccount = (await import('../models/AssetAccount')).default;
    const cashAccount = await AssetAccount.findOne({ accountType: 'CASH' });
    if (cashAccount && record.remittedAmount > 0) {
      cashAccount.balance -= record.remittedAmount;
      cashAccount.transactions.push({
        date: new Date(), type: 'DEBIT', amount: record.remittedAmount,
        description: `Reversed: ${record.notes || record.type}`, referenceType: 'Reversal'
      });
      cashAccount.updatedAt = new Date();
      cashAccount.syncVersion += 1;
      await cashAccount.save();
    }

    // If advance payment, reverse customer advanceBalance
    if (record.type === 'ADVANCE_PAYMENT' && record.customerId) {
      const Customer = (await import('../models/Customer')).default;
      const customer = await Customer.findById(record.customerId);
      if (customer) {
        customer.advanceBalance = Math.max(0, (customer.advanceBalance || 0) - record.remittedAmount);
        await customer.save();
      }
    }

    await DailyCashDrawer.findByIdAndDelete(id);
    res.json({ message: 'Record deleted' });
  } catch (error: any) {
    console.error('Error deleting record:', error);
    res.status(500).json({ error: error.message || 'Failed to delete' });
  }
};
