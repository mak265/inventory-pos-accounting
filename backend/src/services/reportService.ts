import Sale from '../models/Sale.js';
import Payment from '../models/Payment.js';
import Customer from '../models/Customer.js';
import { Types } from 'mongoose';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface DateRange {
  startDate?: Date;
  endDate?: Date;
}

interface CustomerSalesSummary {
  customerId: string;
  customerName: string;
  totalAmount: number;
  totalPaid: number;
  totalReceivable: number;
}

interface SalesSummary {
  totalSales: number;
  totalPaid: number;
  totalReceivable: number;
  customerSummaries: CustomerSalesSummary[];
}

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

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const derivePaymentProgress = (
  saleTotal: number,
  payments: Array<{ amountDue?: number; totalPaid?: number; paymentDate?: Date; createdAt?: Date }>
) => {
  const grossTotal = round2(saleTotal || 0);
  if (!payments || payments.length === 0) {
    return { paid: 0, effectiveDue: grossTotal, balance: grossTotal };
  }

  const sorted = [...payments].sort((a, b) => {
    const aTime = new Date(a.paymentDate || a.createdAt || 0).getTime();
    const bTime = new Date(b.paymentDate || b.createdAt || 0).getTime();
    return aTime - bTime;
  });

  let paidBefore = 0;
  let latestImpliedDue = 0;

  for (const p of sorted) {
    const rowPaid = Number(p.totalPaid || 0);
    const amountDue = Number(p.amountDue);
    if (rowPaid > 0 && Number.isFinite(amountDue) && amountDue >= 0) {
      latestImpliedDue = round2(amountDue + paidBefore);
    }
    paidBefore = round2(paidBefore + rowPaid);
  }

  const paid = round2(paidBefore);
  const effectiveDue = round2(latestImpliedDue > 0 ? Math.max(latestImpliedDue, paid) : Math.max(grossTotal, paid));
  const balance = round2(Math.max(0, effectiveDue - paid));
  return { paid, effectiveDue, balance };
};

/**
 * Calculate sales summary with customer totals and receivables
 * Validates: Requirements 9.1, 9.2
 */
export async function getSalesSummary(dateRange?: DateRange): Promise<SalesSummary> {
  const query: any = { status: 'COMPLETED' };
  
  if (dateRange?.startDate || dateRange?.endDate) {
    query.saleDate = {};
    if (dateRange.startDate) {
      query.saleDate.$gte = dateRange.startDate;
    }
    if (dateRange.endDate) {
      query.saleDate.$lte = dateRange.endDate;
    }
  }

  // Get all completed sales in date range
  const sales = await Sale.find(query).lean();
  
  // Calculate total sales — line items only, exclude delivery/toll fees (not actual sales)
  const totalSales = sales.reduce((sum, sale) => {
    const lineItemsTotal = (sale.lineItems || []).reduce((s: number, li: any) => s + (li.lineTotal || 0), 0);
    return sum + lineItemsTotal;
  }, 0);
  
  // Total amount including fees — this is what customers owe
  const totalAmountWithFees = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
  
  // Get all payments for these sales
  const saleIds = sales.map(sale => sale._id);

  if (saleIds.length === 0) {
    return {
      totalSales,
      totalPaid: 0,
      totalReceivable: totalAmountWithFees,
      customerSummaries: [],
    };
  }

  const payments = await Payment.find({ saleId: { $in: saleIds }, isDeleted: false }).lean();
  
  // Group payments per sale for chronological due reconstruction.
  const paymentMap = new Map<string, Array<{ amountDue?: number; totalPaid?: number; paymentDate?: Date; createdAt?: Date }>>();
  for (const p of payments) {
    const sid = p.saleId.toString();
    if (!paymentMap.has(sid)) paymentMap.set(sid, []);
    paymentMap.get(sid)!.push({
      totalPaid: Number(p.totalPaid || 0),
      amountDue: typeof p.amountDue === 'number' ? p.amountDue : undefined,
      paymentDate: p.paymentDate,
      createdAt: p.createdAt
    });
  }

  let totalPaid = 0;
  
  // Calculate per-customer summaries
  const customerMap = new Map<string, CustomerSalesSummary>();
  
  for (const sale of sales) {
    const customerId = sale.customerId ? sale.customerId.toString() : 'walk-in';
    
    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customerId,
        customerName: sale.customerName || 'Walk-in Customer',
        totalAmount: 0,
        totalPaid: 0,
        totalReceivable: 0,
      });
    }
    
    const summary = customerMap.get(customerId)!;
    const progress = derivePaymentProgress(sale.totalAmount || 0, paymentMap.get(sale._id.toString()) || []);
    const effectiveDue = progress.effectiveDue;
    summary.totalAmount = round2(summary.totalAmount + effectiveDue);
    summary.totalPaid = round2(summary.totalPaid + progress.paid);
    totalPaid = round2(totalPaid + progress.paid);
  }
  
  // Calculate receivables
  const customerSummaries = Array.from(customerMap.values()).map(summary => ({
    ...summary,
    totalReceivable: round2(Math.max(0, summary.totalAmount - summary.totalPaid)),
  }));

  const totalReceivable = round2(Math.max(0, customerSummaries.reduce((sum, s) => sum + s.totalReceivable, 0)));
  
  return {
    totalSales,
    totalPaid,
    totalReceivable,
    customerSummaries,
  };
}

