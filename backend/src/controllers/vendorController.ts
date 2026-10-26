import { Request, Response } from 'express';
import * as vendorService from '../services/vendorService.js';
import { logDeleteOperation } from '../services/auditLogService.js';
import { validateVendor } from '../services/validationService.js';
import { checkDeleteSafety } from '../services/referentialIntegrityService.js';

export const getVendors = async (req: Request, res: Response) => {
  try {
    const filters = {
      search: req.query.search as string
    };

    const vendors = await vendorService.getAllVendors(filters);
    res.json(vendors);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
};

export const getVendor = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorService.getVendorById(req.params.id as string);
    res.json(vendor);
  } catch (error: any) {
    console.error('Error fetching vendor:', error);
    if (error.message === 'Vendor not found' || error.message === 'Invalid vendor ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch vendor' });
    }
  }
};

export const createVendor = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Validate data integrity before save
    const validation = validateVendor(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const vendor = await vendorService.createVendor(req.body, userId);
    res.status(201).json(vendor);
  } catch (error: any) {
    console.error('Error creating vendor:', error);
    if (error.name === 'ValidationError') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create vendor' });
    }
  }
};

export const updateVendor = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const vendor = await vendorService.updateVendor(req.params.id as string, req.body, userId);
    res.json(vendor);
  } catch (error: any) {
    console.error('Error updating vendor:', error);
    if (error.message === 'Vendor not found' || error.message === 'Invalid vendor ID') {
      res.status(404).json({ error: error.message });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update vendor' });
    }
  }
};

export const deleteVendor = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const username = (req as any).user.username;

    // Check referential integrity before delete
    const safety = await checkDeleteSafety('vendors', req.params.id as string);
    if (!safety.valid) {
      return res.status(400).json({ error: 'Cannot delete: referential integrity violation', details: safety.errors });
    }

    // Get vendor data before deletion for audit log
    const vendor = await vendorService.getVendorById(req.params.id as string);

    const result = await vendorService.deleteVendor(req.params.id as string, userId);

    // Log the delete operation
    await logDeleteOperation({
      collectionName: 'vendors',
      recordId: req.params.id as string,
      recordData: vendor as unknown as Record<string, unknown>,
      userId,
      username,
      ipAddress: req.ip,
      details: `Vendor "${vendor.name}" deleted`,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error deleting vendor:', error);
    if (error.message === 'Vendor not found' || error.message === 'Invalid vendor ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete vendor' });
    }
  }
};
