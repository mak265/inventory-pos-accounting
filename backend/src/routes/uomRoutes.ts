import express from 'express';
import * as uomController from '../controllers/uomController.js';
import { authenticate, requireAdminPassword } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, uomController.getUoms);
router.get('/:id', authenticate, uomController.getUomById);
router.post('/', authenticate, uomController.createUom);
router.put('/:id', authenticate, uomController.updateUom);
router.delete('/:id', authenticate, requireAdminPassword, uomController.deleteUom);

export default router;
