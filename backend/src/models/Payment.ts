import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentChannel {
  channel: 'CASH' | 'GCASH' | 'BPI' | 'AUB' | 'BPI ONLINE' | 'AUB ONLINE' | 'MAYA' | 'CHECK' | 'OTHER_BANK';
  amount: number;
  referenceNumber?: string;
  accountName?: string;
  effectiveDate?: Date;
}

export interface IPayment extends Document {
  saleId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  paymentDate: Date;
  referenceNumber?: string;
  siNumber?: string;
  amountDue: number;
  cashPayment: number;
  chargePayment: number;
  paymentChannels: IPaymentChannel[];
  totalPaid: number;
  unpaidAmount: number;
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId;
  syncVersion: number;
  isDeleted: boolean;
}

const PaymentChannelSchema = new Schema<IPaymentChannel>({
  channel: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: [0.01, 'Payment amount must be greater than zero']
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  accountName: {
    type: String,
    trim: true
  },
  effectiveDate: {
    type: Date
  }
}, { _id: false });

const PaymentSchema = new Schema<IPayment>({
  saleId: {
    type: Schema.Types.ObjectId,
    ref: 'Sale',
    required: [true, 'Sale reference is required'],
    index: true
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    index: true
  },
  paymentDate: {
    type: Date,
    required: [true, 'Payment date is required'],
    index: true
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  siNumber: {
    type: String,
    trim: true,
    default: '',
    index: true
  },
  amountDue: {
    type: Number,
    required: true,
    min: [0, 'Amount due cannot be negative']
  },
  cashPayment: {
    type: Number,
    default: 0,
    min: [0, 'Cash payment cannot be negative']
  },
  chargePayment: {
    type: Number,
    default: 0,
    min: [0, 'Charge payment cannot be negative']
  },
  paymentChannels: {
    type: [PaymentChannelSchema],
    default: []
  },
  totalPaid: {
    type: Number,
    required: true,
    min: [0, 'Total paid cannot be negative']
  },
  unpaidAmount: {
    type: Number,
    required: true,
    min: [0, 'Unpaid amount cannot be negative']
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
PaymentSchema.pre('save', function() {
  this.syncVersion += 1;
});

// Indexes for common queries
PaymentSchema.index({ isDeleted: 1, paymentDate: -1 });
PaymentSchema.index({ isDeleted: 1, customerId: 1, paymentDate: -1 });
PaymentSchema.index({ isDeleted: 1, saleId: 1 });

const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);

export default Payment;
