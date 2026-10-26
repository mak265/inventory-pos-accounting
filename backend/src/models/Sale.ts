import mongoose, { Schema, Document } from 'mongoose';

export interface ISaleLineItem {
  productId: mongoose.Types.ObjectId;
  description: string;
  quantity: number;
  sellingPrice: number;
  discount: number;
  lineTotal: number;
  sellingUomId?: mongoose.Types.ObjectId;
  conversionFactor?: number;
  stockBefore?: number;
  stockAfter?: number;
}

export interface ISale extends Document {
  drNumber: string;
  documentType: 'DR' | 'SI' | 'PU';
  saleDate: Date;
  customerId: mongoose.Types.ObjectId;
  customerName: string;
  officeAddress?: string;
  deliveryAddress?: string;
  tin?: string;
  lineItems: ISaleLineItem[];
  totalAmount: number;
  deliveryFee: number;
  tollFee: number;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  postedAt?: Date;
  postedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedAt: Date;
  updatedBy: mongoose.Types.ObjectId;
  syncVersion: number;
  isDeleted: boolean;
}

const SaleLineItemSchema = new Schema<ISaleLineItem>({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [-99999, 'Quantity out of range']
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: [0, 'Selling price cannot be negative']
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  lineTotal: {
    type: Number,
    required: true,
    min: [-999999, 'Line total out of range']
  },
  sellingUomId: {
    type: Schema.Types.ObjectId,
    ref: 'UOM'
  },
  conversionFactor: {
    type: Number,
    default: 1,
    min: [0.001, 'Conversion factor must be greater than zero']
  },
  stockBefore: {
    type: Number,
    default: null
  },
  stockAfter: {
    type: Number,
    default: null
  }
}, { _id: false });

const SaleSchema = new Schema<ISale>({
  drNumber: {
    type: String,
    required: [true, 'Document number is required'],
    trim: true,
    index: true
  },
  documentType: {
    type: String,
    enum: ['DR', 'SI', 'PU', 'DL', 'POS'],
    default: 'DR',
    index: true
  },
  saleDate: {
    type: Date,
    required: [true, 'Sale date is required'],
    index: true
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    index: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  officeAddress: {
    type: String,
    trim: true
  },
  deliveryAddress: {
    type: String,
    trim: true
  },
  tin: {
    type: String,
    trim: true
  },
  lineItems: {
    type: [SaleLineItemSchema],
    required: true,
    validate: {
      validator: function(items: ISaleLineItem[]) {
        return items.length > 0;
      },
      message: 'At least one line item is required'
    }
  },
  totalAmount: {
    type: Number,
    required: true,
    min: [-999999, 'Total amount out of range']
  },
  deliveryFee: {
    type: Number,
    default: 0,
    min: [0, 'Delivery fee cannot be negative']
  },
  tollFee: {
    type: Number,
    default: 0,
    min: [0, 'Toll fee cannot be negative']
  },
  notes: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['DRAFT', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT',
    index: true
  },
  postedAt: {
    type: Date
  },
  postedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
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
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Pre-save hook for audit trail
SaleSchema.pre('save', function() {
  this.updatedAt = new Date();
  this.syncVersion += 1;
});

// Indexes for common queries
SaleSchema.index({ isDeleted: 1, saleDate: -1 });
SaleSchema.index({ isDeleted: 1, customerId: 1, saleDate: -1 });
SaleSchema.index({ isDeleted: 1, status: 1 });

const Sale = mongoose.model<ISale>('Sale', SaleSchema);

export default Sale;
