import DailyCashDrawer, { IDailyCashDrawer } from '../models/DailyCashDrawer.js';
import { getCashDrawerReport } from './reportService.js';
import AssetAccount from '../models/AssetAccount.js';
import mongoose from 'mongoose';

type CarryOverRecord = {
  date?: Date | string;
  carryOver?: number;
};

const MANILA_TIME_ZONE = 'Asia/Manila';

const manilaDayKey = (value: Date | string): string => {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dt);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
};

const manilaDayRangeUtc = (day: string) => ({
  start: new Date(`${day}T00:00:00.000+08:00`),
  end: new Date(`${day}T23:59:59.999+08:00`),
});

const getLocalDayBounds = (value?: Date | string) => {
  const base = typeof value === 'string'
    ? new Date(`${value}T00:00:00`)
    : value ? new Date(value) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const getPreviousDayBounds = (value?: Date | string) => {
  const { start } = getLocalDayBounds(value);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - 1);
  previousStart.setHours(0, 0, 0, 0);
  const previousEnd = new Date(previousStart);
  previousEnd.setHours(23, 59, 59, 999);
  return { start: previousStart, end: previousEnd };
};

export const resolvePreviousDayCarryOver = (records: CarryOverRecord[] = []): number => {
  if (!records.length) return 0;
  const latest = [...records]
    .filter((record) => record?.date)
    .sort((left, right) => new Date(right.date as Date | string).getTime() - new Date(left.date as Date | string).getTime())[0];
  return Math.max(0, Number(latest?.carryOver || 0));
};

