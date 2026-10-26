import Expense, { IExpense } from '../models/Expense.js';
import AssetAccount from '../models/AssetAccount.js';
import mongoose from 'mongoose';

export interface CreateExpenseData {
  expenseDate: Date;
  description: string;
  amount: number;
  category?: string;
  isPettyCash: boolean;
  paymentStatus: 'PAID' | 'UNPAID';
  paidFrom?: 'CASH' | 'GCASH LOUIE' | 'GCASH KATRINA' | 'GCASH ANICIA' | 'MAYA' | 'BPI ONLINE' | 'AUB ONLINE' | 'BPI' | 'AUB' | 'GCASH' | 'CHECK';
  createdBy: string;
}

export interface ExpenseFilters {
  startDate?: Date;
  endDate?: Date;
  category?: string;
  isPettyCash?: boolean;
  paymentStatus?: 'PAID' | 'UNPAID';
}

export const createExpense = async (data: CreateExpenseData): Promise<IExpense> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expense = new Expense({
      ...data,
      createdBy: new mongoose.Types.ObjectId(data.createdBy)
    });

    await expense.save({ session });

    const resolveAssetAccount = (paidFrom?: string): 'CASH' | 'GCASH' | 'BANK' | 'CHECK' | null => {
      const channel = String(paidFrom || '').trim().toUpperCase();
      if (!channel) return null;
      if (channel === 'CASH') return 'CASH';
      if (channel === 'CHECK') return 'CHECK';
      if (channel === 'GCASH' || channel === 'GCASH LOUIE' || channel === 'GCASH KATRINA' || channel === 'GCASH ANICIA') return 'GCASH';
      if (channel === 'BPI' || channel === 'AUB' || channel === 'BPI ONLINE' || channel === 'AUB ONLINE' || channel === 'MAYA') return 'BANK';
      return null;
    };

    // If paid and from a specific channel, update mapped asset account
    if (data.paymentStatus === 'PAID' && data.paidFrom) {
      const mappedAccountType = resolveAssetAccount(data.paidFrom);
      const assetAccount = mappedAccountType
        ? await AssetAccount.findOne({ accountType: mappedAccountType }).session(session)
        : null;
      
      if (assetAccount) {
        assetAccount.balance -= data.amount;
        assetAccount.transactions.push({
          date: data.expenseDate,
          type: 'DEBIT',
          amount: data.amount,
          description: `Expense: ${data.description}`,
          referenceId: expense._id,
          referenceType: 'Expense'
        });
        assetAccount.updatedAt = new Date();
        assetAccount.syncVersion += 1;
        await assetAccount.save({ session });
      }
    }

    // If petty cash, deduct from CASH account
    if (data.isPettyCash && data.paymentStatus === 'PAID') {
      const cashAccount = await AssetAccount.findOne({ accountType: 'CASH' }).session(session);
      
      if (cashAccount) {
        cashAccount.balance -= data.amount;
        cashAccount.transactions.push({
          date: data.expenseDate,
          type: 'DEBIT',
          amount: data.amount,
          description: `Petty Cash: ${data.description}`,
          referenceId: expense._id,
          referenceType: 'Expense'
        });
        cashAccount.updatedAt = new Date();
        cashAccount.syncVersion += 1;
        await cashAccount.save({ session });
      }
    }

    await session.commitTransaction();
    return expense;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const getExpenses = async (filters: ExpenseFilters): Promise<IExpense[]> => {
  const query: any = { isDeleted: false };

  if (filters.startDate || filters.endDate) {
    query.expenseDate = {};
    if (filters.startDate) {
      query.expenseDate.$gte = filters.startDate;
    }
    if (filters.endDate) {
      query.expenseDate.$lte = filters.endDate;
    }
  }

  if (filters.category) {
    query.category = filters.category;
  }

  if (filters.isPettyCash !== undefined) {
    query.isPettyCash = filters.isPettyCash;
  }

  if (filters.paymentStatus) {
    query.paymentStatus = filters.paymentStatus;
  }

  return Expense.find(query).sort({ expenseDate: -1 }).populate('createdBy', 'username fullName');
};

export const getPettyCashBalance = async (): Promise<number> => {
  const cashAccount = await AssetAccount.findOne({ accountType: 'CASH' });
  return cashAccount ? cashAccount.balance : 0;
};

export const getPettyCashThreshold = (): number => {
  // Configurable threshold - could be moved to environment variable
  return 1000;
};

export const isPettyCashLow = async (): Promise<boolean> => {
  const balance = await getPettyCashBalance();
  const threshold = getPettyCashThreshold();
  return balance < threshold;
};


interface DateRange {
  startDate?: Date;
  endDate?: Date;
}

interface ExpenseReport {
  totalExpenses: number;
  pettyCashExpenses: number;
  paidExpenses: number;
  unpaidExpenses: number;
  pettyCashBalance: number;
  isLowBalance: boolean;
  expenses: any[];
}

/**
 * Get expense report with summary
 * Validates: Requirements 8.4, 8.5, 8.7
 */
export const getExpenseReport = async (dateRange?: DateRange): Promise<ExpenseReport> => {
  const filters: ExpenseFilters = {};
  
  if (dateRange?.startDate) {
    filters.startDate = dateRange.startDate;
  }
  if (dateRange?.endDate) {
    filters.endDate = dateRange.endDate;
  }
  
  const expenses = await getExpenses(filters);
  
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const pettyCashExpenses = expenses
    .filter(exp => exp.isPettyCash)
    .reduce((sum, exp) => sum + exp.amount, 0);
  const paidExpenses = expenses
    .filter(exp => exp.paymentStatus === 'PAID')
    .reduce((sum, exp) => sum + exp.amount, 0);
  const unpaidExpenses = expenses
    .filter(exp => exp.paymentStatus === 'UNPAID')
    .reduce((sum, exp) => sum + exp.amount, 0);
  
  const pettyCashBalance = await getPettyCashBalance();
  const isLowBalance = await isPettyCashLow();
  
  return {
    totalExpenses,
    pettyCashExpenses,
    paidExpenses,
    unpaidExpenses,
    pettyCashBalance,
    isLowBalance,
    expenses: expenses.map(exp => ({
      _id: exp._id,
      expenseDate: exp.expenseDate,
      description: exp.description,
      amount: exp.amount,
      category: exp.category,
      isPettyCash: exp.isPettyCash,
      paymentStatus: exp.paymentStatus,
      paidFrom: exp.paidFrom,
    })),
  };
};
