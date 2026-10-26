import mongoose from 'mongoose'
import { SavedState } from '../models/SavedState.js'

/**
 * Save the current state of a record (snapshot for rollback).
 */
export const saveRecordState = async (
  collectionName: string,
  recordId: string,
  userId: string
): Promise<{ message: string }> => {
  const model = mongoose.model(getModelName(collectionName))
  const record = await model.findById(recordId).lean()

  if (!record) {
    throw new Error(`Record not found in ${collectionName}`)
  }

  await SavedState.findOneAndUpdate(
    { collectionName, recordId } as any,
    {
      collectionName,
      recordId,
      savedData: record as Record<string, unknown>,
      savedAt: new Date(),
      savedBy: userId,
    },
    { upsert: true, new: true }
  )

  return { message: 'Record state saved successfully' }
}

/**
 * Unsave (revert) a record to its last saved state.
 * Uses MongoDB transactions for atomicity and rollback on failure.
 */
export const unsaveRecordState = async (
  collectionName: string,
  recordId: string,
  userId: string
): Promise<{ message: string; restoredData: Record<string, unknown> }> => {
  const savedState = await SavedState.findOne(
    { collectionName, recordId } as any
  )

  if (!savedState) {
    throw new Error('No saved state found for this record')
  }

  const model = mongoose.model(getModelName(collectionName))
  const session = await mongoose.startSession()

  try {
    session.startTransaction()

    const savedData = savedState.savedData as Record<string, unknown>
    const { _id, __v, ...restoreData } = savedData

    const updated = await model.findByIdAndUpdate(
      recordId,
      { ...restoreData, updatedBy: userId, updatedAt: new Date() },
      { new: true, session }
    )

    if (!updated) {
      throw new Error(`Record not found in ${collectionName}`)
    }

    await session.commitTransaction()

    return {
      message: 'Record reverted to last saved state',
      restoredData: updated.toObject() as Record<string, unknown>,
    }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

/**
 * Check if a record has a saved state.
 */
export const hasSavedState = async (
  collectionName: string,
  recordId: string
): Promise<boolean> => {
  const count = await SavedState.countDocuments(
    { collectionName, recordId } as any
  )
  return count > 0
}

/**
 * Remove saved state for a record (cleanup after delete).
 */
export const removeSavedState = async (
  collectionName: string,
  recordId: string
): Promise<void> => {
  await SavedState.deleteOne({ collectionName, recordId } as any)
}

/**
 * Map collection names to Mongoose model names.
 */
function getModelName(collectionName: string): string {
  const mapping: Record<string, string> = {
    products: 'Product',
    vendors: 'Vendor',
    purchaseOrders: 'PurchaseOrder',
    deliveryReceipts: 'DeliveryReceipt',
    customers: 'Customer',
    sales: 'Sale',
    payments: 'Payment',
    expenses: 'Expense',
    assetAccounts: 'AssetAccount',
  }

  const modelName = mapping[collectionName]
  if (!modelName) {
    throw new Error(`Unknown collection: ${collectionName}`)
  }
  return modelName
}
