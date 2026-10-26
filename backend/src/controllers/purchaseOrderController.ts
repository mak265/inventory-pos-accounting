import { Request, Response } from 'express';
import * as purchaseOrderService from '../services/purchaseOrderService.js';
import { logDeleteOperation } from '../services/auditLogService.js';
import { validatePurchaseOrder } from '../services/validationService.js';
import { validatePurchaseOrderReferences } from '../services/referentialIntegrityService.js';

export const getPurchaseOrders = async (req: Request, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string,
      vendorId: req.query.vendorId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const purchaseOrders = await purchaseOrderService.getAllPurchaseOrders(filters);
    res.json(purchaseOrders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
};

export const getPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(req.params.id as string);
    res.json(purchaseOrder);
  } catch (error: any) {
    console.error('Error fetching purchase order:', error);
    if (error.message === 'Purchase order not found' || error.message === 'Invalid purchase order ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch purchase order' });
    }
  }
};

export const createPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Validate data integrity before save
    const validation = validatePurchaseOrder(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    // Validate referential integrity
    const refIntegrity = await validatePurchaseOrderReferences(req.body);
    if (!refIntegrity.valid) {
      return res.status(400).json({ error: 'Referential integrity check failed', details: refIntegrity.errors });
    }

    const purchaseOrder = await purchaseOrderService.createPurchaseOrder(req.body, userId);
    res.status(201).json(purchaseOrder);
  } catch (error: any) {
    console.error('Error creating purchase order:', error);
    if (error.name === 'ValidationError') {
      res.status(400).json({ error: error.message });
    } else if (error.code === 11000) {
      res.status(400).json({ error: 'Purchase order number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create purchase order' });
    }
  }
};

export const updatePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const purchaseOrder = await purchaseOrderService.updatePurchaseOrder(req.params.id as string, req.body, userId);
    res.json(purchaseOrder);
  } catch (error: any) {
    console.error('Error updating purchase order:', error);
    if (error.message === 'Purchase order not found' || error.message === 'Invalid purchase order ID') {
      res.status(404).json({ error: error.message });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update purchase order' });
    }
  }
};

export const deletePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const username = (req as any).user.username;

    const po = await purchaseOrderService.getPurchaseOrderById(req.params.id as string);

    const result = await purchaseOrderService.deletePurchaseOrder(req.params.id as string, userId);

    await logDeleteOperation({
      collectionName: 'purchaseOrders',
      recordId: req.params.id as string,
      recordData: po as unknown as Record<string, unknown>,
      userId,
      username,
      ipAddress: req.ip,
      details: `Purchase order "${po.poNumber}" deleted`,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error deleting purchase order:', error);
    if (error.message === 'Purchase order not found' || error.message === 'Invalid purchase order ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete purchase order' });
    }
  }
};