/**
 * Get per-customer sales report
 * Validates: Requirements 9.1
 */
export async function getCustomerSalesReport(customerId: string, dateRange?: DateRange) {
  const query: any = {
    status: 'COMPLETED',
  };
  
  if (Types.ObjectId.isValid(customerId)) {
    const customer = await Customer.findById(customerId).select('name').lean();
    const customerName = customer?.name;

    query.$or = [
      { customerId: new Types.ObjectId(customerId) }
    ];

    if (customerName) {
      query.$or.push({ customerName: new RegExp(`^${escapeRegExp(customerName)}$`, 'i') });
    }
  } else {
    query.customerName = new RegExp(`^${escapeRegExp(customerId)}$`, 'i');
  }
  
  if (dateRange?.startDate || dateRange?.endDate) {
    query.saleDate = {};
    if (dateRange.startDate) {
      query.saleDate.$gte = dateRange.startDate;
    }
    if (dateRange.endDate) {
      query.saleDate.$lte = dateRange.endDate;
    }
  }

  const sales = await Sale.find(query).lean();
  const saleIds = sales.map(sale => sale._id);

  if (saleIds.length === 0) {
    return {
      customerId,
      customerName: '',
      totalAmount: 0,
      totalPaid: 0,
      totalReceivable: 0,
      sales: [],
    };
  }

  const payments = await Payment.find({ saleId: { $in: saleIds }, isDeleted: false }).lean();
  
  const totalAmount = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

  // Build payment map by saleId for chronological due reconstruction.
  const paymentMap = new Map<string, Array<{ amountDue?: number; totalPaid?: number; paymentDate?: Date; createdAt?: Date }>>();
  for (const p of payments) {
    const sid = p.saleId.toString();
    if (!paymentMap.has(sid)) paymentMap.set(sid, []);
    paymentMap.get(sid)!.push({
      totalPaid: Number(p.totalPaid || 0),
      amountDue: typeof p.amountDue === 'number' ? p.amountDue : undefined,
      paymentDate: p.paymentDate,
      createdAt: p.createdAt
    });
  }

  const saleRows = sales.map(sale => {
    const progress = derivePaymentProgress(sale.totalAmount || 0, paymentMap.get(sale._id.toString()) || []);
    const effectiveDue = progress.effectiveDue;
    const balance = progress.balance;
    return {
      _id: sale._id,
      drNumber: sale.drNumber,
      saleDate: sale.saleDate,
      totalAmount: sale.totalAmount,
      totalPaid: progress.paid,
      _effectiveDue: effectiveDue,
      _balance: balance,
      _paymentStatus: progress.paid <= 0 ? 'UNPAID' : balance > 0 ? 'PARTIAL' : 'PAID',
      lineItems: sale.lineItems,
    };
  });

  const totalPaid = round2(saleRows.reduce((sum, row) => sum + (row.totalPaid || 0), 0));
  const totalReceivable = round2(Math.max(0, saleRows.reduce((sum, row) => sum + (row._balance || 0), 0)));
  
  const customer = Types.ObjectId.isValid(customerId)
    ? await Customer.findById(customerId).select('name').lean()
    : null;
  const customerName = customer?.name || sales[0]?.customerName || '';

  return {
    customerId,
    customerName,
    totalAmount,
    totalPaid,
    totalReceivable,
    sales: saleRows,
  };
}

interface TopSellingItem {
  productId: string;
  description: string;
  quantitySold: number;
  revenue: number;
  rank: number;
}

/**
 * Get top selling items report
 * Validates: Requirements 9.3
 */