export const calculateEffectiveOpeningBalance = (
  carryOver: number,
  openingAdjustments: Array<{ date?: Date | string; remittedAmount?: number }> = []
): number => {
  const totalAdjustments = openingAdjustments.reduce((sum, adjustment) => {
    const amount = Number(adjustment?.remittedAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    return sum + amount;
  }, 0);

  return Math.max(0, Number(carryOver || 0) + totalAdjustments);
};

export const getLastClosedDay = async (cashierId: string): Promise<IDailyCashDrawer | null> => {
  return DailyCashDrawer.findOne({
    cashierId: new mongoose.Types.ObjectId(cashierId),
    type: 'CLOSE_DAY'
  }).sort({ date: -1 }).lean();
};

export const getOpeningBalance = async (cashierId: string, asOfDate?: Date | string): Promise<{ openingBalance: number; _debug: any }> => {
  const targetKey = manilaDayKey(asOfDate ?? new Date());
  if (!targetKey) return { openingBalance: 0, _debug: { error: 'Invalid date' } };
  const targetRange = manilaDayRangeUtc(targetKey);
  const cashierOid = new mongoose.Types.ObjectId(cashierId);

  console.log(`[DEBUG-OPENING] ====== getOpeningBalance START (v3: WIDEST-DIAG) ======`);
  console.log(`[DEBUG-OPENING] cashierId=${cashierId} asOfDate=${String(asOfDate ?? 'NOW')}`);
  console.log(`[DEBUG-OPENING] targetKey=${targetKey} targetRange.start=${targetRange.start.toISOString()} targetRange.end=${targetRange.end.toISOString()}`);

  const last20Close = await DailyCashDrawer.find({
    cashierId: cashierOid,
    type: 'CLOSE_DAY'
  }).sort({ date: -1 }).limit(20).lean();

  const last20Remit = await DailyCashDrawer.find({
    cashierId: cashierOid,
    type: 'REMITTANCE'
  }).sort({ date: -1 }).limit(20).lean();

  console.log(`[DEBUG-OPENING] last20Close count=${last20Close.length} last20Remit count=${last20Remit.length}`);
  last20Close.forEach((r: any, i: number) => {
    console.log(`[DEBUG-OPENING]   last20Close[${i}]: FULL={ date=${new Date(r.date).toISOString()} manilaDay=${manilaDayKey(r.date)} openingBalance=${r.openingBalance} closingBalance=${r.closingBalance} carryOver=${r.carryOver} remittedAmount=${r.remittedAmount} notes=${String(r.notes || '').slice(0,50)} }`);
  });
  last20Remit.forEach((r: any, i: number) => {
    console.log(`[DEBUG-OPENING]   last20Remit[${i}]: FULL={ date=${new Date(r.date).toISOString()} manilaDay=${manilaDayKey(r.date)} openingBalance=${r.openingBalance} closingBalance=${r.closingBalance} carryOver=${r.carryOver} remittedAmount=${r.remittedAmount} notes=${String(r.notes || '').slice(0,50)} }`);
  });

  const lastClose = last20Close.find((r: any) => r && r.date && (manilaDayKey(r.date) < targetKey)) || null;
  const lastRemitRaw = last20Remit.find((r: any) => r && r.date && (manilaDayKey(r.date) < targetKey) && (r.carryOver !== undefined && r.carryOver !== null && Number(r.carryOver) > 0)) || null;
  const lastRemitFallback = last20Remit.find((r: any) => r && r.date && (manilaDayKey(r.date) < targetKey) && (r.closingBalance !== undefined && r.closingBalance !== null && Number(r.closingBalance) > 0)) || null;
  const lastRemit = lastRemitRaw || lastRemitFallback;

  console.log(`[DEBUG-OPENING] lastClose selected: type=${lastClose?.type} date=${lastClose ? new Date(lastClose.date).toISOString() : 'NULL'} carryOver=${lastClose?.carryOver}`);
  console.log(`[DEBUG-OPENING] lastRemit selected: type=${lastRemit?.type} date=${lastRemit ? new Date(lastRemit.date).toISOString() : 'NULL'} carryOver=${lastRemit?.carryOver} closingBalance=${(lastRemit as any)?.closingBalance}`);

  const candidates: CarryOverRecord[] = [];
  if (lastClose) {
    candidates.push(lastClose as CarryOverRecord);
  }
  if (lastRemit) {
    const remitAsAny = lastRemit as any;
    if (remitAsAny.carryOver !== undefined && remitAsAny.carryOver !== null && Number(remitAsAny.carryOver) > 0) {
      candidates.push(lastRemit as CarryOverRecord);
    } else if (remitAsAny.closingBalance !== undefined && remitAsAny.closingBalance !== null && Number(remitAsAny.closingBalance) > 0) {
      candidates.push({ date: remitAsAny.date, carryOver: Number(remitAsAny.closingBalance) });
    }
  }

  console.log(`[DEBUG-OPENING] carryOverCandidatesCount=${candidates.length}`);
  candidates.forEach((c, i) => {
    console.log(`[DEBUG-OPENING]   candidate[${i}] type=${(c as any).type} date=${new Date(c.date as Date | string).toISOString()} carryOver=${c.carryOver}`);
  });
  const carryOver = resolvePreviousDayCarryOver(candidates);
  console.log(`[DEBUG-OPENING] carryOverFinal=${carryOver}`);

  const openingAdjustmentsRaw = await DailyCashDrawer.find({
    cashierId: cashierOid,
    type: 'OPENING_ADJUST'
  }).sort({ date: -1 }).limit(50).lean();
  console.log(`[DEBUG-OPENING] OPENING_ADJUST last 50 count=${openingAdjustmentsRaw.length}`);
  openingAdjustmentsRaw.forEach((r: any, i) => {
    const inManila = manilaDayKey(r.date) === targetKey;
    console.log(`[DEBUG-OPENING]   adj[${i}] date=${new Date(r.date).toISOString()} amount=${r.remittedAmount} manilaDay=${manilaDayKey(r.date)} === targetKey? ${inManila}`);
  });
  const openingAdjustments = openingAdjustmentsRaw.filter(
    (r: any) => manilaDayKey(r.date) === targetKey
  ) as Array<{ date?: Date | string; remittedAmount?: number }>;

  const totalAdj = openingAdjustments.reduce((s: number, a: any) => s + (Number(a?.remittedAmount || 0)), 0);
  const finalOpening = calculateEffectiveOpeningBalance(carryOver, openingAdjustments);
  console.log(`[DEBUG-OPENING] sumOfOpeningAdjustmentsToday=${totalAdj} FINAL_OPENING=${finalOpening}`);
  console.log(`[DEBUG-OPENING] ====== getOpeningBalance END ======`);

  const _debug = {
    targetKey,
    targetRangeStart: targetRange.start.toISOString(),
    targetRangeEnd: targetRange.end.toISOString(),
    lastClose: lastClose ? { date: new Date(lastClose.date).toISOString(), type: (lastClose as any).type, carryOver: (lastClose as any).carryOver, openingBalance: (lastClose as any).openingBalance, closingBalance: (lastClose as any).closingBalance } : null,
    lastRemit: lastRemit ? { date: new Date(lastRemit.date).toISOString(), type: (lastRemit as any).type, carryOver: (lastRemit as any).carryOver } : null,
    carryOver,
    carryOverCandidates: candidates.map((c: any) => ({ date: new Date(c.date).toISOString(), type: c.type, carryOver: c.carryOver })),
    last20Close: last20Close.map((c: any) => ({ date: new Date(c.date).toISOString(), carryOver: c.carryOver, openingBalance: c.openingBalance, closingBalance: c.closingBalance, notes: c.notes })),
    last20RemitWithCarryOver: last20Remit.filter((r: any) => r.carryOver !== undefined && r.carryOver !== null).map((r: any) => ({ date: new Date(r.date).toISOString(), carryOver: r.carryOver, remittedAmount: r.remittedAmount })),
    allOpeningAdjustmentsLast50: openingAdjustmentsRaw.map((r: any) => ({ date: new Date(r.date).toISOString(), manilaDayKey: manilaDayKey(r.date), remittedAmount: r.remittedAmount, openingBalance: r.openingBalance })),
    todayOpeningAdjustmentsCount: openingAdjustments.length,
    todayOpeningAdjustmentsTotal: totalAdj,
    finalOpening
  };

  return { openingBalance: finalOpening, _debug };
};

/**
 * Helper: update asset account balance (no session, direct save)
 */
async function creditDebitAccount(accountType: string, amount: number, type: 'CREDIT' | 'DEBIT', description: string, refId?: any, refType?: string) {
  let account = await AssetAccount.findOne({ accountType });
  if (!account) {
    account = new AssetAccount({ accountType, balance: 0, transactions: [], syncVersion: 0 });
  }
  if (type === 'CREDIT') account.balance += amount;
  else account.balance -= amount;
  account.transactions.push({ date: new Date(), type, amount, description, referenceId: refId, referenceType: refType });
  account.updatedAt = new Date();
  account.syncVersion += 1;
  await account.save();
}

/**
 * Remit cash — up to 5x per day
 * After remit, carry-over = cashOnHand - totalRemitted (becomes next day opening)
 */
export const remitCash = async (
  cashierId: string,
  amount: number,
  notes: string,
  userId: string
): Promise<IDailyCashDrawer> => {
  if (amount <= 0) throw new Error('Remittance amount must be greater than zero');

  const today = new Date();
  const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today); endOfDay.setHours(23, 59, 59, 999);

  const todayCount = await DailyCashDrawer.countDocuments({
    cashierId: new mongoose.Types.ObjectId(cashierId),
    type: 'REMITTANCE',
    date: { $gte: startOfDay, $lte: endOfDay }
  });
  if (todayCount >= 5) throw new Error('Maximum 5 remittances per day reached');

  const { User } = await import('../models/User');
  const user = await User.findById(cashierId).lean();
  const cashierName = user ? (user as any).fullName || (user as any).username : 'Unknown';

  // Get current opening balance
  const currentOpening = await getOpeningBalance(cashierId);

  // Get today's cash drawer report to know cash on hand
  const report = await getCashDrawerReport(cashierId, today, currentOpening);

  // Calculate total remitted today (including this new one)
  const prevRemittances = await DailyCashDrawer.find({
    cashierId: new mongoose.Types.ObjectId(cashierId),
    type: 'REMITTANCE',
    date: { $gte: startOfDay, $lte: endOfDay }
  }).lean();
  const prevRemitted = prevRemittances.reduce((s, r) => s + (r.remittedAmount || 0), 0);
  const totalRemittedAfter = prevRemitted + amount;
  const carryOver = Math.max(0, (report.cashOnHand || report.closingBalance || 0) - totalRemittedAfter);

  // Save remittance record with carry-over
  const record = new DailyCashDrawer({
    date: new Date(),
    type: 'REMITTANCE',
    cashierId: new mongoose.Types.ObjectId(cashierId),
    cashierName,
    remittedAmount: amount,
    closingBalance: report.cashOnHand || report.closingBalance || 0,
    carryOver,
    notes,
    closedAt: new Date(),
    closedBy: new mongoose.Types.ObjectId(userId)
  });
  await record.save();

  // DEBIT CASH, CREDIT BANK (no session — works on standalone MongoDB)
  await creditDebitAccount('CASH', amount, 'DEBIT',
    `Cash remittance #${todayCount + 1} (${cashierName})`,
    record._id, 'Remittance');
  await creditDebitAccount('BANK', amount, 'CREDIT',
    `Cash remittance #${todayCount + 1} from ${cashierName}`,
    record._id, 'Remittance');

  return record;
};

