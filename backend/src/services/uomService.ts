import UOM, { IUOM } from '../models/UOM.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';
import { validateUom, checkUomAbbreviationUnique } from './validationService.js';

/**
 * Get all active (non-deleted) UOMs.
 */
export const getUoms = async (filters: Record<string, unknown> = {}) => {
  const query: Record<string, unknown> = { isDeleted: false };

  if (filters.search) {
    query.$or = [
      { name: { $regex: filters.search, $options: 'i' } },
      { abbreviation: { $regex: filters.search, $options: 'i' } },
    ];
  }

  const uoms = await UOM.find(query).sort({ name: 1 }).lean();
  return uoms;
};

/**
 * Get a single UOM by ID.
 */
export const getUomById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid UOM ID');
  }

  const uom = await UOM.findOne({ _id: id, isDeleted: false }).lean();

  if (!uom) {
    throw new Error('UOM not found');
  }

  return uom;
};

/**
 * Create a new UOM.
 */
export const createUom = async (data: Partial<IUOM>, userId: string) => {
  const validation = validateUom(data as Record<string, unknown>);
  if (!validation.valid) {
    const err = new Error('Validation failed');
    (err as any).details = validation.errors;
    throw err;
  }

  const uniqueErrors = await checkUomAbbreviationUnique(data.abbreviation as string);
  if (uniqueErrors.length > 0) {
    const err = new Error('Validation failed');
    (err as any).details = uniqueErrors;
    throw err;
  }

  const uom = new UOM({
    ...data,
    createdBy: userId,
    updatedBy: userId,
  });

  await uom.save();
  return uom;
};

/**
 * Update an existing UOM.
 */
export const updateUom = async (id: string, data: Partial<IUOM>, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid UOM ID');
  }

  const uom = await UOM.findOne({ _id: id, isDeleted: false });

  if (!uom) {
    throw new Error('UOM not found');
  }

  const validation = validateUom({ ...uom.toObject(), ...data } as Record<string, unknown>);
  if (!validation.valid) {
    const err = new Error('Validation failed');
    (err as any).details = validation.errors;
    throw err;
  }

  if (data.abbreviation && data.abbreviation !== uom.abbreviation) {
    const uniqueErrors = await checkUomAbbreviationUnique(data.abbreviation, id);
    if (uniqueErrors.length > 0) {
      const err = new Error('Validation failed');
      (err as any).details = uniqueErrors;
      throw err;
    }
  }

  Object.assign(uom, data, {
    updatedBy: userId,
    updatedAt: new Date(),
  });

  await uom.save();
  return uom;
};

/**
 * Soft-delete a UOM after checking referential integrity.
 * Rejects deletion if any product references this UOM via uomId or sellingUoms.uomId.
 */
export const deleteUom = async (id: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid UOM ID');
  }

  const uom = await UOM.findOne({ _id: id, isDeleted: false });

  if (!uom) {
    throw new Error('UOM not found');
  }

  // Referential integrity check: find products referencing this UOM
  const objectId = new mongoose.Types.ObjectId(id);
  const referencingProducts = await Product.countDocuments({
    isDeleted: { $ne: true },
    $or: [
      { uomId: objectId },
      { 'sellingUoms.uomId': objectId },
    ],
  });

  if (referencingProducts > 0) {
    const err = new Error(`Cannot delete: UOM is in use by ${referencingProducts} product(s)`);
    (err as any).details = [
      {
        field: 'uomId',
        message: `Cannot delete: UOM is in use by ${referencingProducts} product(s)`,
      },
    ];
    throw err;
  }

  uom.isDeleted = true;
  uom.updatedBy = new mongoose.Types.ObjectId(userId);
  uom.updatedAt = new Date();

  await uom.save();
  return { message: 'UOM deleted successfully' };
};
