import express from 'express';
import * as vendorController from '../controllers/vendorController.js';
import { authenticate, requireAdminPassword } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, vendorController.getVendors);
router.get('/:id', authenticate, vendorController.getVendor);
router.post('/', authenticate, vendorController.createVendor);
router.put('/:id', authenticate, vendorController.updateVendor);
router.delete('/:id', authenticate, requireAdminPassword, vendorController.deleteVendor);

export default router;