/**
 * Close the day — once per cashier per day
 */
export const closeDay = async (
  cashierId: string,
  date: string,
  openingBalance: number,
  notes: string,
  closedByUserId: string,
  actualCashCount: number = 0,
  zeroCarryOver: boolean = false
): Promise<IDailyCashDrawer> => {
  const targetKey = manilaDayKey(date);
  if (!targetKey) throw new Error('Invalid date');
  const { start: startOfDay, end: endOfDay } = manilaDayRangeUtc(targetKey);

  const existing = await DailyCashDrawer.findOne({
    cashierId: new mongoose.Types.ObjectId(cashierId),
    type: 'CLOSE_DAY',
    date: { $gte: startOfDay, $lte: endOfDay }
  });
  if (existing) throw new Error('This day has already been closed for this cashier');

  const report = await getCashDrawerReport(cashierId, targetKey, openingBalance);

  // Sum today's remittances
  const todayRemittances = await DailyCashDrawer.find({
    cashierId: new mongoose.Types.ObjectId(cashierId),
    type: 'REMITTANCE',
    date: { $gte: startOfDay, $lte: endOfDay }
  }).lean();
  const totalRemitted = todayRemittances.reduce((s, r) => s + (r.remittedAmount || 0), 0);

  // Expected math closing balance (for audit)
  const expectedClosing = report.closingBalance;

  // Actual cash count from user's physical count (NEW!)
  const actual = Number(actualCashCount || 0);

  // Over/Short = actual - expected (NEGATIVE when short/actual is less)
  const overShort = actual - expectedClosing;

  // Carry-over for next day opening:
  // If user opted ZERO CARRY-OVER (all cash removed from drawer) → 0
  // Otherwise → use ACTUAL counted cash (not math!) — that's what's physically left in the drawer!
  const carryOver = zeroCarryOver ? 0 : Math.max(0, actual);

  const record = new DailyCashDrawer({
    date: new Date(`${targetKey}T23:59:59.999+08:00`),
    type: 'CLOSE_DAY',
    cashierId: new mongoose.Types.ObjectId(cashierId),
    cashierName: report.cashierName,
    openingBalance: report.openingBalance,
    cashSales: report.cashSales,
    checkPayments: report.checkPayments,
    onlinePayments: report.onlinePayments,
    totalSales: report.totalSales,
    expenses: report.expenses,
    closingBalance: expectedClosing,
    actualCashCount: actual,
    overShort,
    remittedAmount: totalRemitted,
    carryOver,
    notes,
    closedAt: new Date(),
    closedBy: new mongoose.Types.ObjectId(closedByUserId)
  });
  console.log(`[DEBUG-CLOSE] closeDay: cashierId=${cashierId} date=${targetKey} opening=${report.openingBalance} expectedClosing=${expectedClosing} actual=${actual} overShort=${overShort} totalRemitted=${totalRemitted} carryOver=${carryOver} zeroCarryOver=!!${zeroCarryOver}`);
  await record.save();
  return record;
};

