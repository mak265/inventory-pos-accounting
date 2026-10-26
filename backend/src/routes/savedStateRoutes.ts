import express from 'express'
import * as savedStateController from '../controllers/savedStateController.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

// All routes require authentication
router.use(authenticate)

// POST /api/records/:collection/:id/save - Save current record state
router.post('/:collection/:id/save', savedStateController.saveRecord)

// POST /api/records/:collection/:id/unsave - Revert to last saved state
router.post('/:collection/:id/unsave', savedStateController.unsaveRecord)

// GET /api/records/:collection/:id/saved-state - Check if saved state exists
router.get('/:collection/:id/saved-state', savedStateController.checkSavedState)

export default router
