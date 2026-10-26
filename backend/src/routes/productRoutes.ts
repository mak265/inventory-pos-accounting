import { Router } from 'express';
import {
  getProducts,
  getProduct,
  getProductHistory,
  getProductJournal,
  getProductVendorJournal,
  createProduct,
  updateProduct,
  deleteProduct,
  stockAdjust
} from '../controllers/productController.js';
import { authenticate, requireAdminPassword } from '../middleware/auth.js';

const router = Router();

// All product routes require authentication
router.use(authenticate);

// GET routes
router.get('/', getProducts);
router.get('/:id', getProduct);
router.get('/:id/history', getProductHistory);
router.get('/:id/journal', getProductJournal);
router.get('/:id/vendor-journal', getProductVendorJournal);

// POST routes
router.post('/', createProduct);
router.post('/:id/stock-adjust', stockAdjust);

// PUT routes
router.put('/:id', updateProduct);

// DELETE routes (requires admin password verification)
router.delete('/:id', requireAdminPassword, deleteProduct);

export default router;