export async function getTopSellingItems(
  dateRange?: DateRange,
  sortBy: 'quantity' | 'revenue' = 'quantity',
  limit: number = 10
): Promise<TopSellingItem[]> {
  const query: any = { status: 'COMPLETED' };
  
  if (dateRange?.startDate || dateRange?.endDate) {
    query.saleDate = {};
    if (dateRange.startDate) {
      query.saleDate.$gte = dateRange.startDate;
    }
    if (dateRange.endDate) {
      query.saleDate.$lte = dateRange.endDate;
    }
  }

  const sales = await Sale.find(query).lean();
  
  // Aggregate by product
  const productMap = new Map<string, { description: string; quantity: number; revenue: number }>();
  
  for (const sale of sales) {
    for (const item of sale.lineItems) {
      const productId = item.productId.toString();
      
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          description: item.description,
          quantity: 0,
          revenue: 0,
        });
      }
      
      const product = productMap.get(productId)!;
      product.quantity += item.quantity;
      product.revenue += item.lineTotal || (item.quantity * item.sellingPrice);
    }
  }
  
  // Convert to array and sort
  const items = Array.from(productMap.entries()).map(([productId, data]) => ({
    productId,
    description: data.description,
    quantitySold: data.quantity,
    revenue: data.revenue,
    rank: 0,
  }));
  
  // Sort by specified criteria
  items.sort((a, b) => {
    if (sortBy === 'quantity') {
      return b.quantitySold - a.quantitySold;
    } else {
      return b.revenue - a.revenue;
    }
  });
  
  // Assign ranks and limit results
  const topItems = items.slice(0, limit);
  topItems.forEach((item, index) => {
    item.rank = index + 1;
  });
  
  return topItems;
}

interface CashDrawerReport {
  cashierId: string;
  cashierName: string;
  openingBalance: number;
  cashSales: number;
  checkPayments: number;
  onlinePayments: number;
  repayments: number;
  receivableCollections: number;
  channelBreakdown: {
    cashOnHand: number;
    gcash: number;
    gcashLouie: number;
    gcashKatrina: number;
    gcashAnicia: number;
    bpiOnline: number;
    aubOnline: number;
    maya: number;
    onlineBanking: number;
    bankAndCheck: number;
    onlineOther: number;
    totalCollections: number;
  };
  totalSales: number;
  expenses: number;
  expenseBreakdown: Array<{ description: string; amount: number; category: string; isPettyCash: boolean }>;
  receivableDetails: Array<{ source: string; date: Date; amount: number; reference?: string; accountName?: string; paymentId?: string; note?: string }>;
  debugSources: {
    meta?: {
      targetDay: string;
      queryStart: Date;
      queryEnd: Date;
      fetchedPayments: number;
      matchedPayments: number;
      fetchedChecks: number;
      matchedChecks: number;
      fetchedAssetAccounts: number;
      totalPaymentDocs?: number;
      totalCheckDocs?: number;
      totalSalesDocs?: number;
      totalAssetTransactions?: number;
      allSourcesEmpty?: boolean;
      probeMarker?: string;
    };
    payments: Array<{ paymentId: string; paymentDate: Date; totalPaid: number; cashPayment: number; channels: Array<{ channel: string; amount: number; accountName?: string; referenceNumber?: string }> }>;
    checks: Array<{ paymentId?: string; receivedDate: Date; amount: number; customerName: string; referenceNumber?: string; accountName?: string; status: string }>;
    assetTransactions: Array<{ accountType: string; date: Date; amount: number; description: string; referenceType?: string }>;
  };
  closingBalance: number;
  cashOnHand: number;
  date: Date;
}

/**
 * Get cash drawer report for a cashier
 */
