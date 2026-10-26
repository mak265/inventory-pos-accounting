import { Request, Response } from 'express';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Expense from '../models/Expense.js';
import Payment from '../models/Payment.js';
import { getCache, setCache, makeCacheKey } from '../utils/perfCache.js';

export async function getDashboardStats(req: Request, res: Response) {
  try {
    const cacheKey = makeCacheKey('dashboard:stats', req.query as any);
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    const { startDate, endDate } = req.query;

    // Parse custom date range or default to current month
    let rangeStart: Date, rangeEnd: Date;
    if (startDate && endDate) {
      rangeStart = new Date(startDate as string);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(endDate as string);
      rangeEnd.setHours(23, 59, 59, 999);
    } else {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Previous period of same length for comparison
    const rangeDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(rangeStart.getTime() - 1);
    prevEnd.setHours(23, 59, 59, 999);
    const prevStart = new Date(prevEnd.getTime() - rangeDays * 24 * 60 * 60 * 1000 + 1);
    prevStart.setHours(0, 0, 0, 0);

    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    // Counts (always current, not filtered)
    const [totalProducts, totalCustomers, totalPOs] = await Promise.all([
      Product.countDocuments({ isDeleted: false }),
      Customer.countDocuments({ isDeleted: false }),
      PurchaseOrder.countDocuments({ isDeleted: false }),
    ]);

    // Sales in range, previous range, today, and all
    const [rangeSales, prevSales, todaySales, allCompletedSales] = await Promise.all([
      Sale.find({ isDeleted: false, status: 'COMPLETED', saleDate: { $gte: rangeStart, $lte: rangeEnd } })
        .select('saleDate totalAmount lineItems')
        .lean(),
      Sale.find({ isDeleted: false, status: 'COMPLETED', saleDate: { $gte: prevStart, $lte: prevEnd } })
        .select('totalAmount')
        .lean(),
      Sale.find({ isDeleted: false, status: 'COMPLETED', saleDate: { $gte: todayStart, $lte: todayEnd } })
        .select('totalAmount')
        .lean(),
      Sale.find({ isDeleted: false, status: 'COMPLETED' })
        .select('_id totalAmount')
        .lean(),
    ]);

    const rangeRevenue = rangeSales.reduce((s, sale) => s + (sale.totalAmount || 0), 0);
    const prevRevenue = prevSales.reduce((s, sale) => s + (sale.totalAmount || 0), 0);
    const todayRevenue = todaySales.reduce((s, sale) => s + (sale.totalAmount || 0), 0);
    const totalRevenue = allCompletedSales.reduce((s, sale) => s + (sale.totalAmount || 0), 0);

    // Receivables (always total)
    const allSaleIds = allCompletedSales.map(s => s._id);
    const allPayments = allSaleIds.length > 0
      ? await Payment.find({ saleId: { $in: allSaleIds } }).select('totalPaid').lean()
      : [];
    const totalPaid = allPayments.reduce((s, p) => s + (p.totalPaid || 0), 0);
    const totalReceivable = totalRevenue - totalPaid;

    // Expenses in range
    const rangeExpenses = await Expense.find({
      isDeleted: false, expenseDate: { $gte: rangeStart, $lte: rangeEnd }
    }).lean();
    const rangeExpenseTotal = rangeExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    // Low stock (always current)
    const lowStockProducts = await Product.find({
      isDeleted: false, availableStock: { $lte: 5 }
    }).select('code description availableStock uom').sort({ description: 1 }).limit(10).lean();

    // Inventory analytics
    const allProducts = await Product.find({ isDeleted: false }).select('_id availableStock averageCost').lean();
    const totalItems = allProducts.reduce((s, p) => s + (p.availableStock || 0), 0);
    const inventoryValue = allProducts.reduce((s, p) => s + ((p.availableStock || 0) * (p.averageCost || 0)), 0);
    const totalProductCount = allProducts.length;

    // Cost of Goods Sold (COGS) for the range — sum of (quantity × averageCost) for each sold item
    let rangeCOGS = 0;
    for (const sale of rangeSales) {
      for (const item of sale.lineItems) {
        const prod = allProducts.find(p => p._id.toString() === item.productId.toString());
        const cost = prod?.averageCost || 0;
        const factor = (item as any).conversionFactor || 1;
        rangeCOGS += item.quantity * factor * cost;
      }
    }

    // Net Income = Revenue - COGS - Expenses
    const grossProfit = rangeRevenue - rangeCOGS;
    const netIncome = grossProfit - rangeExpenseTotal;

    // Top selling in range
    const productMap = new Map<string, { description: string; qty: number; revenue: number }>();
    for (const sale of rangeSales) {
      for (const item of sale.lineItems) {
        const pid = item.productId.toString();
        const existing = productMap.get(pid) || { description: item.description, qty: 0, revenue: 0 };
        existing.qty += item.quantity;
        existing.revenue += item.lineTotal || (item.quantity * item.sellingPrice);
        productMap.set(pid, existing);
      }
    }
    const topSelling = Array.from(productMap.entries())
      .map(([id, d]) => ({ productId: id, description: d.description, quantity: d.qty, revenue: d.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Daily sales for the range (for chart)
    const dailySales: { date: string; revenue: number; count: number }[] = [];
    const current = new Date(rangeStart);
    while (current <= rangeEnd) {
      const dayStart = new Date(current); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(current); dayEnd.setHours(23, 59, 59, 999);
      const daySales = rangeSales.filter(s => {
        const sd = new Date(s.saleDate);
        return sd >= dayStart && sd <= dayEnd;
      });
      dailySales.push({
        date: dayStart.toISOString().split('T')[0],
        revenue: daySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
        count: daySales.length,
      });
      current.setDate(current.getDate() + 1);
    }

    // Recent sales (last 5, always latest)
    const recentSales = await Sale.find({ isDeleted: false, status: 'COMPLETED' })
      .sort({ saleDate: -1 }).limit(5)
      .select('drNumber saleDate customerName totalAmount').lean();

    const pendingPOs = await PurchaseOrder.countDocuments({ isDeleted: false, status: { $in: ['DRAFT', 'SUBMITTED'] } });

    const revenueChange = prevRevenue > 0
      ? ((rangeRevenue - prevRevenue) / prevRevenue * 100)
      : (rangeRevenue > 0 ? 100 : 0);

    const payload = {
      dateRange: { startDate: rangeStart.toISOString(), endDate: rangeEnd.toISOString() },
      counts: { products: totalProductCount, customers: totalCustomers, purchaseOrders: totalPOs, pendingPOs, totalItems },
      revenue: {
        today: todayRevenue,
        thisRange: rangeRevenue,
        prevRange: prevRevenue,
        total: totalRevenue,
        changePercent: Math.round(revenueChange * 10) / 10,
      },
      sales: {
        todayCount: todaySales.length,
        rangeCount: rangeSales.length,
        totalCount: allCompletedSales.length,
      },
      receivable: totalReceivable,
      expenses: { thisRange: rangeExpenseTotal },
      profit: { thisRange: rangeRevenue - rangeExpenseTotal },
      financials: {
        grossRevenue: rangeRevenue,
        cogs: rangeCOGS,
        grossProfit,
        expenses: rangeExpenseTotal,
        netIncome,
      },
      inventory: { totalItems, inventoryValue },
      lowStockProducts,
      topSelling,
      dailySales,
      recentSales,
    };

    setCache(cacheKey, payload, 30_000);
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
