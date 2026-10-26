import express from 'express'
import { authenticate, authorize, requireAdminPassword } from '../middleware/auth.js'
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/userController.js'

const router = express.Router()

router.get('/', authenticate, authorize('ADMIN'), listUsers)
router.post('/', authenticate, authorize('ADMIN'), createUser)
router.put('/:id', authenticate, authorize('ADMIN'), updateUser)
router.delete('/:id', authenticate, authorize('ADMIN'), requireAdminPassword, deleteUser)

export default router
