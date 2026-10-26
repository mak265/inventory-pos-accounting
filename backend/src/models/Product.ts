import mongoose, { Schema, Document } from 'mongoose';

// Sub-document: Selling UOM
export interface ISellingUom {
  uomId: mongoose.Types.ObjectId;
  uomAbbreviation: string;
  conversionFactor: number;
  sellingPrice: number;
}

// Sub-document: Vendor Cost
export interface IVendorCost {
  vendorId: mongoose.Types.ObjectId;
  vendorName: string;
  unitCost: number;
  grossCost?: number;
  discount1?: number; discount1Mode?: string;
  discount2?: number; discount2Mode?: string;
  discount3?: number; discount3Mode?: string;
  discount4?: number; discount4Mode?: string;
  netCost?: number;
  lastPurchaseQty?: number;
  lastUpdated: Date;
  isPreferred: boolean;
  notes?: string;
}

// VOM Data (extended with reason tracking)
export interface IVOMData {
  date: Date;
  quantityIn: number;
  quantityOut: number;
  balance: number;
  reason?: string;
  adjustedBy?: string;
  referenceType?: string;
  referenceId?: string;
}

export interface IProduct extends Document {
  code: string;
  description: string;
  availableStock: number;
  minStock: number;
  lastCost?: number;
  averageCost?: number;
  lastDiscounts?: {
    discount1: number; discount1Mode: string;
    discount2: number; discount2Mode: string;
    discount3: number; discount3Mode: string;
    discount4: number; discount4Mode: string;
    grossCost: number;
    netCost: number;
  };
  sellingPrice?: number;
  markupPercentage?: number;
  markupType: 'percentage' | 'fixed';
  fixedMarkupAmount?: number;
  uom: string;
  uomId?: mongoose.Types.ObjectId;
  sellingUoms: ISellingUom[];
  vendorCosts: IVendorCost[];
  vomData: IVOMData[];
  createdAt: Date;
  createdBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
  syncVersion: number;
  isDeleted: boolean;
  isActive: boolean;
}

const SellingUomSchema = new Schema<ISellingUom>({
  uomId: {
    type: Schema.Types.ObjectId,
    ref: 'UOM',
    required: true
  },
  uomAbbreviation: {
    type: String,
    required: true,
    trim: true
  },
  conversionFactor: {
    type: Number,
    required: true,
    min: [0.001, 'Conversion factor must be greater than zero']
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: [0, 'Selling price cannot be negative']
  }
}, { _id: false });

const VendorCostSchema = new Schema<IVendorCost>({
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
  unitCost: {
    type: Number,
    required: true,
    min: [0, 'Unit cost cannot be negative']
  },
  grossCost: { type: Number, default: 0 },
  discount1: { type: Number, default: 0 },
  discount1Mode: { type: String, default: 'subtract' },
  discount2: { type: Number, default: 0 },
  discount2Mode: { type: String, default: 'subtract' },
  discount3: { type: Number, default: 0 },
  discount3Mode: { type: String, default: 'subtract' },
  discount4: { type: Number, default: 0 },
  discount4Mode: { type: String, default: 'subtract' },
  netCost: { type: Number, default: 0 },
  lastPurchaseQty: {
    type: Number,
    min: [0, 'Last purchase quantity cannot be negative']
  },
  lastUpdated: {
    type: Date,
    required: true,
    default: Date.now
  },
  isPreferred: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    trim: true
  }
}, { _id: false });

const VOMDataSchema = new Schema<IVOMData>({
  date: { type: Date, required: true },
  quantityIn: { type: Number, default: 0 },
  quantityOut: { type: Number, default: 0 },
  balance: { type: Number, required: true },
  reason: { type: String },
  adjustedBy: { type: String },
  referenceType: { type: String },
  referenceId: { type: String }
}, { _id: false });

const ProductSchema = new Schema<IProduct>({
  code: {
    type: String,
    required: [true, 'Product code is required'],
    trim: true,
    index: true
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true,
    index: true
  },
  availableStock: {
    type: Number,
    default: 0
    // No min validator — stock can go negative (counts not yet accurate)
  },
  minStock: {
    type: Number,
    default: 0,
    min: [0, 'Min stock cannot be negative']
  },
  lastCost: {
    type: Number,
    min: [0, 'Last cost cannot be negative']
  },
  averageCost: {
    type: Number,
    min: [0, 'Average cost cannot be negative']
  },
  lastDiscounts: {
    type: {
      discount1: { type: Number, default: 0 },
      discount1Mode: { type: String, default: 'subtract' },
      discount2: { type: Number, default: 0 },
      discount2Mode: { type: String, default: 'subtract' },
      discount3: { type: Number, default: 0 },
      discount3Mode: { type: String, default: 'subtract' },
      discount4: { type: Number, default: 0 },
      discount4Mode: { type: String, default: 'subtract' },
      grossCost: { type: Number, default: 0 },
      netCost: { type: Number, default: 0 }
    },
    default: undefined
  },
  sellingPrice: {
    type: Number,
    min: [0, 'Selling price cannot be negative']
  },
  markupPercentage: {
    type: Number,
    min: [0, 'Markup percentage cannot be negative']
  },
  markupType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  fixedMarkupAmount: {
    type: Number,
    min: [0, 'Fixed markup amount cannot be negative']
  },
  uom: {
    type: String,
    required: [true, 'Unit of measure is required'],
    trim: true
  },
  uomId: {
    type: Schema.Types.ObjectId,
    ref: 'UOM'
  },
  sellingUoms: {
    type: [SellingUomSchema],
    default: []
  },
  vendorCosts: {
    type: [VendorCostSchema],
    default: []
  },
  vomData: {
    type: [VOMDataSchema],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  syncVersion: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Pre-save hook for audit trail
ProductSchema.pre('save', function() {
  this.updatedAt = new Date();
  this.syncVersion += 1;
  // Negative stock is allowed for oversold items.
});

// Index for soft delete queries
ProductSchema.index({ isDeleted: 1, code: 1 });
ProductSchema.index({ isDeleted: 1, description: 1 });

const Product = mongoose.model<IProduct>('Product', ProductSchema);

export default Product;
