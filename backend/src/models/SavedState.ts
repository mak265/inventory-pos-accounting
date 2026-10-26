import mongoose, { Document, Schema } from 'mongoose'

export interface ISavedState extends Document {
  collectionName: string
  recordId: string
  savedData: Record<string, unknown>
  savedAt: Date
  savedBy: string
}

const savedStateSchema = new Schema<ISavedState>(
  {
    collectionName: {
      type: String,
      required: true,
    },
    recordId: {
      type: String,
      required: true,
    },
    savedData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    savedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    savedBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  }
)

// Compound index: one saved state per record per collection
savedStateSchema.index({ collectionName: 1, recordId: 1 }, { unique: true })

export const SavedState = mongoose.model<ISavedState>('SavedState', savedStateSchema)
