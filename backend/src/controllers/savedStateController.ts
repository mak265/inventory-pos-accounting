import { Request, Response } from 'express'
import * as savedStateService from '../services/savedStateService.js'

/**
 * POST /api/records/:collection/:id/save
 * Save the current state of a record for later rollback.
 */
export const saveRecord = async (req: Request, res: Response): Promise<void> => {
  try {
    const collectionName = req.params.collection as string
    const id = req.params.id as string
    const userId = (req as any).user.userId

    const result = await savedStateService.saveRecordState(collectionName, id, userId)
    res.json(result)
  } catch (error: any) {
    console.error('Error saving record state:', error)
    if (error.message.includes('not found') || error.message.includes('Unknown collection')) {
      res.status(404).json({ error: error.message })
    } else {
      res.status(500).json({ error: 'Failed to save record state' })
    }
  }
}

/**
 * POST /api/records/:collection/:id/unsave
 * Revert a record to its last saved state.
 */
export const unsaveRecord = async (req: Request, res: Response): Promise<void> => {
  try {
    const collectionName = req.params.collection as string
    const id = req.params.id as string
    const userId = (req as any).user.userId

    const result = await savedStateService.unsaveRecordState(collectionName, id, userId)
    res.json(result)
  } catch (error: any) {
    console.error('Error reverting record state:', error)
    if (error.message.includes('No saved state') || error.message.includes('not found')) {
      res.status(404).json({ error: error.message })
    } else if (error.message.includes('Unknown collection')) {
      res.status(400).json({ error: error.message })
    } else {
      res.status(500).json({ error: 'Failed to revert record state' })
    }
  }
}

/**
 * GET /api/records/:collection/:id/saved-state
 * Check if a record has a saved state.
 */
export const checkSavedState = async (req: Request, res: Response): Promise<void> => {
  try {
    const collectionName = req.params.collection as string
    const id = req.params.id as string

    const hasSaved = await savedStateService.hasSavedState(collectionName, id)
    res.json({ hasSavedState: hasSaved })
  } catch (error: any) {
    console.error('Error checking saved state:', error)
    res.status(500).json({ error: 'Failed to check saved state' })
  }
}
