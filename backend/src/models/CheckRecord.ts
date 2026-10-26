import mongoose, { Schema, Document } from 'mongoose';

export interface ICheckRecord extends Document {
  paymentId: mongoose.Types.ObjectId;
  customerName: string;
  amount: number;
  referenceNumber: string;
  accountName: string;
  effectiveDate?: Date;
  receivedDate: Date;
  status: 'PENDING' | 'CLEARED' | 'BOUNCED';
  bankAccount?: string;
  approvedDate?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  bouncedDate?: Date;
  bouncedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  syncVersion: number;
  isDeleted: boolean;
}

const CheckRecordSchema = new Schema<ICheckRecord>({
  paymentId: {
    type: Schema.Types.ObjectId,
    ref: 'Payment',
    required: [true, 'Payment reference is required'],
    index: true
  },
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than zero']
  },
  referenceNumber: {
    type: String,
    default: '',
    trim: true
  },
  accountName: {
    type: String,
    default: '',
    trim: true
  },
  effectiveDate: {
    type: Date
  },
  receivedDate: {
    type: Date,
    required: [true, 'Received date is required'],
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'CLEARED', 'BOUNCED'],
    default: 'PENDING',
    required: true,
    index: true
  },
  bankAccount: {
    type: String,
    trim: true
  },
  approvedDate: {
    type: Date
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  bouncedDate: {
    type: Date
  },
  bouncedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
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
CheckRecordSchema.pre('save', function () {
  this.syncVersion += 1;
});

// Compound indexes for common queries
CheckRecordSchema.index({ isDeleted: 1, status: 1, receivedDate: -1 });
CheckRecordSchema.index({ isDeleted: 1, paymentId: 1 });

const CheckRecord = mongoose.model<ICheckRecord>('CheckRecord', CheckRecordSchema);

export default CheckRecord;
