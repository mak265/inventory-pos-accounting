import { Request, Response } from 'express';
import * as uomService from '../services/uomService.js';

export const getUoms = async (req: Request, res: Response) => {
  try {
    const filters = {
      search: req.query.search as string,
    };

    const uoms = await uomService.getUoms(filters);
    res.json(uoms);
  } catch (error) {
    console.error('Error fetching UOMs:', error);
    res.status(500).json({ error: 'Failed to fetch UOMs' });
  }
};

export const getUomById = async (req: Request, res: Response) => {
  try {
    const uom = await uomService.getUomById(req.params.id as string);
    res.json(uom);
  } catch (error: any) {
    console.error('Error fetching UOM:', error);
    if (error.message === 'UOM not found' || error.message === 'Invalid UOM ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch UOM' });
    }
  }
};

export const createUom = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const uom = await uomService.createUom(req.body, userId);
    res.status(201).json(uom);
  } catch (error: any) {
    console.error('Error creating UOM:', error);
    if (error.message === 'Validation failed') {
      res.status(400).json({ error: 'Validation failed', details: error.details || [] });
    } else {
      res.status(500).json({ error: 'Failed to create UOM' });
    }
  }
};

export const updateUom = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const uom = await uomService.updateUom(req.params.id as string, req.body, userId);
    res.json(uom);
  } catch (error: any) {
    console.error('Error updating UOM:', error);
    if (error.message === 'UOM not found' || error.message === 'Invalid UOM ID') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'Validation failed') {
      res.status(400).json({ error: 'Validation failed', details: error.details || [] });
    } else {
      res.status(500).json({ error: 'Failed to update UOM' });
    }
  }
};

export const deleteUom = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const result = await uomService.deleteUom(req.params.id as string, userId);
    res.json(result);
  } catch (error: any) {
    console.error('Error deleting UOM:', error);
    if (error.message === 'UOM not found' || error.message === 'Invalid UOM ID') {
      res.status(404).json({ error: error.message });
    } else if (error.message?.startsWith('Cannot delete:')) {
      res.status(400).json({ error: error.message, details: error.details || [] });
    } else {
      res.status(500).json({ error: 'Failed to delete UOM' });
    }
  }
};
