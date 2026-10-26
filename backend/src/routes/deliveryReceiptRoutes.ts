import express from 'express';
import * as deliveryReceiptController from '../controllers/deliveryReceiptController.js';
import { authenticate, requireAdminPassword } from '../middleware/auth.js';
import { preventBackdate } from '../middleware/backdatePrevent.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/deliveries - Get all delivery receipts with filters
router.get('/', deliveryReceiptController.getDeliveryReceipts);

// GET /api/deliveries/:id - Get delivery receipt by ID
router.get('/:id', deliveryReceiptController.getDeliveryReceipt);

// POST /api/deliveries - Create new delivery receipt
router.post('/', deliveryReceiptController.createDeliveryReceipt);

// PUT /api/deliveries/:id - Update delivery receipt
router.put('/:id', deliveryReceiptController.updateDeliveryReceipt);

// POST /api/deliveries/:id/post - Post delivery receipt (update inventory)
router.post('/:id/post', deliveryReceiptController.postDeliveryReceipt);

// POST /api/deliveries/:id/pay - Record vendor payment
router.post('/:id/pay', deliveryReceiptController.payDelivery);

// DELETE /api/deliveries/:id - Delete delivery receipt (requires admin password)
router.delete('/:id', requireAdminPassword, deliveryReceiptController.deleteDeliveryReceipt);

export default router;
