import { Request, Response } from 'express';
import * as deliveryReceiptService from '../services/deliveryReceiptService.js';
import { logDeleteOperation } from '../services/auditLogService.js';
import { validateDeliveryReceipt } from '../services/validationService.js';
import { validateDeliveryReceiptReferences } from '../services/referentialIntegrityService.js';

export const getDeliveryReceipts = async (req: Request, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string,
      vendorId: req.query.vendorId as string,
      poId: req.query.poId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const deliveryReceipts = await deliveryReceiptService.getAllDeliveryReceipts(filters);
    res.json(deliveryReceipts);
  } catch (error) {
    console.error('Error fetching delivery receipts:', error);
    res.status(500).json({ error: 'Failed to fetch delivery receipts' });
  }
};

export const getDeliveryReceipt = async (req: Request, res: Response) => {
  try {
    const deliveryReceipt = await deliveryReceiptService.getDeliveryReceiptById(req.params.id as string);
    res.json(deliveryReceipt);
  } catch (error: any) {
    console.error('Error fetching delivery receipt:', error);
    if (error.message === 'Delivery receipt not found' || error.message === 'Invalid delivery receipt ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch delivery receipt' });
    }
  }
};

export const createDeliveryReceipt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Extract vendorId if it's an object (from q-select)
    if (req.body.vendorId && typeof req.body.vendorId === 'object') {
      const vendorObj = req.body.vendorId;
      req.body.vendorId = vendorObj._id || vendorObj;
      if (!req.body.vendorName && vendorObj.name) {
        req.body.vendorName = vendorObj.name;
      }
    }

    // Validate data integrity before save
    const validation = validateDeliveryReceipt(req.body);
    if (!validation.valid) {
      console.error('DR validation failed:', JSON.stringify(validation.errors));
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    // Validate referential integrity
    const refIntegrity = await validateDeliveryReceiptReferences(req.body);
    if (!refIntegrity.valid) {
      console.error('DR referential integrity failed:', JSON.stringify(refIntegrity.errors));
      return res.status(400).json({ error: 'Referential integrity check failed', details: refIntegrity.errors });
    }

    const deliveryReceipt = await deliveryReceiptService.createDeliveryReceipt(req.body, userId);
    res.status(201).json(deliveryReceipt);
  } catch (error: any) {
    console.error('Error creating delivery receipt:', error);
    if (error.name === 'ValidationError') {
      res.status(400).json({ error: error.message });
    } else if (error.code === 11000) {
      res.status(400).json({ error: 'Delivery receipt number already exists' });
    } else if (error.message?.includes('purchase order')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Failed to create delivery receipt' });
    }
  }
};

export const updateDeliveryReceipt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const deliveryReceipt = await deliveryReceiptService.updateDeliveryReceipt(
      req.params.id as string, 
      req.body, 
      userId
    );
    res.json(deliveryReceipt);
  } catch (error: any) {
    console.error('Error updating delivery receipt:', error);
    if (error.message === 'Delivery receipt not found' || error.message === 'Invalid delivery receipt ID') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'Cannot update a posted delivery receipt') {
      res.status(400).json({ error: error.message });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ error: error.message });
    } else if (error.message.includes('purchase order')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update delivery receipt' });
    }
  }
};

export const deleteDeliveryReceipt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const username = (req as any).user.username;

    const dr = await deliveryReceiptService.getDeliveryReceiptById(req.params.id as string);

    const result = await deliveryReceiptService.deleteDeliveryReceipt(req.params.id as string, userId);

    await logDeleteOperation({
      collectionName: 'deliveryReceipts',
      recordId: req.params.id as string,
      recordData: dr as unknown as Record<string, unknown>,
      userId,
      username,
      ipAddress: req.ip,
      details: `Delivery receipt "${dr.drNumber}" deleted`,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error deleting delivery receipt:', error);
    if (error.message === 'Delivery receipt not found' || error.message === 'Invalid delivery receipt ID') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'Cannot delete a posted delivery receipt') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete delivery receipt' });
    }
  }
};

export const postDeliveryReceipt = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    console.log(`[postDeliveryReceipt Controller] POST request for DR: ${req.params.id}, user: ${userId}`);
    
    const deliveryReceipt = await deliveryReceiptService.postDeliveryReceipt(req.params.id as string, userId);
    console.log(`[postDeliveryReceipt Controller] Successfully posted DR: ${deliveryReceipt.drNumber}`);
    res.json(deliveryReceipt);
  } catch (error: any) {
    console.error(`[postDeliveryReceipt Controller] Error posting delivery receipt:`, error.message);
    console.error(`[postDeliveryReceipt Controller] Full error:`, error);
    
    if (error.message === 'Delivery receipt not found' || error.message === 'Invalid delivery receipt ID') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'Delivery receipt is already posted') {
      res.status(400).json({ error: error.message });
    } else if (error.message.includes('Product not found')) {
      res.status(400).json({ error: error.message });
    } else if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map((e: any) => e.message);
      console.error(`[postDeliveryReceipt Controller] Validation errors:`, details);
      res.status(400).json({ error: 'Validation failed', details });
    } else if (error.code === 11000) {
      res.status(400).json({ error: 'Duplicate entry - product code or DR number already exists' });
    } else {
      console.error(`[postDeliveryReceipt Controller] Unexpected error stack:`, error.stack);
      // Return the actual error message for debugging
      res.status(400).json({ error: error.message || 'Failed to post delivery receipt' });
    }
  }
};


// POST /api/deliveries/:id/pay — Record payment to vendor for this delivery
export const payDelivery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, method, reference, effectiveDate, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be > 0' });

    const DeliveryReceipt = (await import('../models/DeliveryReceipt')).default;
    const dr = await DeliveryReceipt.findOne({ _id: id, isDeleted: false });
    if (!dr) return res.status(404).json({ error: 'Delivery receipt not found' });

    // Calculate total from line items if not set
    if (!dr.totalAmount) {
      dr.totalAmount = dr.lineItems.reduce((s: number, i: any) => s + ((i.quantityReceived || 0) * (i.netCost || i.unitCost || 0)), 0);
    }

    dr.amountPaid = (dr.amountPaid || 0) + amount;
    if (!dr.paymentHistory) dr.paymentHistory = [];
    dr.paymentHistory.push({
      date: new Date(),
      amount,
      method: method || 'CASH',
      reference: reference || '',
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
      notes: notes || ''
    });
    dr.paymentStatus = dr.amountPaid >= dr.totalAmount ? 'PAID' : 'PARTIAL';
    await dr.save();

    // Create CheckRecord for CHECK payments so they appear in Check Approvals
    if ((method || '').toUpperCase() === 'CHECK' && amount > 0) {
      try {
        const CheckRecord = (await import('../models/CheckRecord')).default;
        await CheckRecord.create({
          paymentId: dr._id, // use DR id as reference
          customerName: dr.vendorName || 'Vendor',
          amount,
          referenceNumber: reference || '',
          accountName: '',
          effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
          receivedDate: new Date(),
          status: 'PENDING'
        });
      } catch (crErr) {
        console.warn('Failed to create CheckRecord for delivery payment:', crErr);
      }
    }

    res.json(dr);
  } catch (error: any) {
    console.error('Error paying delivery:', error);
    res.status(500).json({ error: error.message || 'Failed to record payment' });
  }
};