export const getDailyRecords = async (filters: {
  cashierId?: string; startDate?: string; endDate?: string; type?: string;
} = {}): Promise<IDailyCashDrawer[]> => {
  const query: any = {};
  if (filters.cashierId) query.cashierId = new mongoose.Types.ObjectId(filters.cashierId);
  if (filters.type) query.type = filters.type;
  if (filters.startDate || filters.endDate) {
    query.date = {};
    if (filters.startDate) {
      const sk = manilaDayKey(filters.startDate);
      if (sk) query.date.$gte = manilaDayRangeUtc(sk).start;
    }
    if (filters.endDate) {
      const ek = manilaDayKey(filters.endDate);
      if (ek) query.date.$lte = manilaDayRangeUtc(ek).end;
    }
  }
  return DailyCashDrawer.find(query).sort({ date: -1 }).lean();
};

/**
 * Accept advance payment from a customer — credits CASH, adds to customer advanceBalance
 */
export const acceptAdvancePayment = async (
  cashierId: string,
  customerId: string,
  amount: number,
  notes: string,
  userId: string,
  paymentChannel: string = 'CASH',
  paymentAccountName: string = '',
  paymentReference: string = ''
): Promise<IDailyCashDrawer> => {
  if (amount <= 0) throw new Error('Amount must be greater than zero');

  const Customer = (await import('../models/Customer')).default;
  const { User } = await import('../models/User');

  const customer = await Customer.findOne({ _id: customerId, isDeleted: false });
  if (!customer) throw new Error('Customer not found');

  const user = await User.findById(cashierId).lean();
  const cashierName = user ? (user as any).fullName || (user as any).username : 'Unknown';

  const normalizedChannel = String(paymentChannel || 'CASH').trim().toUpperCase();
  const targetAccount =
    normalizedChannel === 'GCASH' ? 'GCASH'
      : (normalizedChannel === 'BPI ONLINE' || normalizedChannel === 'AUB ONLINE' || normalizedChannel === 'MAYA') ? 'BANK'
      : normalizedChannel === 'CHECK' ? 'CHECK'
      : 'CASH';

  const detailSuffix = [
    paymentAccountName ? `acct:${paymentAccountName}` : '',
    paymentReference ? `ref:${paymentReference}` : ''
  ].filter(Boolean).join(' | ');

  await creditDebitAccount(
    targetAccount,
    amount,
    'CREDIT',
    `Advance payment from ${customer.name} [${normalizedChannel}]${detailSuffix ? ` | ${detailSuffix}` : ''}`,
    undefined,
    'AdvancePayment'
  );

  // Add to customer's advance balance
  customer.advanceBalance = (customer.advanceBalance || 0) + amount;
  customer.updatedBy = new mongoose.Types.ObjectId(userId);
  await customer.save();

  // Record in daily cash drawer
  const record = new DailyCashDrawer({
    date: new Date(),
    type: 'ADVANCE_PAYMENT',
    cashierId: new mongoose.Types.ObjectId(cashierId),
    cashierName,
    customerId: new mongoose.Types.ObjectId(customerId),
    customerName: customer.name,
    remittedAmount: amount,
    paymentChannel: normalizedChannel,
    paymentAccountName: paymentAccountName || '',
    paymentReference: paymentReference || '',
    notes: notes || `Advance payment from ${customer.name}`,
    closedAt: new Date(),
    closedBy: new mongoose.Types.ObjectId(userId)
  });
  await record.save();
  return record;
};

