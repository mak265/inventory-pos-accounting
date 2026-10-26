import express from 'express';
import * as purchaseOrderController from '../controllers/purchaseOrderController.js';
import { authenticate, requireAdminPassword } from '../middleware/auth.js';
import { preventBackdate } from '../middleware/backdatePrevent.js';

const router = express.Router();

router.get('/', authenticate, purchaseOrderController.getPurchaseOrders);
router.get('/:id', authenticate, purchaseOrderController.getPurchaseOrder);
router.post('/', authenticate, preventBackdate('poDate'), purchaseOrderController.createPurchaseOrder);
router.put('/:id', authenticate, preventBackdate('poDate'), purchaseOrderController.updatePurchaseOrder);
router.delete('/:id', authenticate, requireAdminPassword, purchaseOrderController.deletePurchaseOrder);

export default router;
