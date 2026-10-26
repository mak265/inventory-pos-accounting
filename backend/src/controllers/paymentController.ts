import { Request, Response } from 'express';
import * as paymentService from '../services/paymentService.js';
import { logDeleteOperation } from '../services/auditLogService.js';
import { validatePayment } from '../services/validationService.js';
import { validatePaymentReferences } from '../services/referentialIntegrityService.js';

export const getPayments = async (req: Request, res: Response) => {
  try {
    const filters = {
      customerId: req.query.customerId as string,
      saleId: req.query.saleId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const payments = await paymentService.getAllPayments(filters);
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};

export const getPayment = async (req: Request, res: Response) => {
  try {
    const payment = await paymentService.getPaymentById(req.params.id as string);
    res.json(payment);
  } catch (error: any) {
    console.error('Error fetching payment:', error);
    if (error.message === 'Payment not found' || error.message === 'Invalid payment ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch payment' });
    }
  }
};

export const createPayment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Validate data integrity before save
    const validation = validatePayment(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    // Validate referential integrity
    const refIntegrity = await validatePaymentReferences(req.body);
    if (!refIntegrity.valid) {
      return res.status(400).json({ error: 'Referential integrity check failed', details: refIntegrity.errors });
    }

    const payment = await paymentService.createPayment(req.body, userId);
    res.status(201).json(payment);
  } catch (error: any) {
    console.error('Error creating payment:', error);
    if (error.name === 'ValidationError' || error.message.includes('not found') || error.message.includes('Invalid')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create payment' });
    }
  }
};

export const deletePayment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const username = (req as any).user.username;

    const payment = await paymentService.getPaymentById(req.params.id as string);

    const result = await paymentService.deletePayment(req.params.id as string, userId);

    await logDeleteOperation({
      collectionName: 'payments',
      recordId: req.params.id as string,
      recordData: payment as unknown as Record<string, unknown>,
      userId,
      username,
      ipAddress: req.ip,
      details: `Payment "${payment.referenceNumber || payment._id}" deleted`,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error deleting payment:', error);
    if (error.message === 'Payment not found' || error.message === 'Invalid payment ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete payment' });
    }
  }
};
