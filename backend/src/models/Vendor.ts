import mongoose, { Schema, Document } from 'mongoose';

export interface IVendor extends Document {
  name: string;
  address?: string;
  termsOfPayment?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedAt: Date;
  updatedBy: mongoose.Types.ObjectId;
  syncVersion: number;
  isDeleted: boolean;
}

const VendorSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  termsOfPayment: {
    type: String,
    trim: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  tin: {
    type: String,
    trim: true
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
VendorSchema.index({ name: 1 });
VendorSchema.index({ isDeleted: 1 });
VendorSchema.index({ isDeleted: 1, name: 1 });

// Update timestamps on save
VendorSchema.pre('save', function() {
  this.updatedAt = new Date();
});

export default mongoose.model<IVendor>('Vendor', VendorSchema);
