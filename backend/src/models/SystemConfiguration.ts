import mongoose, { Document, Schema } from 'mongoose'

export interface ISystemConfiguration extends Document {
  key: string
  companyName: string
  logoUrl: string
  tagline: string
  updatedBy?: mongoose.Types.ObjectId | string
  createdAt: Date
  updatedAt: Date
}

const systemConfigurationSchema = new Schema<ISystemConfiguration>(
  {
    key: {
      type: String,
      required: true,
      default: 'main',
    },
    companyName: {
      type: String,
      required: true,
      default: 'Inventory & POS System',
      maxlength: 100,
    },
    logoUrl: {
      type: String,
      default: '',
    },
    tagline: {
      type: String,
      default: '',
      maxlength: 200,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
)

// Unique index on key to enforce singleton pattern
systemConfigurationSchema.index({ key: 1 }, { unique: true })

export const SystemConfiguration = mongoose.model<ISystemConfiguration>(
  'SystemConfiguration',
  systemConfigurationSchema
)
