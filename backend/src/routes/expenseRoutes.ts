import express from 'express';
import * as expenseController from '../controllers/expenseController.js';
import { authenticate } from '../middleware/auth.js';
import { preventBackdate } from '../middleware/backdatePrevent.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.post('/', preventBackdate('expenseDate'), expenseController.createExpense);
router.get('/', expenseController.getExpenses);
router.get('/petty-cash/status', expenseController.getPettyCashStatus);

export default router;
