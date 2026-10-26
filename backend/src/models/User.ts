import mongoose, { Document, Schema } from 'mongoose'
import bcrypt from 'bcrypt'

export interface IUser extends Document {
  username: string
  passwordHash: string
  role: 'ADMIN' | 'CASHIER' | 'MANAGER' | 'VIEWER'
  fullName: string
  isActive: boolean
  createdAt: Date
  lastLogin?: Date
  comparePassword(candidatePassword: string): Promise<boolean>
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['ADMIN', 'CASHIER', 'MANAGER', 'VIEWER'],
      default: 'CASHIER',
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
)

// Index for faster username lookups
userSchema.index({ username: 1 })

// Hash password before saving (Mongoose 9: no next callback, just async/await)
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return
  const salt = await bcrypt.genSalt(10)
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt)
})

// Method to compare passwords
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash)
}

// Remove password from JSON output
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    return ret
  },
})

export const User = mongoose.model<IUser>('User', userSchema)
