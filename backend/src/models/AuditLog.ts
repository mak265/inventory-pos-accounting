import mongoose, { Document, Schema } from 'mongoose'

export interface IAuditLog extends Document {
  action: 'DELETE' | 'CREATE' | 'UPDATE'
  collectionName: string
  recordId: string
  recordData: Record<string, unknown>
  userId: string
  username: string
  timestamp: Date
  ipAddress?: string
  details?: string
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      enum: ['DELETE', 'CREATE', 'UPDATE'],
      required: [true, 'Action is required'],
    },
    collectionName: {
      type: String,
      required: [true, 'Collection name is required'],
    },
    recordId: {
      type: String,
      required: [true, 'Record ID is required'],
    },
    recordData: {
      type: Schema.Types.Mixed,
      required: [true, 'Record data is required'],
    },
    userId: {
      type: String,
      required: [true, 'User ID is required'],
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      default: 'unknown',
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    ipAddress: {
      type: String,
    },
    details: {
      type: String,
    },
  },
  {
    timestamps: false,
  }
)

// Indexes for efficient querying
auditLogSchema.index({ action: 1, timestamp: -1 })
auditLogSchema.index({ collectionName: 1, recordId: 1 })
auditLogSchema.index({ userId: 1, timestamp: -1 })

// IMMUTABILITY: Prevent updates to audit log entries
auditLogSchema.pre('updateOne', function () {
  throw new Error('Audit log entries are immutable and cannot be updated')
})

auditLogSchema.pre('updateMany', function () {
  throw new Error('Audit log entries are immutable and cannot be updated')
})

auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit log entries are immutable and cannot be updated')
})

// IMMUTABILITY: Prevent deletes of audit log entries
auditLogSchema.pre('deleteOne', function () {
  throw new Error('Audit log entries are immutable and cannot be deleted')
})

auditLogSchema.pre('deleteMany', function () {
  throw new Error('Audit log entries are immutable and cannot be deleted')
})

auditLogSchema.pre('findOneAndDelete', function () {
  throw new Error('Audit log entries are immutable and cannot be deleted')
})

// Prevent save on existing documents (updates via save)
auditLogSchema.pre('save', function () {
  if (!this.isNew) {
    throw new Error('Audit log entries are immutable and cannot be modified')
  }
})

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema)
