import express from 'express';
import * as checkApprovalController from '../controllers/checkApprovalController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);
router.get('/', checkApprovalController.getCheckRecords);
router.get('/banks', checkApprovalController.getAvailableBanks);
router.post('/migrate', checkApprovalController.migrateCheckRecords);
router.post('/approve-transaction', checkApprovalController.approveTransaction);
router.post('/bounce-transaction', checkApprovalController.bounceTransaction);
router.post('/repay-bounced', checkApprovalController.repayBounced);
router.patch('/:id/approve', checkApprovalController.approveCheck);
router.patch('/:id/bounce', checkApprovalController.bounceCheck);

export default router;
