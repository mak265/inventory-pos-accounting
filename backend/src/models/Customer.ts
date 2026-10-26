import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomer extends Document {
  name: string;
  officeAddress?: string;
  deliveryAddress?: string;
  phone?: string;
  tin?: string;
  balance: number;
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedAt: Date;
  updatedBy: mongoose.Types.ObjectId;
  syncVersion: number;
  isDeleted: boolean;
}

const CustomerSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true // Index for alphabetical sorting
  },
  officeAddress: {
    type: String,
    trim: true
  },
  deliveryAddress: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  tin: {
    type: String,
    trim: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  advanceBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  syncVersion: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
});

// Indexes for common queries
CustomerSchema.index({ isDeleted: 1 });
CustomerSchema.index({ isDeleted: 1, name: 1 });
CustomerSchema.index({ isDeleted: 1, balance: 1 });

// Update timestamps on save
CustomerSchema.pre('save', function() {
  this.updatedAt = new Date();
});

export default mongoose.model<ICustomer>('Customer', CustomerSchema);
