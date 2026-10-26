import mongoose, { Schema, Document } from 'mongoose';

export interface IDRLineItem {
  productId?: mongoose.Types.ObjectId;
  description: string;
  uom?: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  discount1: number;
  discount1Mode: 'subtract' | 'add';
  discount2: number;
  discount2Mode: 'subtract' | 'add';
  discount3: number;
  discount3Mode: 'subtract' | 'add';
  discount4: number;
  discount4Mode: 'subtract' | 'add';
  netCost: number;
}

export interface IDeliveryReceipt extends Document {
  drNumber: string;
  poId?: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  vendorName: string;
  vendorAddress?: string;
  terms?: string;
  siNumber?: string;
  referenceNumber?: string;
  deliveryDate: Date;
  barcode?: string;
  status: 'PENDING' | 'POSTED';
  lineItems: IDRLineItem[];
  postedAt?: Date;
  postedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId;
  syncVersion: number;
  isDeleted: boolean;
}

const DRLineItemSchema: Schema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },
  code: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  uom: {
    type: String,
    trim: true,
    default: ''
  },
  quantityOrdered: {
    type: Number,
    required: true,
    min: 0
  },
  quantityReceived: {
    type: Number,
    required: true,
    min: 0
  },
  unitCost: {
    type: Number,
    required: true,
    min: 0
  },
  discount1: { type: Number, default: 0 },
  discount1Mode: { type: String, enum: ['subtract', 'add'], default: 'subtract' },
  discount2: { type: Number, default: 0 },
  discount2Mode: { type: String, enum: ['subtract', 'add'], default: 'subtract' },
  discount3: { type: Number, default: 0 },
  discount3Mode: { type: String, enum: ['subtract', 'add'], default: 'subtract' },
  discount4: { type: Number, default: 0 },
  discount4Mode: { type: String, enum: ['subtract', 'add'], default: 'subtract' },
  netCost: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

const DeliveryReceiptSchema: Schema = new Schema({
  drNumber: {
    type: String,
    required: true,
    trim: true
  },
  poId: {
    type: Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  },
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  vendorName: {
    type: String,
    required: true,
    trim: true
  },
  vendorAddress: {
    type: String,
    trim: true
  },
  terms: {
    type: String,
    trim: true
  },
  siNumber: {
    type: String,
    trim: true,
    default: ''
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  deliveryDate: {
    type: Date,
    required: true
  },
  barcode: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'POSTED'],
    default: 'PENDING'
  },
  lineItems: {
    type: [DRLineItemSchema],
    required: true,
    validate: {
      validator: function(items: IDRLineItem[]) {
        return items.length > 0;
      },
      message: 'Delivery receipt must have at least one line item'
    }
  },
  postedAt: {
    type: Date
  },
  postedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  totalAmount: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['UNPAID', 'PARTIAL', 'PAID'], default: 'UNPAID' },
  paymentHistory: [{
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    method: { type: String, default: 'CASH' },
    reference: { type: String, default: '' },
    effectiveDate: { type: Date },
    notes: { type: String, default: '' }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
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

// Create indexes
DeliveryReceiptSchema.index({ drNumber: 1 });
DeliveryReceiptSchema.index({ poId: 1 });
DeliveryReceiptSchema.index({ vendorId: 1 });
DeliveryReceiptSchema.index({ status: 1 });
DeliveryReceiptSchema.index({ deliveryDate: -1 });
DeliveryReceiptSchema.index({ isDeleted: 1 });

// Update syncVersion on save
DeliveryReceiptSchema.pre('save', function() {
  this.syncVersion += 1;
});

export default mongoose.model<IDeliveryReceipt>('DeliveryReceipt', DeliveryReceiptSchema);
