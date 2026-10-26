import mongoose, { Schema, Document } from 'mongoose';

export interface IExpense extends Document {
  expenseDate: Date;
  description: string;
  amount: number;
  category?: string;
  isPettyCash: boolean;
  paymentStatus: 'PAID' | 'UNPAID';
  paidFrom?: 'CASH' | 'GCASH LOUIE' | 'GCASH KATRINA' | 'GCASH ANICIA' | 'MAYA' | 'BPI ONLINE' | 'AUB ONLINE' | 'BPI' | 'AUB' | 'GCASH' | 'CHECK';
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedAt?: Date;
  updatedBy?: mongoose.Types.ObjectId;
  syncVersion: number;
  isDeleted: boolean;
}

const ExpenseSchema: Schema = new Schema({
  expenseDate: {
    type: Date,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String
  },
  isPettyCash: {
    type: Boolean,
    default: false
  },
  paymentStatus: {
    type: String,
    enum: ['PAID', 'UNPAID'],
    required: true
  },
  paidFrom: {
    type: String,
    enum: ['CASH', 'GCASH LOUIE', 'GCASH KATRINA', 'GCASH ANICIA', 'MAYA', 'BPI ONLINE', 'AUB ONLINE', 'BPI', 'AUB', 'GCASH', 'CHECK']
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
    type: Date
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
    default: false
  }
});

// Index for filtering by date and category
ExpenseSchema.index({ expenseDate: 1, category: 1 });
ExpenseSchema.index({ isPettyCash: 1 });
ExpenseSchema.index({ isDeleted: 1, expenseDate: -1 });

export default mongoose.model<IExpense>('Expense', ExpenseSchema);
