import express from 'express';
import * as customerController from '../controllers/customerController.js';
import { authenticate, requireAdminPassword } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, customerController.getCustomers);
router.get('/:id', authenticate, customerController.getCustomer);
router.get('/:id/history', authenticate, customerController.getCustomerHistory);
router.get('/:id/balance', authenticate, customerController.getCustomerBalance);
router.post('/', authenticate, customerController.createCustomer);
router.put('/:id', authenticate, customerController.updateCustomer);
router.delete('/:id', authenticate, requireAdminPassword, customerController.deleteCustomer);

export default router;
