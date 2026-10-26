import { Request, Response } from 'express';
import * as customerService from '../services/customerService.js';
import { logDeleteOperation } from '../services/auditLogService.js';
import { validateCustomer } from '../services/validationService.js';
import { checkDeleteSafety } from '../services/referentialIntegrityService.js';

export const getCustomers = async (req: Request, res: Response) => {
  try {
    const filters = {
      search: req.query.search as string
    };

    const customers = await customerService.getAllCustomers(filters);
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

export const getCustomer = async (req: Request, res: Response) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id as string);
    res.json(customer);
  } catch (error: any) {
    console.error('Error fetching customer:', error);
    if (error.message === 'Customer not found' || error.message === 'Invalid customer ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch customer' });
    }
  }
};

export const getCustomerHistory = async (req: Request, res: Response) => {
  try {
    const history = await customerService.getCustomerHistory(req.params.id as string);
    res.json(history);
  } catch (error: any) {
    console.error('Error fetching customer history:', error);
    if (error.message === 'Customer not found' || error.message === 'Invalid customer ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch customer history' });
    }
  }
};

export const getCustomerBalance = async (req: Request, res: Response) => {
  try {
    const balance = await customerService.getCustomerBalance(req.params.id as string);
    res.json(balance);
  } catch (error: any) {
    console.error('Error fetching customer balance:', error);
    if (error.message === 'Customer not found' || error.message === 'Invalid customer ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch customer balance' });
    }
  }
};

export const createCustomer = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Validate data integrity before save
    const validation = validateCustomer(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const customer = await customerService.createCustomer(req.body, userId);
    res.status(201).json(customer);
  } catch (error: any) {
    console.error('Error creating customer:', error);
    if (error.name === 'ValidationError') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create customer' });
    }
  }
};

export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const customer = await customerService.updateCustomer(req.params.id as string, req.body, userId);
    res.json(customer);
  } catch (error: any) {
    console.error('Error updating customer:', error);
    if (error.message === 'Customer not found' || error.message === 'Invalid customer ID') {
      res.status(404).json({ error: error.message });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update customer' });
    }
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const username = (req as any).user.username;

    // Check referential integrity before delete
    const safety = await checkDeleteSafety('customers', req.params.id as string);
    if (!safety.valid) {
      return res.status(400).json({ error: 'Cannot delete: referential integrity violation', details: safety.errors });
    }

    // Get customer data before deletion for audit log
    const customer = await customerService.getCustomerById(req.params.id as string);

    const result = await customerService.deleteCustomer(req.params.id as string, userId);

    await logDeleteOperation({
      collectionName: 'customers',
      recordId: req.params.id as string,
      recordData: customer as unknown as Record<string, unknown>,
      userId,
      username,
      ipAddress: req.ip,
      details: `Customer "${customer.name}" deleted`,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error deleting customer:', error);
    if (error.message === 'Customer not found' || error.message === 'Invalid customer ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  }
};
