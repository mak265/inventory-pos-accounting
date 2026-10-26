import PurchaseOrder, { IPurchaseOrder, IPOLineItem } from '../models/PurchaseOrder.js';
import mongoose from 'mongoose';

// Calculate line item total: (quantity × unit cost) - supplier discount
export const calculateLineTotal = (quantity: number, unitCost: number, supplierDiscount: number = 0): number => {
  return (quantity * unitCost) - supplierDiscount;
};

// Calculate PO total: sum of all line item totals
export const calculatePOTotal = (lineItems: IPOLineItem[]): number => {
  return lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
};

// Generate unique PO number
export const generatePONumber = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  
  // Find the last PO number for this year
  const lastPO = await PurchaseOrder.findOne({
    poNumber: { $regex: `^${prefix}` }
  })
    .sort({ poNumber: -1 })
    .lean();

  if (!lastPO) {
    return `${prefix}0001`;
  }

  // Extract the sequence number and increment
  const lastNumber = parseInt(lastPO.poNumber.split('-')[2]);
  const nextNumber = (lastNumber + 1).toString().padStart(4, '0');
  
  return `${prefix}${nextNumber}`;
};

export const getAllPurchaseOrders = async (filters: any = {}) => {
  const query: any = { isDeleted: false };
  
  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.vendorId) {
    query.vendorId = filters.vendorId;
  }

  if (filters.startDate || filters.endDate) {
    query.poDate = {};
    if (filters.startDate) {
      query.poDate.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      query.poDate.$lte = new Date(filters.endDate);
    }
  }

  const purchaseOrders = await PurchaseOrder.find(query)
    .populate('vendorId', 'name address')
    .sort({ poDate: -1 })
    .lean();
  
  return purchaseOrders;
};

export const getPurchaseOrderById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid purchase order ID');
  }

  const purchaseOrder = await PurchaseOrder.findOne({ _id: id, isDeleted: false })
    .populate('vendorId', 'name address termsOfPayment')
    .lean();
  
  if (!purchaseOrder) {
    throw new Error('Purchase order not found');
  }
  
  return purchaseOrder;
};

export const createPurchaseOrder = async (poData: Partial<IPurchaseOrder>, userId: string) => {
  // Calculate line totals
  const lineItems = poData.lineItems?.map(item => ({
    ...item,
    lineTotal: calculateLineTotal(item.quantity, item.unitCost, item.supplierDiscount || 0)
  })) || [];

  // Calculate total amount
  const totalAmount = calculatePOTotal(lineItems);

  // Generate PO number if not provided
  let poNumber = poData.poNumber;
  if (!poNumber) {
    poNumber = await generatePONumber();
  }

  const purchaseOrder = new PurchaseOrder({
    ...poData,
    poNumber,
    lineItems,
    totalAmount,
    createdBy: userId,
    updatedBy: userId
  });

  await purchaseOrder.save();
  return purchaseOrder;
};

export const updatePurchaseOrder = async (id: string, poData: Partial<IPurchaseOrder>, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid purchase order ID');
  }

  const purchaseOrder = await PurchaseOrder.findOne({ _id: id, isDeleted: false });
  
  if (!purchaseOrder) {
    throw new Error('Purchase order not found');
  }

  // Recalculate line totals if line items are updated
  if (poData.lineItems) {
    poData.lineItems = poData.lineItems.map(item => ({
      ...item,
      lineTotal: calculateLineTotal(item.quantity, item.unitCost, item.supplierDiscount || 0)
    }));
    
    // Recalculate total amount
    poData.totalAmount = calculatePOTotal(poData.lineItems);
  }

  Object.assign(purchaseOrder, poData, {
    updatedBy: userId,
    updatedAt: new Date()
  });

  await purchaseOrder.save();
  return purchaseOrder;
};

export const deletePurchaseOrder = async (id: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid purchase order ID');
  }

  const purchaseOrder = await PurchaseOrder.findOne({ _id: id, isDeleted: false });
  
  if (!purchaseOrder) {
    throw new Error('Purchase order not found');
  }

  purchaseOrder.isDeleted = true;
  purchaseOrder.updatedBy = new mongoose.Types.ObjectId(userId);
  purchaseOrder.updatedAt = new Date();
  
  await purchaseOrder.save();
  return { message: 'Purchase order deleted successfully' };
};
