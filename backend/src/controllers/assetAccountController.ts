import { Request, Response } from 'express';
import * as assetAccountService from '../services/assetAccountService.js';

export const getAssetAccounts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const accounts = await assetAccountService.getAssetAccounts();
    res.json(accounts);
  } catch (error: any) {
    console.error('Error fetching asset accounts:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch asset accounts' });
  }
};

export const getAssetAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { accountType } = req.params;
    const account = await assetAccountService.getAssetAccount(accountType as assetAccountService.AccountType);
    
    if (!account) {
      res.status(404).json({ error: 'Asset account not found' });
      return;
    }

    res.json(account);
  } catch (error: any) {
    console.error('Error fetching asset account:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch asset account' });
  }
};

export const getAccountTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { accountType } = req.params;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const transactions = await assetAccountService.getAccountTransactions(
      accountType as assetAccountService.AccountType,
      startDate,
      endDate
    );

    res.json(transactions);
  } catch (error: any) {
    console.error('Error fetching account transactions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch account transactions' });
  }
};

export const initializeAccounts = async (_req: Request, res: Response): Promise<void> => {
  try {
    await assetAccountService.initializeAssetAccounts();
    res.json({ message: 'Asset accounts initialized successfully' });
  } catch (error: any) {
    console.error('Error initializing asset accounts:', error);
    res.status(500).json({ error: error.message || 'Failed to initialize asset accounts' });
  }
};
