import AssetAccount, { IAssetAccount, ITransaction } from '../models/AssetAccount.js';
import Sale from '../models/Sale.js';
import Payment from '../models/Payment.js';
import Customer from '../models/Customer.js';
import mongoose from 'mongoose';
import { buildTransactionDescription } from './paymentService.js';

export type AccountType = string;

const BANK_CHANNELS = new Set([
  'BPI', 'BDO', 'METROBANK', 'AUB', 'LANDBANK', 'PNB', 'RCBC', 'SECURITY BANK',
  'UNIONBANK', 'CHINABANK', 'EASTWEST', 'PSBANK', 'CHECK', 'OTHER', 'OTHER_BANK'
]);
const ONLINE_CHANNELS = new Set(['GCASH', 'BPI ONLINE', 'AUB ONLINE', 'MAYA']);

const mapPaymentChannelToAccount = (channel: string): AccountType => {
  const upper = String(channel || '').trim().toUpperCase();
  if (upper === 'CASH') return 'CASH';
  if (BANK_CHANNELS.has(upper)) return 'CHECK';
  if (ONLINE_CHANNELS.has(upper)) return 'GCASH';
  return 'CHECK';
};

const recalculateBalance = (transactions: ITransaction[] = []): number =>
  transactions.reduce((sum, tx) => sum + (tx.type === 'CREDIT' ? tx.amount : -tx.amount), 0);

const STANDARD_ACCOUNT_TYPES: AccountType[] = ['CASH', 'CHECK', 'GCASH', 'BANK'];

const normalizePaymentChannels = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

// --- INCREMENTAL BACKFILL ---
// Runs ONCE per server restart (at startup via initializeAssetAccounts).
// Finds payments whose _id is NOT yet referenced in any account transactions
// and adds only those missing entries. Safe for accounts with existing data.
let backfillRanOnce = false;

export async function runOneTimeBackfillIfNeeded(): Promise<void> {
  if (backfillRanOnce) return;
  backfillRanOnce = true;

  try {
    console.log('[AssetAccounts] Checking for missing payment transactions...');

    // 1. Collect all payment IDs already in any account transactions
    const allAccounts = await AssetAccount.find().lean();
    const accountDocs = new Map<string, any>();
    for (const a of allAccounts as any[]) {
      const txs = Array.isArray(a.transactions) ? a.transactions : [];
      accountDocs.set((a as any).accountType, { ...(a as any), transactions: txs });
    }

    const existingPaymentIds = new Set<string>();
    for (const a of accountDocs.values()) {
      for (const tx of a.transactions) {
        const refId = String((tx as any)?.referenceId || '');
        if (refId && String((tx as any)?.referenceType || '').toLowerCase() === 'payment') {
          existingPaymentIds.add(refId);
        }
      }
    }

    // 2. Fetch all non-deleted payments
    const payments = await Payment.find({ isDeleted: false })
      .sort({ paymentDate: 1, createdAt: 1 })
      .lean();

    // 3. Find payments not yet in any account
    const missingPayments = (payments as any[]).filter(
      (p) => !existingPaymentIds.has(String(p._id))
    );

    if (missingPayments.length === 0) {
      console.log(`[AssetAccounts] Backfill: all ${payments.length} payments already recorded.`);
      return;
    }

    console.log(`[AssetAccounts] Backfill: found ${missingPayments.length} missing out of ${payments.length} total payments.`);

    // 4. Customer names for missing payments
    const customerIds = Array.from(new Set(
      missingPayments.map((p: any) => p.customerId?.toString?.() || p.customerId).filter(Boolean)
    )).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));

    const customers = customerIds.length > 0
      ? await Customer.find({ _id: { $in: customerIds }, isDeleted: false }).select('_id name').lean()
      : [];
    const customerNames = new Map<string, string>(
      (customers as any[]).map((c: any) => [String(c._id), String(c.name || '')])
    );

    // 5. Ensure standard accounts in map
    for (const accountType of STANDARD_ACCOUNT_TYPES) {
      if (!accountDocs.has(accountType)) {
        accountDocs.set(accountType, { accountType, balance: 0, transactions: [], syncVersion: 0 });
      }
    }

    // 6. Add missing transactions to buckets in memory
    const changedAccounts = new Set<string>();

    for (const payment of missingPayments) {
      const paymentId = String(payment._id);
      const customerName = customerNames.get(
        String(payment.customerId?.toString?.() || payment.customerId || '')
      );
      const paymentDate = payment.paymentDate || payment.createdAt || new Date();
      const channels = normalizePaymentChannels(payment.paymentChannels);

      for (const ch of channels) {
        const amount = Number(ch?.amount || 0);
        if (amount <= 0) continue;
        const accountType = mapPaymentChannelToAccount(ch.channel);
        const description = buildTransactionDescription(
          String(ch.channel || ''), customerName, ch.referenceNumber, ch.accountName
        );
        accountDocs.get(accountType)!.transactions.push({
          date: paymentDate, type: 'CREDIT', amount, description,
          referenceId: new mongoose.Types.ObjectId(paymentId), referenceType: 'Payment',
        });
        changedAccounts.add(accountType);
      }

      // Cash portion
      const cashAmount = Number(payment.cashPayment || 0);
      if (cashAmount > 0) {
        const description = buildTransactionDescription('Cash', customerName);
        accountDocs.get('CASH')!.transactions.push({
          date: paymentDate, type: 'CREDIT', amount: cashAmount, description,
          referenceId: new mongoose.Types.ObjectId(paymentId), referenceType: 'Payment',
        });
        changedAccounts.add('CASH');
      }
    }

    // 7. Save changed accounts — updatedAt = last transaction date (not "now")
    for (const accountType of changedAccounts) {
      const data = accountDocs.get(accountType)!;
      const balance = recalculateBalance(data.transactions);
      const lastTxDate = data.transactions.reduce((latest: Date, tx: any) => {
        const d = new Date(tx.date); return d > latest ? d : latest;
      }, new Date(0));

      await AssetAccount.findOneAndUpdate(
        { accountType },
        { $set: { balance, transactions: data.transactions, updatedAt: lastTxDate, syncVersion: (data.syncVersion || 0) + 1 } },
        { upsert: true, new: true }
      );
      console.log(`[AssetAccounts] Backfill: ${accountType} balance=${balance.toFixed(2)} lastActivity=${lastTxDate.toISOString()}`);
    }

    console.log(`[AssetAccounts] Incremental backfill complete. Updated ${changedAccounts.size} accounts.`);
  } catch (err: any) {
    console.error('[AssetAccounts] Backfill error:', err?.message || err);
    backfillRanOnce = false;
  }
}

