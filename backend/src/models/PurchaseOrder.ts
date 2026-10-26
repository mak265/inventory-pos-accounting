import mongoose, { Schema, Document } from 'mongoose';

export interface IPOLineItem {
  productId?: mongoose.Types.ObjectId;
  description: string;
  quantity: number;
  uomCode: string;
  uomValue: string;
  unitCost: number;
  supplierDiscount: number;
  lineTotal: number;
}

export interface IPurchaseOrder extends Document {
  poNumber: string;
  poDate: Date;
  vendorId: mongoose.Types.ObjectId;
  lineItems: IPOLineItem[];
  totalAmount: number;
  status: 'DRAFT' | 'SUBMITTED' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedAt: Date;
  updatedBy: mongoose.Types.ObjectId;
  syncVersion: number;
  isDeleted: boolean;
}

const POLineItemSchema: Schema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  uomCode: {
    type: String,
    required: true,
    trim: true
  },
  uomValue: {
    type: String,
    required: true,
    trim: true
  },
  unitCost: {
    type: Number,
    required: true,
    min: 0
  },
  supplierDiscount: {
    type: Number,
    default: 0,
    min: 0
  },
  lineTotal: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const PurchaseOrderSchema: Schema = new Schema({
  poNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  poDate: {
    type: Date,
    required: true
  },
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  lineItems: {
    type: [POLineItemSchema],
    required: true,
    validate: {
      validator: function(items: IPOLineItem[]) {
        return items.length > 0;
      },
      message: 'Purchase order must have at least one line item'
    }
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'PARTIAL', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT'
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

// Create index for poNumber
PurchaseOrderSchema.index({ poNumber: 1 });
PurchaseOrderSchema.index({ vendorId: 1 });
PurchaseOrderSchema.index({ status: 1 });
PurchaseOrderSchema.index({ poDate: -1 });

// Update timestamps on save
PurchaseOrderSchema.pre('save', function() {
  this.updatedAt = new Date();
});

export default mongoose.model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema);