/**
 * Adjust opening balance — add extra cash with notes
 */
export const adjustOpeningBalance = async (
  cashierId: string,
  amount: number,
  notes: string,
  userId: string,
  targetDate?: Date | string
): Promise<IDailyCashDrawer> => {
  try {
    if (amount <= 0) throw new Error('Amount must be greater than zero');
    if (!cashierId) throw new Error('cashierId is required');
    if (!userId) throw new Error('userId is required');

    const { User } = await import('../models/User');
    const user = await User.findById(cashierId).lean();
    const cashierName = user ? (user as any).fullName || (user as any).username : 'Unknown';
    const openingResult = await getOpeningBalance(cashierId, targetDate);
    const currentOpening = Number(openingResult.openingBalance || 0);

    const nowOrTarget = targetDate ? new Date(`${manilaDayKey(targetDate)}T12:00:00.000+08:00`) : new Date();
    const totalNew = currentOpening + Number(amount || 0);
    console.log(`[DEBUG-ADJUST] STEP 1 PRE-SAVE: cashierId=${cashierId} targetDate=${String(targetDate || 'TODAY')} currentOpening=${currentOpening} + amount=${amount} => NEW_TOTAL_OPENING=${totalNew}  will save as date=${nowOrTarget.toISOString()} (typeof date=${typeof nowOrTarget})`);

    try {
      await creditDebitAccount('CASH', amount, 'CREDIT',
        `Opening balance adjustment: ${notes || 'Additional cash'}`, undefined, 'OpeningAdjust');
      console.log(`[DEBUG-ADJUST] STEP 2: creditDebitAccount OK`);
    } catch (creditErr: any) {
      console.warn(`[DEBUG-ADJUST] STEP 2 WARN: creditDebitAccount failed (non-fatal):`, creditErr?.message || creditErr);
    }

    const rawData: any = {
      date: nowOrTarget,
      type: 'OPENING_ADJUST',
      cashierId: new mongoose.Types.ObjectId(cashierId),
      cashierName,
      openingBalance: totalNew,
      remittedAmount: Number(amount || 0),
      notes: notes || 'Opening balance adjustment',
      closedAt: nowOrTarget,
      closedBy: new mongoose.Types.ObjectId(userId)
    };
    console.log(`[DEBUG-ADJUST] STEP 3: About to instantiate DailyCashDrawer with rawData keys=${Object.keys(rawData).join(',')} rawData.openingBalance type=${typeof rawData.openingBalance} value=${rawData.openingBalance}`);

    const record = new DailyCashDrawer(rawData);
    console.log(`[DEBUG-ADJUST] STEP 4: Document instantiated. isNew=${record.isNew} record.openingBalance=${record.openingBalance} record.remittedAmount=${record.remittedAmount}`);

    // Explicit validation BEFORE save
    try {
      await record.validate();
      console.log(`[DEBUG-ADJUST] STEP 5: Mongoose document validation PASSED`);
    } catch (valErr: any) {
      console.error(`[DEBUG-ADJUST] STEP 5 FATAL: Mongoose document validation FAILED!`, valErr?.errors || valErr?.message || valErr);
      console.trace('[DEBUG-ADJUST] VALIDATION STACK TRACE');
      throw valErr;
    }

    const saved = await record.save();
    console.log(`[DEBUG-ADJUST] STEP 6: OPENING_ADJUST SAVED SUCCESSFULLY! id=${saved._id} date=${saved.date ? new Date(saved.date as any).toISOString() : 'NULL'} embedded_openingBalance=${saved.openingBalance} remittedAmount=${saved.remittedAmount} cashierId=${saved.cashierId}`);
    return saved;
  } catch (topErr: any) {
    console.error(`[DEBUG-ADJUST] TOP-LEVEL FATAL ERROR in adjustOpeningBalance:`, { message: topErr?.message, name: topErr?.name, stack: topErr?.stack, errors: topErr?.errors });
    console.trace('[DEBUG-ADJUST] TOP-LEVEL STACK TRACE');
    throw topErr;
  }
};

/**
 * Reset cash drawer history used for carry-over and remittance history.
 * This deletes REMITTANCE and CLOSE_DAY records for the selected cashier.
 */
export const resetCashDrawerHistory = async (
  cashierId: string
): Promise<{ deletedCount: number }> => {
  const result = await DailyCashDrawer.deleteMany({
    cashierId: new mongoose.Types.ObjectId(cashierId),
    type: { $in: ['REMITTANCE', 'CLOSE_DAY'] }
  });

  return { deletedCount: result.deletedCount || 0 };
};
