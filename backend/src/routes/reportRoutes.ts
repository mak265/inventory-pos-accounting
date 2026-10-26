import express from 'express';
import {
  getSalesSummaryReport,
  getCustomerSales,
  getTopSelling,
  getCashDrawer,
  getExpenses,
  getAssetAccounts,
  getSIReport,
  getVendorSIReport,
  getLowStockReport,
  getVendorPaymentReport,
} from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All report routes require authentication
router.use(authenticate);

// Sales summary report
router.get('/sales-summary', getSalesSummaryReport);

// Per-customer sales report
router.get('/customer-sales/:customerId', getCustomerSales);

// Top selling items report
router.get('/top-selling', getTopSelling);

// Cash drawer report
router.get('/cash-drawer/:cashierId', getCashDrawer);

// Expense report
router.get('/expenses', getExpenses);

// Asset accounts report
router.get('/asset-accounts', getAssetAccounts);

// SI Report
router.get('/si-report', getSIReport);

// Vendor SI Report
router.get('/vendor-si', getVendorSIReport);
router.get('/low-stock', getLowStockReport);
router.get('/vendor-payments', getVendorPaymentReport);

export default router;
