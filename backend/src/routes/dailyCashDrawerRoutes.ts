import express from 'express';
import * as ctrl from '../controllers/dailyCashDrawerController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.post('/remit', ctrl.remitCash);
router.post('/close', ctrl.closeDay);
router.post('/advance-payment', ctrl.acceptAdvancePayment);
router.post('/adjust-opening', ctrl.adjustOpeningBalance);
router.post('/reset-history', ctrl.resetHistory);
router.delete('/:id', ctrl.deleteRecord);
router.get('/', ctrl.getDailyRecords);
router.get('/opening-balance/:cashierId', ctrl.getOpeningBalance);

export default router;
