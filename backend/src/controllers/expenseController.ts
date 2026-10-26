import { Request, Response } from 'express';
import * as expenseService from '../services/expenseService.js';
import { validateExpense } from '../services/validationService.js';

export const createExpense = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate data integrity before save
    const validation = validateExpense(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: 'Validation failed', details: validation.errors });
      return;
    }

    const expenseData = {
      ...req.body,
      createdBy: userId
    };

    const expense = await expenseService.createExpense(expenseData);
    res.status(201).json(expense);
  } catch (error: any) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: error.message || 'Failed to create expense' });
  }
};

export const getExpenses = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters: expenseService.ExpenseFilters = {};

    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
    }
    if (req.query.category) {
      filters.category = req.query.category as string;
    }
    if (req.query.isPettyCash !== undefined) {
      filters.isPettyCash = req.query.isPettyCash === 'true';
    }
    if (req.query.paymentStatus) {
      filters.paymentStatus = req.query.paymentStatus as 'PAID' | 'UNPAID';
    }

    const expenses = await expenseService.getExpenses(filters);
    res.json(expenses);
  } catch (error: any) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch expenses' });
  }
};

export const getPettyCashStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const balance = await expenseService.getPettyCashBalance();
    const threshold = expenseService.getPettyCashThreshold();
    const isLow = await expenseService.isPettyCashLow();

    res.json({
      balance,
      threshold,
      isLow,
      needsReplenishment: isLow
    });
  } catch (error: any) {
    console.error('Error fetching petty cash status:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch petty cash status' });
  }
};
