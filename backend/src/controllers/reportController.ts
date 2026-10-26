import { Request, Response } from 'express';
import {
  getSalesSummary,
  getCustomerSalesReport,
  getTopSellingItems,
  getCashDrawerReport,
  validateDateRange,
} from '../services/reportService.js';
import { getExpenseReport } from '../services/expenseService.js';
import AssetAccount from '../models/AssetAccount.js';
import DeliveryReceipt from '../models/DeliveryReceipt.js';
import { getCache, setCache, makeCacheKey } from '../utils/perfCache.js';
import { getOpeningBalance } from '../services/dailyCashDrawerService.js';

/**
 * Get sales summary report
 * GET /api/reports/sales-summary
 */
export async function getSalesSummaryReport(req: Request, res: Response) {
  try {
    const cacheKey = makeCacheKey('reports:sales-summary', req.query as any);
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const { startDate, endDate } = req.query;
    const dateRange = validateDateRange(startDate as string, endDate as string);
    
    const summary = await getSalesSummary(dateRange);
    setCache(cacheKey, summary, 30_000);
    
    res.json(summary);
  } catch (error: any) {
    console.error('Sales summary error:', error);
    if (error.message?.includes('date')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
}

/**
 * Get per-customer sales report
 * GET /api/reports/customer-sales/:customerId
 */
export async function getCustomerSales(req: Request, res: Response) {
  try {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;
    const dateRange = validateDateRange(startDate as string, endDate as string);
    
    if (!customerId || typeof customerId !== 'string') {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    
    const report = await getCustomerSalesReport(customerId, dateRange);
    
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get top selling items report
 * GET /api/reports/top-selling
 */
export async function getTopSelling(req: Request, res: Response) {
  try {
    const { startDate, endDate, sortBy, limit } = req.query;
    const dateRange = validateDateRange(startDate as string, endDate as string);
    
    const sortByValue = (sortBy as string) === 'revenue' ? 'revenue' : 'quantity';
    const limitValue = limit ? parseInt(limit as string, 10) : 10;
    
    const items = await getTopSellingItems(dateRange, sortByValue, limitValue);
    
    res.json(items);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get cash drawer report for a cashier
 * GET /api/reports/cash-drawer/:cashierId
 */
export async function getCashDrawer(req: Request, res: Response) {
  try {
    const { cashierId } = req.params;
    const { date } = req.query;
    
    if (!cashierId || typeof cashierId !== 'string') {
      return res.status(400).json({ error: 'Invalid cashier ID' });
    }
    
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    
    const dateValue = String(date);
    const reportDate = new Date(dateValue);
    if (isNaN(reportDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date' });
    }
    
    const openingResult = await getOpeningBalance(cashierId, dateValue);
    const opening = openingResult.openingBalance;
    console.log(`[DEBUG-REPORT] getCashDrawer for cashier=${cashierId} date=${dateValue} => FINAL opening=${opening}`);
    
    const report = await getCashDrawerReport(cashierId, dateValue, opening);
    console.log(`[DEBUG-REPORT] Report computed opening=${report.openingBalance} cashOnHand=${report.cashOnHand} closing=${report.closingBalance}`);
    
    res.json({ ...report, _openingDebug: openingResult._debug });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get expense report
 * GET /api/reports/expenses
 */
export async function getExpenses(req: Request, res: Response) {
  try {
    const { startDate, endDate } = req.query;
    const dateRange = validateDateRange(startDate as string, endDate as string);
    
    const report = await getExpenseReport(dateRange);
    
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get asset accounts report
 * GET /api/reports/asset-accounts
 */
export async function getAssetAccounts(_req: Request, res: Response) {
  try {
    const accounts = await AssetAccount.find().lean();
    
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}


/**
 * Get SI (Sales Invoice) report - payments with SI numbers
 * GET /api/reports/si-report
 */
export async function getSIReport(req: Request, res: Response) {
  try {
    const cacheKey = makeCacheKey('reports:si-report', req.query as any);
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const { startDate, endDate } = req.query;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10)));
    const skip = (page - 1) * limit;

    const Sale = (await import('../models/Sale')).default;
    const Payment = (await import('../models/Payment')).default;

    // Find sales with SI document type
    const query: any = { isDeleted: false, documentType: 'SI', status: 'COMPLETED' };
    if (startDate || endDate) {
      query.saleDate = {};
      if (startDate) query.saleDate.$gte = new Date(startDate as string);
      if (endDate) query.saleDate.$lte = new Date(endDate as string);
    }

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .populate('customerId', 'name')
        .sort({ saleDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sale.countDocuments(query),
    ]);

    // Get payments for these sales
    const saleIds = sales.map((s: any) => s._id);
    const payments = saleIds.length > 0
      ? await Payment.find({ saleId: { $in: saleIds }, isDeleted: false }).lean()
      : [];
    const paymentMap = new Map<string, number>();
    for (const p of payments) {
      const sid = p.saleId.toString();
      paymentMap.set(sid, (paymentMap.get(sid) || 0) + (p.totalPaid || 0));
    }

    const totalValue = sales.reduce((sum: number, s: any) => sum + (s.totalAmount || 0), 0);
    const totalPaid = sales.reduce((sum: number, s: any) => sum + (paymentMap.get(s._id.toString()) || 0), 0);

    const result = sales.map((s: any) => ({
      drNumber: s.drNumber,
      saleDate: s.saleDate,
      customerName: s.customerId?.name || s.customerName || 'Walk-in',
      totalAmount: s.totalAmount,
      totalPaid: paymentMap.get(s._id.toString()) || 0,
      balance: s.totalAmount - (paymentMap.get(s._id.toString()) || 0),
    }));

    const payload = { sales: result, totalValue, totalPaid, count: total, page, limit, totalPages: Math.ceil(total / limit) };
    setCache(cacheKey, payload, 30_000);
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get SI report' });
  }
}

/**
 * Vendor SI Report — delivery receipts with SI numbers
 * GET /api/reports/vendor-si
 */
export async function getVendorSIReport(req: Request, res: Response) {
  try {
    const cacheKey = makeCacheKey('reports:vendor-si', req.query as any);
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const { startDate, endDate, vendorId } = req.query;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10)));
    const skip = (page - 1) * limit;

    const query: any = { isDeleted: false, siNumber: { $exists: true, $ne: '' } };
    if (startDate || endDate) {
      query.deliveryDate = {};
      if (startDate) query.deliveryDate.$gte = new Date(startDate as string);
      if (endDate) query.deliveryDate.$lte = new Date(endDate as string);
    }
    if (vendorId) query.vendorId = vendorId;

    const [drs, total] = await Promise.all([
      DeliveryReceipt.find(query)
        .populate('vendorId', 'name')
        .sort({ deliveryDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DeliveryReceipt.countDocuments(query),
    ]);

    const result = drs.map((dr: any) => {
      const totalGross = dr.lineItems.reduce((s: number, i: any) => s + ((i.unitCost || 0) * (i.quantityReceived || 0)), 0);
      const totalNet = dr.lineItems.reduce((s: number, i: any) => s + ((i.netCost || i.unitCost || 0) * (i.quantityReceived || 0)), 0);
      return {
        _id: dr._id,
        drNumber: dr.drNumber,
        siNumber: dr.siNumber,
        deliveryDate: dr.deliveryDate,
        vendorName: dr.vendorId?.name || dr.vendorName,
        status: dr.status,
        itemCount: dr.lineItems.length,
        totalGross,
        totalNet
      };
    });

    const grandTotalGross = result.reduce((s: number, r: any) => s + r.totalGross, 0);
    const grandTotalNet = result.reduce((s: number, r: any) => s + r.totalNet, 0);

    const payload = { deliveries: result, grandTotalGross, grandTotalNet, count: total, page, limit, totalPages: Math.ceil(total / limit) };
    setCache(cacheKey, payload, 30_000);
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get vendor SI report' });
  }
}

/**
 * Low Stock Report — products where availableStock <= minStock
 * GET /api/reports/low-stock
 */
export async function getLowStockReport(_req: Request, res: Response) {
  try {
    const Product = (await import('../models/Product')).default;
    const products = await Product.find({
      isDeleted: { $ne: true },
      isActive: { $ne: false },
      $expr: { $lte: ['$availableStock', '$minStock'] },
      minStock: { $gt: 0 }
    }).select('code description availableStock minStock uom sellingPrice lastCost').sort({ description: 1 }).lean();
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get low stock report' });
  }
}


/**
 * Vendor Payment History Report
 * GET /api/reports/vendor-payments
 */
export async function getVendorPaymentReport(req: Request, res: Response) {
  try {
    const cacheKey = makeCacheKey('reports:vendor-payments', req.query as any);
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const { startDate, endDate, vendorId } = req.query;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10)));
    const skip = (page - 1) * limit;

    const query: any = { isDeleted: false, status: 'POSTED' };
    if (vendorId) query.vendorId = vendorId;
    if (startDate || endDate) {
      query.deliveryDate = {};
      if (startDate) query.deliveryDate.$gte = new Date(startDate as string);
      if (endDate) query.deliveryDate.$lte = new Date(endDate as string);
    }

    const [drs, total] = await Promise.all([
      DeliveryReceipt.find(query)
        .populate('vendorId', 'name')
        .sort({ deliveryDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DeliveryReceipt.countDocuments(query),
    ]);

    const result = drs.map((dr: any) => {
      const total = dr.lineItems.reduce((s: number, i: any) => s + ((i.quantityReceived || 0) * (i.netCost || i.unitCost || 0)), 0);
      // Recalculate amountPaid from paymentHistory as source of truth
      const paidFromHistory = (dr.paymentHistory || []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
      const amountPaid = paidFromHistory || dr.amountPaid || 0;
      const totalAmount = dr.totalAmount || total;
      const balance = Math.max(0, totalAmount - amountPaid);
      const paymentStatus = amountPaid <= 0 ? 'UNPAID' : balance <= 0.01 ? 'PAID' : 'PARTIAL';
      return {
        _id: dr._id,
        drNumber: dr.drNumber,
        siNumber: dr.siNumber || '',
        deliveryDate: dr.deliveryDate,
        vendorName: dr.vendorId?.name || dr.vendorName,
        totalAmount,
        amountPaid,
        balance,
        paymentStatus,
        paymentHistory: dr.paymentHistory || []
      };
    });

    // Enrich check payments with effectiveDate from CheckRecords (for old data)
    const CheckRecord = (await import('../models/CheckRecord')).default;
    const drIds = result.map((r: any) => r._id);
    const checkRecords = await CheckRecord.find({ paymentId: { $in: drIds }, isDeleted: false }).lean();
    const checkMap = new Map<string, any[]>();
    for (const cr of checkRecords) {
      const pid = cr.paymentId?.toString() || '';
      if (!checkMap.has(pid)) checkMap.set(pid, []);
      checkMap.get(pid)!.push(cr);
    }

    for (const dr of result) {
      const checks = checkMap.get(dr._id.toString()) || [];
      for (const ph of dr.paymentHistory) {
        if (ph.method === 'CHECK' && !ph.effectiveDate && checks.length > 0) {
          // Try to match by amount or reference
          const match = checks.find((c: any) =>
            c.amount === ph.amount ||
            (c.referenceNumber && ph.reference && c.referenceNumber === ph.reference)
          ) || checks[0];
          if (match?.effectiveDate) {
            ph.effectiveDate = match.effectiveDate;
          }
        }
      }
    }

    const grandTotal = result.reduce((s: number, r: any) => s + r.totalAmount, 0);
    const totalPaid = result.reduce((s: number, r: any) => s + r.amountPaid, 0);

    const payload = { deliveries: result, grandTotal, totalPaid, totalBalance: grandTotal - totalPaid, count: total, page, limit, totalPages: Math.ceil(total / limit) };
    setCache(cacheKey, payload, 30_000);
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get vendor payment report' });
  }
}