export async function getCashDrawerReport(
  cashierId: string,
  date: Date | string,
  openingBalance: number = 0
): Promise<CashDrawerReport> {
  const dateInput = typeof date === 'string' ? date.trim() : date;
  const targetDay = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ? dateInput
    : manilaDayKey(dateInput);
  if (!targetDay) {
    throw new Error('Invalid date for cash drawer report');
  }

  const { start: startOfDay, end: endOfDay } = manilaDayRangeUtc(targetDay);
  const queryStart = new Date(startOfDay);
  queryStart.setDate(queryStart.getDate() - 1);
  const queryEnd = new Date(endOfDay);
  queryEnd.setDate(queryEnd.getDate() + 1);
  
  // Get cashier name
  const { User } = await import('../models/User');
  const user = await User.findById(cashierId).lean();
  const cashierName = user ? (user as any).fullName || (user as any).username : 'Unknown';

  const sales = await Sale.find({
    postedBy: new Types.ObjectId(cashierId),
    status: 'COMPLETED',
    postedAt: { $gte: startOfDay, $lte: endOfDay },
  }).lean();

  // Day-based rule: include all payments collected on the selected day,
  // regardless of which user encoded them.
  // CRITICAL FILTER: Only count CUSTOMER INFLOW payments — MUST have customerId set (exclude any vendor/cash-outflow entries that lack customer linkage).
  const payments = await Payment.find({
    isDeleted: false,
    customerId: { $exists: true, $ne: null },
    $or: [
      { paymentDate: { $gte: queryStart, $lte: queryEnd } },
      { createdAt: { $gte: queryStart, $lte: queryEnd } },
      { updatedAt: { $gte: queryStart, $lte: queryEnd } },
    ]
  }).lean();
  const paymentDayValue = (p: any) => p.paymentDate || p.createdAt || p.updatedAt;
  const dayPayments = (payments as any[]).filter((p: any) => {
    if (!paymentDayValue(p)) return false;
    if (manilaDayKey(paymentDayValue(p)) !== targetDay) return false;
    // EXCLUDE any payment that has vendorId/payable/accountType=vendor (all outflows to vendors, cash out paid to suppliers)
    if (p.vendorId || String(p.entity || '').toLowerCase() === 'vendor' || String(p.payableType || '').toLowerCase() === 'vendor') return false;
    // MUST have customerId present (REAL customer inflow)
    if (!p.customerId) return false;
    return true;
  });
  const recentPaymentsForDebug = [...(payments as any[])]
    .sort((a: any, b: any) => {
      const aTime = new Date(paymentDayValue(a) || 0).getTime();
      const bTime = new Date(paymentDayValue(b) || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 20);

  const paymentIds = Array.from(new Set((dayPayments || []).map((p: any) => p._id?.toString?.()).filter(Boolean)));
  const paymentSaleIds = Array.from(new Set((dayPayments || []).map((p: any) => p.saleId?.toString?.()).filter(Boolean)));
  const paymentSales = paymentSaleIds.length > 0
    ? await Sale.find({ _id: { $in: paymentSaleIds } }).select('_id saleDate postedAt').lean()
    : [];
  // 🔴 DOUBLE GUARD FOR dayPayments: Only count payments that are linked to REAL existing Sales (NOT to vendor/fake payments or vendor purchases)
  const validSaleIdForPayments = new Set((paymentSales as any[]).map((s: any) => s._id.toString()));
  const filteredDayPayments = (dayPayments as any[]).filter((p: any) => {
    const sid = p.saleId?.toString?.();
    if (!sid || !validSaleIdForPayments.has(sid)) return false;
    // Also existing vendor/customerId filters
    if (p.vendorId || String(p.entity || '').toLowerCase() === 'vendor' || String(p.payableType || '').toLowerCase() === 'vendor') return false;
    if (!p.customerId) return false;
    return true;
  });
  // Override dayPayments to safe filtered version only
  console.log(
    `[DEBUG-PAYMENTS-FILTER] targetDay=${targetDay} rawDayPayments=${(dayPayments as any[]).length} filteredDayPayments=${filteredDayPayments.length} removedNonSaleOrVendor=${(dayPayments as any[]).length - filteredDayPayments.length}`
  );
  const { default: CheckRecord } = await import('../models/CheckRecord');
  const checkRecords = await CheckRecord.find({
    isDeleted: false,
    // Only count RECEIVED checks (inflow from customers) — exclude issued checks (payable to vendors)
    status: { $nin: ['ISSUED', 'PAID_OUT', 'VOID_ISSUED'] },
    $or: [
      { receivedDate: { $gte: queryStart, $lte: queryEnd } },
      { effectiveDate: { $gte: queryStart, $lte: queryEnd } },
      { createdAt: { $gte: queryStart, $lte: queryEnd } },
    ]
  }).lean();
  const checkDayValue = (c: any) => c.receivedDate || c.effectiveDate || c.createdAt;
  const dayCheckRecords = (checkRecords as any[]).filter((c: any) => {
    if (!checkDayValue(c)) return false;
    if (manilaDayKey(checkDayValue(c)) !== targetDay) return false;
    // Only count CHECKS RECEIVED FROM CUSTOMERS (inflow) — vendor checks issued to suppliers = outflow
    // Must have customerName / customerId populated
    const hasCustomer = c.customerName || c.customerId;
    const isIssuedVendorCheck = !!(c.vendorId || c.issuedToVendor || c.payeeType === 'vendor' || String(c.status || '').toUpperCase() === 'ISSUED');
    if (isIssuedVendorCheck) return false;
    if (!hasCustomer) return false;
    return true;
  });
  const recentChecksForDebug = [...(checkRecords as any[])]
    .sort((a: any, b: any) => {
      const aTime = new Date(checkDayValue(a) || 0).getTime();
      const bTime = new Date(checkDayValue(b) || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 20);
  
  let cashSales = 0;
  let checkPayments = 0;
  let onlinePayments = 0;
  let receivableCollections = 0;
  let gcashCollections = 0;
  let gcashLouie = 0;
  let gcashKatrina = 0;
  let gcashAnicia = 0;
  let bpiOnlineCollections = 0;
  let aubOnlineCollections = 0;
  let mayaCollections = 0;
  let onlineBankingCollections = 0;
  let bankAndCheckCollections = 0;
  let onlineOtherCollections = 0;
  const receivablePaymentIds = new Set<string>();
  const receivableDetails: Array<{ source: string; date: Date; amount: number; reference?: string; accountName?: string; paymentId?: string; note?: string }> = [];

  const BANK_ONLY_CHANNELS = new Set(['BPI', 'BDO', 'METROBANK', 'AUB', 'LANDBANK', 'PNB', 'RCBC', 'SECURITY BANK', 'UNIONBANK', 'CHINABANK', 'EASTWEST', 'PSBANK', 'BPI ONLINE', 'AUB ONLINE', 'MAYA', 'OTHER_BANK', 'BANK']);
  const salesById = new Map<string, any>((paymentSales as any[]).map((s: any) => [s._id.toString(), s]));

  const isCheckLikeChannel = (channel: any) => {
    const channelName = String(channel?.channel || '').trim().toUpperCase();
    if (channelName === 'CHECK') return true;
    if (channel?.effectiveDate) return true;
    return false;
  };

  // Receivables are strictly check payments (old/new receipts).
  for (const payment of filteredDayPayments) {
    const paymentId = payment._id.toString();
    const paymentDate = new Date(paymentDayValue(payment));
    const channels = (payment.paymentChannels || []) as any[];
    let checkTotalForPayment = 0;

    for (const ch of channels) {
      const channel = String(ch.channel || '').trim().toUpperCase();
      const amount = Number(ch.amount || 0);
      if (amount <= 0) continue;

      if (isCheckLikeChannel(ch)) {
        checkPayments += amount;
        checkTotalForPayment += amount;
        receivableDetails.push({
          source: 'PAYMENT_CHECK',
          date: paymentDate,
          amount,
          reference: ch.referenceNumber || '',
          accountName: ch.accountName || '',
          paymentId,
          note: 'Check payment (receivable)'
        });
      } else if (channel === 'GCASH') {
        onlinePayments += amount;
        gcashCollections += amount;
        const accountName = String(ch.accountName || '').toLowerCase();
        if (accountName.includes('louie')) gcashLouie += amount;
        else if (accountName.includes('katrina')) gcashKatrina += amount;
        else if (accountName.includes('anicia')) gcashAnicia += amount;
        else onlineOtherCollections += amount;
      } else if (channel === 'BPI ONLINE') {
        onlinePayments += amount;
        onlineBankingCollections += amount;
        bpiOnlineCollections += amount;
      } else if (channel === 'AUB ONLINE') {
        onlinePayments += amount;
        onlineBankingCollections += amount;
        aubOnlineCollections += amount;
      } else if (channel === 'MAYA') {
        onlinePayments += amount;
        onlineBankingCollections += amount;
        mayaCollections += amount;
      } else if (channel === 'CASH') {
        cashSales += amount;
      } else if (BANK_ONLY_CHANNELS.has(channel)) {
        // Current business rule: bank-tagged payment channels are CHECK-mode collections.
        checkPayments += amount;
        checkTotalForPayment += amount;
        receivableDetails.push({
          source: 'PAYMENT_CHECK_BANK',
          date: paymentDate,
          amount,
          reference: ch.referenceNumber || '',
          accountName: ch.accountName || '',
          paymentId,
          note: `Check payment (${channel})`
        });
      } else {
        // Unknown channels are ignored from active-mode totals.
      }
    }

    // Fallback for legacy rows with totals but no channel breakdown.
    if (channels.length === 0) {
      const cashAmount = Number(payment.cashPayment || 0);
      const chargeAmount = Number(payment.chargePayment || 0);
      if (cashAmount > 0) cashSales += cashAmount;
      // Legacy charge-only rows are ignored in strict cash/check/gcash mode.
    }

    if (checkTotalForPayment > 0) {
      receivableCollections += checkTotalForPayment;
      receivablePaymentIds.add(paymentId);
    }
  }

  // Fallback for old/messy data: if a check record was received today but its payment record
  // was not part of today's fetched payments, count it here based on received day.
  // 🔴 CRITICAL: Exclude vendor-issued checks (Orange Resources / Real Value / Albryan etc = our payments TO suppliers).
  // Verify by checking linked Payment document: must have valid customerId and NO vendor linkage.
  const paymentsById = new Map<string, any>((filteredDayPayments as any[]).map((p: any) => [p._id.toString(), p]));
  const checksByPaymentId = new Map<string, { total: number; latestReceivedDate: Date | null }>();
  let validCustomerDayCheckRecords = [...(dayCheckRecords as any[])];
  try {
    const { default: Payment } = await import('../models/Payment');
    const allCheckPids = Array.from(new Set((dayCheckRecords as any[]).map((c: any) => c.paymentId?.toString?.()).filter(Boolean)));
    const linkedPayments = allCheckPids.length > 0
      ? await Payment.find({ _id: { $in: allCheckPids }, isDeleted: false })
          .select('_id customerId vendorId saleId entity payableType direction')
          .lean()
      : [];
    const validCustPids = new Set<string>();
    // Also pre-fetch saleIds that exist in real Sales table to double-verify customer-issued checks
    const Sale = (await import('../models/Sale')).default;
    const linkedSaleIds = Array.from(new Set((linkedPayments as any[]).map((lp: any) => lp.saleId?.toString?.()).filter(Boolean)));
    const existingSales = linkedSaleIds.length > 0
      ? await Sale.find({ _id: { $in: linkedSaleIds }, isDeleted: false, status: { $in: ['COMPLETED', 'POSTED', 'PARTIAL', 'PAID'] } })
          .select('_id')
          .lean()
      : [];
    const validSaleIdsSet = new Set((existingSales as any[]).map((s: any) => s._id.toString()));
    for (const lp of (linkedPayments as any[])) {
      const hasRealSale = lp.saleId && validSaleIdsSet.has(lp.saleId.toString());
      const hasValidCustomer = !!lp.customerId && !!String(lp.customerId);
      const hasNoVendorFlag = !lp.vendorId
        && String(lp.entity || '').toLowerCase() !== 'vendor'
        && String(lp.payableType || '').toLowerCase() !== 'vendor'
        && String(lp.direction || '').toUpperCase() !== 'OUT';
      // 🔴 DOUBLE GUARD: Must have REAL existing Sale in Sale table + customerId + no vendor linkage
      // This excludes DeliveryReceipt paymentId entries (vendor checks) AND any fake payment entries
      const isCustomerInfl = !!hasRealSale && hasValidCustomer && hasNoVendorFlag;
      if (isCustomerInfl) validCustPids.add(lp._id.toString());
    }
    validCustomerDayCheckRecords = (dayCheckRecords as any[]).filter((c: any) => {
      const pid = c.paymentId?.toString?.();
      return pid && validCustPids.has(pid);
    });
    console.log(
      `[DEBUG-CHECKS-FILTER] targetDay=${targetDay} rawDayChecks=${(dayCheckRecords as any[]).length} ` +
      `linkedPayments=${(linkedPayments as any[]).length} validCustomerPayments=${validCustPids.size} ` +
      `removedVendorIssued=${(dayCheckRecords as any[]).length - validCustomerDayCheckRecords.length}`
    );
    for (const check of validCustomerDayCheckRecords) {
      const paymentId = check.paymentId?.toString?.();
      if (!paymentId) continue;
      const existing = checksByPaymentId.get(paymentId) || { total: 0, latestReceivedDate: null };
      existing.total += check.amount || 0;
      const receivedDate = check.receivedDate ? new Date(check.receivedDate) : null;
      if (receivedDate && (!existing.latestReceivedDate || receivedDate > existing.latestReceivedDate)) {
        existing.latestReceivedDate = receivedDate;
      }
      checksByPaymentId.set(paymentId, existing);
    }
  } catch (filterErr: any) {
    // Safety fallback: cannot import Payment model; keep all dayCheckRecords (fallback behavior)
    validCustomerDayCheckRecords = [...(dayCheckRecords as any[])];
    for (const check of validCustomerDayCheckRecords) {
      const paymentId = check.paymentId?.toString?.();
      if (!paymentId) continue;
      const existing = checksByPaymentId.get(paymentId) || { total: 0, latestReceivedDate: null };
      existing.total += check.amount || 0;
      const receivedDate = check.receivedDate ? new Date(check.receivedDate) : null;
      if (receivedDate && (!existing.latestReceivedDate || receivedDate > existing.latestReceivedDate)) {
        existing.latestReceivedDate = receivedDate;
      }
      checksByPaymentId.set(paymentId, existing);
    }
  }

  for (const [paymentId, checkInfo] of checksByPaymentId.entries()) {
    if (receivablePaymentIds.has(paymentId)) continue;

    const receivedDate = checkInfo.latestReceivedDate;

    if (receivedDate && manilaDayKey(receivedDate) === targetDay) {
      receivableCollections += checkInfo.total || 0;
      checkPayments += checkInfo.total || 0;
      bankAndCheckCollections += checkInfo.total || 0;
      receivablePaymentIds.add(paymentId);
      receivableDetails.push({
        source: 'CHECK_RECORD',
        date: receivedDate,
        amount: checkInfo.total || 0,
        paymentId,
        note: 'Fallback from received check'
      });
    }
  }

  // Use asset-account transactions as source of truth for per-method day totals.
  const AssetAccountModel = (await import('../models/AssetAccount')).default;
  const allAssetAccounts = await AssetAccountModel.find({}).lean();
  const accountTypeUpper = (v: any) => String(v || '').trim().toUpperCase();

  const sameDay = (value: any) => value && manilaDayKey(value) === targetDay;

  const debugAssetTransactions: Array<{ accountType: string; date: Date; amount: number; description: string; referenceType?: string }> = [];
  const allPaymentLikeAssetTransactions: Array<{ accountType: string; date: Date; amount: number; description: string; referenceType?: string }> = [];
  for (const account of allAssetAccounts as any[]) {
    const accTypeRaw = account?.accountType;
    const accType = accountTypeUpper(accTypeRaw);
    for (const tx of account?.transactions || []) {
      if (tx.type !== 'CREDIT' || !sameDay(tx.date)) continue;
      const amount = tx.amount || 0;
      const descriptionRaw = tx.description || '';
      const description = String(descriptionRaw).toLowerCase();
      const refType = String(tx.referenceType || '').toLowerCase();
      const isPaymentLike = refType === 'payment' || description.includes('payment');

      if (isPaymentLike) {
        const txRow = { accountType: String(accTypeRaw || ''), date: new Date(tx.date), amount, description: descriptionRaw, referenceType: tx.referenceType };
        allPaymentLikeAssetTransactions.push(txRow);
        debugAssetTransactions.push(txRow);

        // Keep asset rows for debug visibility only; payment channel classification drives totals.
      }
    }
  }

  // Get expenses/petty cash for the day (by this cashier)
  const { default: Expense } = await import('../models/Expense');
  const dayExpenses = await Expense.find({
    isDeleted: false,
    expenseDate: { $gte: startOfDay, $lte: endOfDay },
    createdBy: new Types.ObjectId(cashierId)
  }).lean();
  const expenses = dayExpenses.reduce((sum, e) => sum + ((e as any).amount || 0), 0);
  const expenseBreakdown = dayExpenses.map((e: any) => ({
    description: e.description || '',
    amount: e.amount || 0,
    category: e.category || 'General',
    isPettyCash: !!e.isPettyCash
  }));

  // Get repayments (bounced check repayments credited to CASH)
  let repayments = 0;
  for (const account of allAssetAccounts as any[]) {
    if (accountTypeUpper(account?.accountType) !== 'CASH') continue;
    for (const tx of account?.transactions || []) {
      if (tx.type === 'CREDIT' && String(tx.referenceType || '').toLowerCase() === 'bouncedrepay') {
        const txDate = new Date(tx.date);
        if (manilaDayKey(txDate) === targetDay) {
          repayments += tx.amount || 0;
        }
      }
    }
  }

  // Get advance payments and opening adjustments for the day
  const DailyCashDrawer = (await import('../models/DailyCashDrawer')).default;
  const dayAdjustments = await DailyCashDrawer.find({
    cashierId: new Types.ObjectId(cashierId),
    type: { $in: ['ADVANCE_PAYMENT', 'OPENING_ADJUST'] },
    date: { $gte: startOfDay, $lte: endOfDay }
  }).lean();
  const advanceTotal = dayAdjustments
    .filter((a: any) => a.type === 'ADVANCE_PAYMENT')
    .reduce((sum, a: any) => sum + (a.remittedAmount || 0), 0);

  // Get today's remittances
  const dayRemittances = await DailyCashDrawer.find({
    cashierId: new Types.ObjectId(cashierId),
    type: 'REMITTANCE',
    date: { $gte: startOfDay, $lte: endOfDay }
  }).lean();
  const totalRemitted = dayRemittances.reduce((sum, r) => sum + (r.remittedAmount || 0), 0);

  // Ensure CHECK bucket represents check-based collections only.
  bankAndCheckCollections = checkPayments;
  onlineBankingCollections = bpiOnlineCollections + aubOnlineCollections + mayaCollections;
  onlineOtherCollections = 0;
  onlinePayments = gcashCollections + onlineBankingCollections;
  const totalSales = cashSales + checkPayments + onlinePayments;
  const totalCollections = cashSales + checkPayments + gcashCollections + onlineBankingCollections;
  const cashOnHandCollections = cashSales;
  const cashOnHand = openingBalance + cashSales + repayments + advanceTotal - expenses - totalRemitted;
  const closingBalance = cashOnHand;

  const totalPaymentDocs = await Payment.countDocuments({ isDeleted: false });
  const totalCheckDocs = await CheckRecord.countDocuments({ isDeleted: false });
  const totalSalesDocs = await Sale.countDocuments({ isDeleted: false, status: 'COMPLETED' });
  const totalAssetTransactions = (allAssetAccounts as any[]).reduce((sum: number, acc: any) => {
    return sum + ((acc?.transactions || []).length || 0);
  }, 0);
  
  const debugPaymentSource = filteredDayPayments.length > 0 ? filteredDayPayments : recentPaymentsForDebug;
  const debugCheckSource = validCustomerDayCheckRecords.length > 0 ? validCustomerDayCheckRecords : recentChecksForDebug;
  const debugAssetSource = debugAssetTransactions.length > 0
    ? debugAssetTransactions
    : allPaymentLikeAssetTransactions
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20)
        .map((tx) => ({ ...tx, description: `[RECENT] ${tx.description || ''}` }));

  const allSourcesEmpty =
    debugPaymentSource.length === 0 &&
    debugCheckSource.length === 0 &&
    debugAssetSource.length === 0;

  const probeMarker = 'CASH_DRAWER_PROBE_V4';
  const probeDate = new Date();
  const probeText = `${probeMarker} dbMode=${process.env.DB_MODE || 'mongodb'} payments=${totalPaymentDocs} checks=${totalCheckDocs} sales=${totalSalesDocs} assetTx=${totalAssetTransactions}`;

  const finalDebugPayments = allSourcesEmpty
    ? [{
        _id: probeMarker,
        paymentDate: probeDate,
        totalPaid: 0,
        cashPayment: 0,
        paymentChannels: [],
      }]
    : debugPaymentSource;

  const finalDebugChecks = allSourcesEmpty
    ? [{
        paymentId: probeMarker,
        receivedDate: probeDate,
        amount: 0,
        customerName: 'SYSTEM PROBE',
        referenceNumber: probeText,
        accountName: process.env.DB_MODE || 'mongodb',
        status: 'INFO',
      }]
    : debugCheckSource;

  const finalDebugAssets = allSourcesEmpty
    ? [{
        accountType: 'PROBE',
        date: probeDate,
        amount: 0,
        description: probeText,
        referenceType: 'DIAG',
      }]
    : debugAssetSource;

  console.log(
    `[CASH_DRAWER_PROBE] day=${targetDay} dbMode=${process.env.DB_MODE || 'mongodb'} ` +
    `paymentsFetched=${(payments as any[]).length} paymentsMatched=${filteredDayPayments.length} ` +
    `checksFetched=${(checkRecords as any[]).length} checksMatched=${validCustomerDayCheckRecords.length} ` +
    `assetAccounts=${(allAssetAccounts as any[]).length} assetTx=${totalAssetTransactions} ` +
    `allSourcesEmpty=${allSourcesEmpty}`
  );

  return {
    cashierId,
    cashierName,
    openingBalance,
    cashSales,
    checkPayments,
    onlinePayments,
    repayments,
    receivableCollections,
    channelBreakdown: {
      cashOnHand: cashOnHandCollections,
      gcash: gcashCollections,
      gcashLouie,
      gcashKatrina,
      gcashAnicia,
      bpiOnline: bpiOnlineCollections,
      aubOnline: aubOnlineCollections,
      maya: mayaCollections,
      onlineBanking: onlineBankingCollections,
      bankAndCheck: bankAndCheckCollections,
      onlineOther: onlineOtherCollections,
      totalCollections,
    },
    totalSales,
    expenses,
    expenseBreakdown,
    receivableDetails,
    debugSources: {
      meta: {
        targetDay,
        queryStart,
        queryEnd,
        fetchedPayments: (payments as any[]).length,
        matchedPayments: filteredDayPayments.length,
        fetchedChecks: (checkRecords as any[]).length,
        matchedChecks: validCustomerDayCheckRecords.length,
        fetchedAssetAccounts: (allAssetAccounts as any[]).length,
        totalPaymentDocs,
        totalCheckDocs,
        totalSalesDocs,
        totalAssetTransactions,
        allSourcesEmpty,
        probeMarker,
      },
      payments: finalDebugPayments.map((p: any) => ({
        paymentId: `${filteredDayPayments.length > 0 ? '' : '[RECENT] '}${p._id.toString()}`,
        paymentDate: new Date(paymentDayValue(p)),
        totalPaid: p.totalPaid || 0,
        cashPayment: p.cashPayment || 0,
        channels: (p.paymentChannels || []).map((ch: any) => ({
          channel: ch.channel || '',
          amount: ch.amount || 0,
          accountName: ch.accountName || '',
          referenceNumber: ch.referenceNumber || ''
        }))
      })),
      checks: finalDebugChecks.map((c: any) => ({
        paymentId: `${validCustomerDayCheckRecords.length > 0 ? '' : '[RECENT] '}${c.paymentId?.toString?.() || ''}`,
        receivedDate: new Date(checkDayValue(c)),
        amount: c.amount || 0,
        customerName: c.customerName || '',
        referenceNumber: c.referenceNumber || '',
        accountName: c.accountName || '',
        status: c.status || ''
      })),
      assetTransactions: finalDebugAssets,
    },
    closingBalance,
    cashOnHand,
    date: new Date(`${targetDay}T00:00:00.000+08:00`),
  };
}

/**
 * Validate and apply date range filter
 * Validates: Requirements 9.5
 */
export function validateDateRange(startDate?: string, endDate?: string): DateRange {
  const range: DateRange = {};
  
  if (startDate) {
    range.startDate = new Date(startDate);
    if (isNaN(range.startDate.getTime())) {
      throw new Error('Invalid start date');
    }
  }
  
  if (endDate) {
    range.endDate = new Date(endDate);
    if (isNaN(range.endDate.getTime())) {
      throw new Error('Invalid end date');
    }
  }
  
  if (range.startDate && range.endDate && range.startDate > range.endDate) {
    throw new Error('Start date must be before end date');
  }
  
  return range;
}
