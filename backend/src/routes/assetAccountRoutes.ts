import express from 'express';
import * as assetAccountController from '../controllers/assetAccountController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', assetAccountController.getAssetAccounts);
router.get('/:accountType', assetAccountController.getAssetAccount);
router.get('/:accountType/transactions', assetAccountController.getAccountTransactions);
router.post('/initialize', assetAccountController.initializeAccounts);

export default router;
