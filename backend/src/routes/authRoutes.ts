import { Router } from 'express'
import {
  login,
  logout,
  verifyAdmin,
  getCurrentUser,
  refreshToken,
} from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

// Public routes
router.post('/login', login)
router.post('/logout', logout)
router.post('/refresh', refreshToken)

// Protected routes
router.post('/verify-admin', authenticate, verifyAdmin)
router.get('/me', authenticate, getCurrentUser)

export default router
