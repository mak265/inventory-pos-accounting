import { AuditLog } from '../models/AuditLog.js'

export interface LogDeleteParams {
  collectionName: string
  recordId: string
  recordData: Record<string, unknown>
  userId: string
  username?: string
  ipAddress?: string
  details?: string
}

export interface LogOperationParams {
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  collectionName: string
  recordId: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  userId: string
  username?: string
  ipAddress?: string
  details?: string
}

/**
 * Log any significant operation to the immutable audit log.
 * Includes before/after snapshots for tracking changes.
 */
export const logOperation = async (params: LogOperationParams): Promise<void> => {
  try {
    const recordData: Record<string, unknown> = {}
    if (params.before) recordData.before = params.before
    if (params.after) recordData.after = params.after

    // If neither before nor after provided, use an empty snapshot
    if (Object.keys(recordData).length === 0) {
      recordData.snapshot = {}
    }

    await AuditLog.create({
      action: params.action,
      collectionName: params.collectionName,
      recordId: params.recordId,
      recordData,
      userId: params.userId,
      username: params.username || 'unknown',
      timestamp: new Date(),
      ipAddress: params.ipAddress,
      details: params.details,
    })
  } catch (error) {
    // Audit logging should not break the main operation
    console.error('Failed to create audit log entry:', error)
  }
}

/**
 * Log a delete operation to the audit log collection.
 * Backwards-compatible wrapper around logOperation.
 */
export const logDeleteOperation = async (params: LogDeleteParams): Promise<void> => {
  await logOperation({
    action: 'DELETE',
    collectionName: params.collectionName,
    recordId: params.recordId,
    before: params.recordData,
    userId: params.userId,
    username: params.username,
    ipAddress: params.ipAddress,
    details: params.details,
  })
}

/**
 * Get audit log entries with optional filters.
 */
export const getAuditLogs = async (filters: {
  action?: string
  collectionName?: string
  userId?: string
  startDate?: string
  endDate?: string
  limit?: number
}) => {
  const query: Record<string, unknown> = {}

  if (filters.action) query.action = filters.action
  if (filters.collectionName) query.collectionName = filters.collectionName
  if (filters.userId) query.userId = filters.userId

  if (filters.startDate || filters.endDate) {
    const dateFilter: Record<string, Date> = {}
    if (filters.startDate) dateFilter.$gte = new Date(filters.startDate)
    if (filters.endDate) dateFilter.$lte = new Date(filters.endDate)
    query.timestamp = dateFilter
  }

  return AuditLog.find(query)
    .sort({ timestamp: -1 })
    .limit(filters.limit || 100)
    .lean()
}
