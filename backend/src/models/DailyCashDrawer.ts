import mongoose, { Schema, Document } from 'mongoose';

export interface IDailyCashDrawer extends Document {
  date: Date;
  type: 'REMITTANCE' | 'CLOSE_DAY' | 'ADVANCE_PAYMENT' | 'OPENING_ADJUST';
  cashierId: mongoose.Types.ObjectId;
  cashierName: string;
  openingBalance: number;
  cashSales: number;
  checkPayments: number;
  onlinePayments: number;
  totalSales: number;
  expenses: number;
  closingBalance: number;
  remittedAmount: number;
  carryOver: number;
  actualCashCount?: number;
  overShort?: number;
  paymentChannel?: string;
  paymentAccountName?: string;
  paymentReference?: string;
  notes: string;
  closedAt: Date;
  closedBy: mongoose.Types.ObjectId;
}

const DailyCashDrawerSchema: Schema = new Schema({
  date: { type: Date, required: true, index: true },
  type: { type: String, enum: ['REMITTANCE', 'CLOSE_DAY', 'ADVANCE_PAYMENT', 'OPENING_ADJUST'], default: 'REMITTANCE' },
  cashierId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  cashierName: { type: String, required: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String },
  openingBalance: { type: Number, default: 0 },
  cashSales: { type: Number, default: 0 },
  checkPayments: { type: Number, default: 0 },
  onlinePayments: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
  expenses: { type: Number, default: 0 },
  closingBalance: { type: Number, default: 0 },
  remittedAmount: { type: Number, default: 0 },
  carryOver: { type: Number, default: 0 },
  actualCashCount: { type: Number, default: 0 },
  overShort: { type: Number, default: 0 },
  paymentChannel: { type: String, default: '' },
  paymentAccountName: { type: String, default: '' },
  paymentReference: { type: String, default: '' },
  notes: { type: String, default: '' },
  closedAt: { type: Date, default: Date.now },
  closedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
});

DailyCashDrawerSchema.index({ date: 1, cashierId: 1 });

export default mongoose.model<IDailyCashDrawer>('DailyCashDrawer', DailyCashDrawerSchema);
