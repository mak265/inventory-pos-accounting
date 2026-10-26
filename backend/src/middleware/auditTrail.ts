import { Request, Response, NextFunction } from 'express'
import { AuditLog } from '../models/AuditLog.js'

/**
 * Audit trail middleware that automatically sets createdAt/createdBy on creation
 * and updatedAt/updatedBy on update for all model operations.
 *
 * This middleware attaches audit context to the request so that Mongoose
 * pre-save hooks can use it.
 */

export interface AuditContext {
  userId: string
  username: string
}

/**
 * Express middleware that extracts user info from the authenticated request
 * and attaches it as audit context for downstream Mongoose hooks.
 */
export const attachAuditContext = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user) {
    ;(req as any).auditContext = {
      userId: req.user.userId,
      username: req.user.username,
    } as AuditContext
  }
  next()
}

/**
 * Creates an immutable audit log entry for significant operations.
 * Records before/after snapshots for tracking changes.
 */
export const createAuditLogEntry = async (params: {
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  collectionName: string
  recordId: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  userId: string
  username: string
  ipAddress?: string
  details?: string
}): Promise<void> => {
  try {
    const recordData: Record<string, unknown> = {}
    if (params.before) recordData.before = params.before
    if (params.after) recordData.after = params.after

    await AuditLog.create({
      action: params.action,
      collectionName: params.collectionName,
      recordId: params.recordId,
      recordData: Object.keys(recordData).length > 0 ? recordData : { snapshot: params.after || params.before },
      userId: params.userId,
      username: params.username,
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
 * Applies audit trail fields to a document being created.
 * Sets createdAt, createdBy, updatedAt, updatedBy.
 */
export const applyCreationAudit = (doc: any, userId: string): void => {
  const now = new Date()
  doc.createdAt = now
  doc.createdBy = userId
  doc.updatedAt = now
  doc.updatedBy = userId
}

/**
 * Applies audit trail fields to a document being updated.
 * Sets updatedAt, updatedBy.
 */
export const applyUpdateAudit = (doc: any, userId: string): void => {
  doc.updatedAt = new Date()
  doc.updatedBy = userId
}
