import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import { authenticate, requireAdminPassword } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, paymentController.getPayments);
router.get('/:id', authenticate, paymentController.getPayment);
router.post('/', authenticate, paymentController.createPayment);
router.delete('/:id', authenticate, requireAdminPassword, paymentController.deletePayment);

export default router;