export const getAssetAccounts = async (): Promise<IAssetAccount[]> =>
  AssetAccount.find().sort({ accountType: 1 });

export const getAssetAccount = async (accountType: AccountType): Promise<IAssetAccount | null> =>
  AssetAccount.findOne({ accountType });

export const initializeAssetAccounts = async (): Promise<void> => {
  for (const accountType of STANDARD_ACCOUNT_TYPES) {
    const exists = await AssetAccount.findOne({ accountType });
    if (!exists) {
      await AssetAccount.create({ accountType, balance: 0, transactions: [], updatedAt: new Date(), syncVersion: 0 });
    }
  }
  await runOneTimeBackfillIfNeeded();
};

export const updateAccountBalance = async (
  accountType: AccountType, amount: number, type: 'CREDIT' | 'DEBIT',
  description: string, referenceId?: mongoose.Types.ObjectId,
  referenceType?: string, session?: mongoose.ClientSession
): Promise<IAssetAccount | null> => {
  let account = await AssetAccount.findOne({ accountType }).session(session || null);
  if (!account) account = new AssetAccount({ accountType, balance: 0, transactions: [], syncVersion: 0 });
  if (type === 'CREDIT') account.balance += amount; else account.balance -= amount;
  account.transactions.push({ date: new Date(), type, amount, description, referenceId, referenceType });
  account.updatedAt = new Date();
  account.syncVersion += 1;
  await account.save({ session: session || undefined });
  return account;
};

export const getAccountTransactions = async (
  accountType: AccountType, startDate?: Date, endDate?: Date
): Promise<any[]> => {
  const account = await AssetAccount.findOne({ accountType });
  if (!account) return [];

  let transactions: any[] = account.transactions.map((t: any) => t.toObject ? t.toObject() : { ...t });

  if (startDate || endDate) {
    transactions = transactions.filter(t => {
      const d = new Date(t.date);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }

  // Enrich with DR number: referenceId = Payment._id -> Payment.saleId -> Sale.drNumber
  const paymentIds = transactions
    .filter(t => t.referenceType === 'Payment' && t.referenceId)
    .map(t => t.referenceId);

  if (paymentIds.length > 0) {
    const payments = await Payment.find({ _id: { $in: paymentIds } })
      .select('_id saleId siNumber referenceNumber')
      .lean();
    const paymentMap = new Map<string, any>(
      (payments as any[]).map((p: any) => [String(p._id), p])
    );

    const saleIds = payments
      .filter((p: any) => p.saleId)
      .map((p: any) => p.saleId);

    const sales = saleIds.length > 0
      ? await Sale.find({ _id: { $in: saleIds } }).select('_id drNumber').lean()
      : [];
    const saleMap = new Map<string, string>(
      (sales as any[]).map((s: any) => [String(s._id), String(s.drNumber || '')])
    );

    transactions = transactions.map(t => {
      const payment = paymentMap.get(String(t.referenceId || ''));
      if (!payment) return t;
      const drNumber = saleMap.get(String(payment.saleId || '')) || '';
      const paymentRef = payment.siNumber || payment.referenceNumber || '';
      return { ...t, drNumber, paymentRef };
    });
  }

  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const calculateAccountBalance = (openingBalance: number, transactions: ITransaction[]): number =>
  transactions.reduce((balance, tx) =>
    tx.type === 'CREDIT' ? balance + tx.amount : balance - tx.amount, openingBalance);

