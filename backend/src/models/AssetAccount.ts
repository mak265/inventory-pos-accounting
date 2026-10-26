import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction {
  date: Date;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  referenceId?: mongoose.Types.ObjectId;
  referenceType?: string;
}

export interface IAssetAccount extends Document {
  accountType: string;
  balance: number;
  transactions: ITransaction[];
  updatedAt: Date;
  syncVersion: number;
}

const TransactionSchema: Schema = new Schema({
  date: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ['CREDIT', 'DEBIT'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true
  },
  referenceId: {
    type: Schema.Types.ObjectId
  },
  referenceType: {
    type: String
  }
}, { _id: false });

const AssetAccountSchema: Schema = new Schema({
  accountType: {
    type: String,
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0
  },
  transactions: [TransactionSchema],
  updatedAt: {
    type: Date,
    default: Date.now
  },
  syncVersion: {
    type: Number,
    default: 0
  }
});

// Index for account type lookup
AssetAccountSchema.index({ accountType: 1 });

export default mongoose.model<IAssetAccount>('AssetAccount', AssetAccountSchema);
