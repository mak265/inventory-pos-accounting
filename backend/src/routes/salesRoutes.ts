import express from 'express';
import * as salesController from '../controllers/salesController.js';
import { authenticate, requireAdminPassword } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, salesController.getSales);
router.get('/next-number', authenticate, salesController.getNextNumber);
router.get('/journal', authenticate, salesController.getSalesJournal);
// repair-stock must be registered BEFORE /:id to avoid being matched as an ID
router.post('/repair-stock', authenticate, requireAdminPassword, salesController.repairStock);
router.get('/:id', authenticate, salesController.getSale);
router.post('/', authenticate, salesController.createSale);
router.put('/:id', authenticate, salesController.updateSale);
router.put('/:id/admin-edit', authenticate, requireAdminPassword, salesController.adminEditSale);
router.delete('/:id', authenticate, requireAdminPassword, salesController.deleteSale);
router.post('/:id/post', authenticate, salesController.postSale);
router.post('/:id/void', authenticate, requireAdminPassword, salesController.voidSale);
router.post('/:id/return', authenticate, salesController.returnItems);

export default router;
