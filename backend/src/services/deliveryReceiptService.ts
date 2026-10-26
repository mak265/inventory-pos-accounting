import DeliveryReceipt, { IDeliveryReceipt } from '../models/DeliveryReceipt.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';
import { calculateWeightedAverageCost } from './productService.js';
import { calculateFinalSellingPrice } from './pricingService.js';

const calculateDeliveryReceiptTotal = (lineItems: any[] = []) =>
  lineItems.reduce((sum: number, item: any) => sum + ((item.quantityReceived || 0) * (item.netCost || item.unitCost || 0)), 0);

// Generate unique DR number
export const generateDRNumber = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `DR-${year}-`;
  
  // Find the last DR number for this year
  const lastDR = await DeliveryReceipt.findOne({
    drNumber: { $regex: `^${prefix}` }
  })
    .sort({ drNumber: -1 })
    .lean();

  if (!lastDR) {
    return `${prefix}0001`;
  }

  // Extract the sequence number and increment
  const lastNumber = parseInt(lastDR.drNumber.split('-')[2]);
  const nextNumber = (lastNumber + 1).toString().padStart(4, '0');
  
  return `${prefix}${nextNumber}`;
};

export const getAllDeliveryReceipts = async (filters: any = {}) => {
  const query: any = { isDeleted: false };
  
  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.vendorId) {
    query.vendorId = filters.vendorId;
  }

  if (filters.poId) {
    query.poId = filters.poId;
  }

  if (filters.startDate || filters.endDate) {
    query.deliveryDate = {};
    if (filters.startDate) {
      query.deliveryDate.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      query.deliveryDate.$lte = new Date(filters.endDate);
    }
  }

  const deliveryReceipts = await DeliveryReceipt.find(query)
    .populate('vendorId', 'name address')
    .populate('poId', 'poNumber')
    .sort({ deliveryDate: -1 })
    .lean();
  
  return deliveryReceipts.map((dr: any) => {
    if (typeof dr.totalAmount !== 'number' || dr.totalAmount === 0) {
      dr.totalAmount = calculateDeliveryReceiptTotal(dr.lineItems || []);
    }
    return dr;
  });
};

export const getDeliveryReceiptById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid delivery receipt ID');
  }

  const deliveryReceipt = await DeliveryReceipt.findOne({ _id: id, isDeleted: false })
    .populate('vendorId', 'name address termsOfPayment')
    .populate('poId', 'poNumber poDate')
    .populate('postedBy', 'username fullName')
    .lean();
  
  if (!deliveryReceipt) {
    throw new Error('Delivery receipt not found');
  }

  if (!deliveryReceipt.totalAmount || deliveryReceipt.totalAmount === 0) {
    deliveryReceipt.totalAmount = calculateDeliveryReceiptTotal(deliveryReceipt.lineItems || []);
  }
  
  return deliveryReceipt;
};

export const createDeliveryReceipt = async (drData: Partial<IDeliveryReceipt>, userId: string) => {
  // Clean DR number if provided
  let drNumber = drData.drNumber ? String(drData.drNumber).trim() : '';

  if (drNumber) {
    const existing = await DeliveryReceipt.findOne({ drNumber, isDeleted: false });
    if (existing) {
      return existing;
    }
  }

  // Generate DR number if not provided
  if (!drNumber) {
    drNumber = await generateDRNumber();
  }

  // Validate PO reference if provided
  if (drData.poId) {
    if (!mongoose.Types.ObjectId.isValid(drData.poId as any)) {
      throw new Error('Invalid purchase order ID');
    }
    
    const po = await PurchaseOrder.findOne({ _id: drData.poId, isDeleted: false });
    if (!po) {
      throw new Error('Referenced purchase order not found');
    }
  }

  const deliveryReceipt = new DeliveryReceipt({
    ...drData,
    totalAmount: calculateDeliveryReceiptTotal(drData.lineItems as any[]),
    drNumber,
    createdBy: userId
  });

  try {
    await deliveryReceipt.save();
    return deliveryReceipt;
  } catch (error: any) {
    if (error.code === 11000 && error.keyPattern?.drNumber) {
      // In rare cases of concurrent DR creation, regenerate and retry once.
      deliveryReceipt.drNumber = await generateDRNumber();
      await deliveryReceipt.save();
      return deliveryReceipt;
    }
    throw error;
  }
};

export const updateDeliveryReceipt = async (id: string, drData: Partial<IDeliveryReceipt>, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid delivery receipt ID');
  }

  const deliveryReceipt = await DeliveryReceipt.findOne({ _id: id, isDeleted: false });
  
  if (!deliveryReceipt) {
    throw new Error('Delivery receipt not found');
  }

  // Validate PO reference if being updated
  if (drData.poId) {
    if (!mongoose.Types.ObjectId.isValid(drData.poId as any)) {
      throw new Error('Invalid purchase order ID');
    }
    
    const po = await PurchaseOrder.findOne({ _id: drData.poId, isDeleted: false });
    if (!po) {
      throw new Error('Referenced purchase order not found');
    }
  }

  if (drData.lineItems) {
    drData.totalAmount = calculateDeliveryReceiptTotal(drData.lineItems as any[]);
  }

  // If the DR is already POSTED, reverse old inventory then re-apply new inventory
  if (deliveryReceipt.status === 'POSTED') {
    const newLineItems = (drData.lineItems as any[]) || [];
    const productIds = new Set<string>();

    for (const oldItem of deliveryReceipt.lineItems) {
      if (oldItem.productId && oldItem.quantityReceived > 0) productIds.add(oldItem.productId.toString());
    }
    for (const newItem of newLineItems) {
      if (newItem.productId && newItem.quantityReceived > 0) productIds.add(newItem.productId.toString());
    }

    if (productIds.size > 0) {
      const products = await Product.find({
        _id: { $in: Array.from(productIds).map(id => new mongoose.Types.ObjectId(id)) },
        isDeleted: false
      });

      const productMap = new Map<string, any>();
      for (const p of products) productMap.set(p._id.toString(), p);

      // Step 1: Reverse old line items from inventory
      for (const oldItem of deliveryReceipt.lineItems) {
        const pid = oldItem.productId?.toString();
        if (!pid || oldItem.quantityReceived <= 0) continue;
        const product = productMap.get(pid);
        if (!product) continue;

        product.availableStock = Math.max(0, (product.availableStock || 0) - oldItem.quantityReceived);
        product.vomData.push({
          date: new Date(),
          quantityIn: 0,
          quantityOut: oldItem.quantityReceived,
          balance: product.availableStock,
          reason: 'DR_EDIT_REVERSE',
          referenceType: 'DELIVERY_EDIT',
          referenceId: deliveryReceipt._id.toString(),
          adjustedBy: userId,
        });
        product.updatedBy = new mongoose.Types.ObjectId(userId);
      }

      // Step 2: Apply new line items to inventory
      for (const newItem of newLineItems) {
        const pid = newItem.productId?.toString();
        if (!pid || newItem.quantityReceived <= 0) continue;
        const product = productMap.get(pid);
        if (!product) continue;

        const existingQty = product.availableStock || 0;
        const existingCost = product.averageCost || 0;
        const newQty = newItem.quantityReceived;
        const newCost = newItem.netCost || newItem.unitCost || 0;

        product.availableStock = existingQty + newQty;
        product.averageCost = calculateAverageCost(existingQty, existingCost, newQty, newCost);
        product.lastCost = newCost;

        if (newItem.discount1 || newItem.discount2 || newItem.discount3 || newItem.discount4) {
          product.lastDiscounts = {
            discount1: newItem.discount1 || 0, discount1Mode: newItem.discount1Mode || 'subtract',
            discount2: newItem.discount2 || 0, discount2Mode: newItem.discount2Mode || 'subtract',
            discount3: newItem.discount3 || 0, discount3Mode: newItem.discount3Mode || 'subtract',
            discount4: newItem.discount4 || 0, discount4Mode: newItem.discount4Mode || 'subtract',
            grossCost: newItem.unitCost || 0,
            netCost: newCost
          };
        }

        product.vomData.push({
          date: new Date(),
          quantityIn: newQty,
          quantityOut: 0,
          balance: product.availableStock,
          reason: 'DR_EDIT_REAPPLY',
          referenceType: 'DELIVERY_EDIT',
          referenceId: deliveryReceipt._id.toString(),
          adjustedBy: userId,
        });
        product.updatedBy = new mongoose.Types.ObjectId(userId);
      }

      await Product.bulkWrite(
        Array.from(productMap.values()).map((p: any) => ({
          updateOne: {
            filter: { _id: p._id },
            update: {
              $set: {
                availableStock: p.availableStock,
                averageCost: p.averageCost,
                lastCost: p.lastCost,
                lastDiscounts: p.lastDiscounts,
                updatedBy: p.updatedBy,
                vomData: p.vomData
              }
            }
          }
        }))
      );
    }
  }

  Object.assign(deliveryReceipt, drData);
  await deliveryReceipt.save();
  
  return deliveryReceipt;
};

export const deleteDeliveryReceipt = async (id: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid delivery receipt ID');
  }

  const deliveryReceipt = await DeliveryReceipt.findOne({ _id: id, isDeleted: false });
  
  if (!deliveryReceipt) {
    throw new Error('Delivery receipt not found');
  }

  // If the DR was POSTED, reverse inventory (subtract stock that was added)
  if (deliveryReceipt.status === 'POSTED') {
    for (const lineItem of deliveryReceipt.lineItems) {
      if (lineItem.productId && lineItem.quantityReceived > 0) {
        const product = await Product.findOne({ _id: lineItem.productId, isDeleted: false });
        if (product) {
          const qtyToReverse = lineItem.quantityReceived;
          product.availableStock = Math.max(0, (product.availableStock || 0) - qtyToReverse);

          // Recalculate average cost after removing this delivery's contribution
          // If stock goes to 0, keep the current averageCost for reference
          if (product.availableStock > 0) {
            const totalValueBefore = ((product.availableStock + qtyToReverse) * (product.averageCost || 0));
            const removedValue = qtyToReverse * (lineItem.netCost || lineItem.unitCost || 0);
            product.averageCost = (totalValueBefore - removedValue) / product.availableStock;
            if (product.averageCost < 0) product.averageCost = 0;
          }

          product.updatedBy = new mongoose.Types.ObjectId(userId);

          // Add VOM entry for the reversal
          product.vomData.push({
            date: new Date(),
            quantityIn: 0,
            quantityOut: qtyToReverse,
            balance: product.availableStock,
            reason: 'DR_CANCELLED',
            referenceType: 'DELIVERY_CANCEL',
            referenceId: deliveryReceipt._id.toString(),
            adjustedBy: userId,
          });

          await product.save();
        }
      }
    }
  }

  // Allow deleting any DR (admin password verified by middleware/frontend)
  deliveryReceipt.isDeleted = true;
  await deliveryReceipt.save();
  
  return { message: 'Delivery receipt deleted successfully' };
};

// Calculate weighted average cost
export const calculateAverageCost = (
  existingQty: number,
  existingCost: number,
  newQty: number,
  newCost: number
): number => {
  if (existingQty + newQty === 0) {
    return 0;
  }
  return ((existingQty * existingCost) + (newQty * newCost)) / (existingQty + newQty);
};

// Post delivery receipt - update inventory and costs
export const postDeliveryReceipt = async (id: string, userId: string) => {
  console.log(`[postDeliveryReceipt] Starting post for DR: ${id}, user: ${userId}`);
  
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid delivery receipt ID');
  }

  const deliveryReceipt = await DeliveryReceipt.findOne({ _id: id, isDeleted: false, status: 'PENDING' });
  
  if (!deliveryReceipt) {
    const existing = await DeliveryReceipt.findOne({ _id: id, isDeleted: false });
    if (existing && existing.status === 'POSTED') {
      throw new Error('Delivery receipt is already posted');
    }
    throw new Error('Delivery receipt not found');
  }

  console.log(`[postDeliveryReceipt] Found DR: ${deliveryReceipt.drNumber}, status: ${deliveryReceipt.status}, lineItems: ${deliveryReceipt.lineItems.length}`);
  deliveryReceipt.totalAmount = calculateDeliveryReceiptTotal(deliveryReceipt.lineItems as any[]);

  // Update inventory for each line item (no session — standalone MongoDB)
  for (let idx = 0; idx < deliveryReceipt.lineItems.length; idx++) {
    const lineItem = deliveryReceipt.lineItems[idx];
    
    console.log(`[postDeliveryReceipt] Processing lineItem ${idx}: qty=${lineItem.quantityReceived}, productId=${lineItem.productId || 'null'}, description=${lineItem.description}`);
    
    if (lineItem.quantityReceived > 0) {
      let product: any = null;

      if (lineItem.productId) {
        product = await Product.findOne({ _id: lineItem.productId, isDeleted: false });
      }

      // Fallback: If product not found by ID, try finding by description (case-insensitive).
      // This fixes issues after database migrations where internal IDs have changed.
      if (!product && lineItem.description?.trim()) {
        const trimmedDesc = lineItem.description.trim();
        product = await Product.findOne({
          description: { $regex: new RegExp('^' + trimmedDesc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
          isDeleted: false
        });

        if (product) {
          console.log(`[postDeliveryReceipt] Healed missing product link for: ${trimmedDesc}`);
          lineItem.productId = product._id;
        }
      }

      // Auto-create missing product so pending deliveries can still be posted
      if (!product) {
        const ts = Date.now().toString().slice(-6);
        const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
        const autoCode = `AUTO-DR-${ts}${rand}`;
        const desc = (lineItem.description || '').trim() || `Auto-created from DR ${deliveryReceipt.drNumber}`;
        const baseCost = lineItem.netCost || lineItem.unitCost || 0;

        console.log(`[postDeliveryReceipt] Creating auto-product: ${autoCode}`);
        
        try {
          product = await Product.create({
            code: autoCode,
            description: desc,
            uom: 'PCS',
            availableStock: 0,
            minStock: 0,
            lastCost: baseCost,
            averageCost: baseCost,
            sellingPrice: baseCost,
            markupType: 'percentage',
            markupPercentage: 0,
            fixedMarkupAmount: 0,
            createdBy: new mongoose.Types.ObjectId(userId),
            updatedBy: new mongoose.Types.ObjectId(userId),
            isActive: true,
            isDeleted: false
          });
          console.log(`[postDeliveryReceipt] Auto-product created: ${product._id}`);
        } catch (error: any) {
          console.error(`[postDeliveryReceipt] Failed to create auto-product: ${autoCode}`, error.message, error.errors);
          throw new Error(`Failed to create product: ${error.message}`);
        }

        // Link the newly created product back to DR line item
        lineItem.productId = product._id;
      }

      const existingQty = product.availableStock || 0;
      const existingCost = product.averageCost || 0;
      const newQty = lineItem.quantityReceived;
      const newCost = lineItem.netCost || lineItem.unitCost || 0;

      product.availableStock = existingQty + newQty;
      product.averageCost = calculateAverageCost(existingQty, existingCost, newQty, newCost);
      product.lastCost = newCost;

      // Save discount info from DR line item
      if (lineItem.discount1 || lineItem.discount2 || lineItem.discount3 || lineItem.discount4) {
        product.lastDiscounts = {
          discount1: lineItem.discount1 || 0, discount1Mode: lineItem.discount1Mode || 'subtract',
          discount2: lineItem.discount2 || 0, discount2Mode: lineItem.discount2Mode || 'subtract',
          discount3: lineItem.discount3 || 0, discount3Mode: lineItem.discount3Mode || 'subtract',
          discount4: lineItem.discount4 || 0, discount4Mode: lineItem.discount4Mode || 'subtract',
          grossCost: lineItem.unitCost || 0,
          netCost: lineItem.netCost || newCost
        };
      }
      product.updatedBy = new mongoose.Types.ObjectId(userId);

      product.vomData.push({
        date: deliveryReceipt.deliveryDate, quantityIn: newQty, quantityOut: 0,
        balance: product.availableStock, reason: 'DELIVERY',
        referenceType: 'DELIVERY', referenceId: deliveryReceipt._id.toString(), adjustedBy: userId,
      });

      if (deliveryReceipt.vendorId) {
        const vendorIdStr = deliveryReceipt.vendorId.toString();
        const discountData = {
          grossCost: lineItem.unitCost || 0,
          discount1: lineItem.discount1 || 0, discount1Mode: lineItem.discount1Mode || 'subtract',
          discount2: lineItem.discount2 || 0, discount2Mode: lineItem.discount2Mode || 'subtract',
          discount3: lineItem.discount3 || 0, discount3Mode: lineItem.discount3Mode || 'subtract',
          discount4: lineItem.discount4 || 0, discount4Mode: lineItem.discount4Mode || 'subtract',
          netCost: lineItem.netCost || newCost
        };
        const vcIdx = product.vendorCosts.findIndex((vc: any) => vc.vendorId.toString() === vendorIdStr);
        if (vcIdx >= 0) {
          product.vendorCosts[vcIdx].unitCost = newCost;
          product.vendorCosts[vcIdx].lastPurchaseQty = newQty;
          product.vendorCosts[vcIdx].lastUpdated = new Date();
          Object.assign(product.vendorCosts[vcIdx], discountData);
        } else {
          product.vendorCosts.push({
            vendorId: deliveryReceipt.vendorId as any, vendorName: deliveryReceipt.vendorName || '',
            unitCost: newCost, lastPurchaseQty: newQty, lastUpdated: new Date(), isPreferred: false,
            ...discountData
          });
        }
        const weightedAvg = calculateWeightedAverageCost(product.vendorCosts);
        if (weightedAvg > 0) product.averageCost = weightedAvg;
      }

      if (product.averageCost && product.averageCost > 0) {
        product.sellingPrice = calculateFinalSellingPrice(
          product.lastCost || product.averageCost,
          product.markupType,
          product.markupPercentage,
          product.fixedMarkupAmount
        );
      }

      try {
        console.log(`[postDeliveryReceipt] Saving product: ${product.code}`);
        await product.save();
        console.log(`[postDeliveryReceipt] Product saved successfully: ${product._id}`);
      } catch (error: any) {
        console.error(`[postDeliveryReceipt] Failed to save product: ${product.code}`, error.message, error.errors);
        throw new Error(`Failed to save product: ${error.message}`);
      }
    }
  }

  try {
    console.log(`[postDeliveryReceipt] Updating DR status to POSTED`);
    deliveryReceipt.status = 'POSTED';
    deliveryReceipt.postedAt = new Date();
    deliveryReceipt.postedBy = new mongoose.Types.ObjectId(userId);
    await deliveryReceipt.save();
    console.log(`[postDeliveryReceipt] DR saved successfully`);
  } catch (error: any) {
    console.error(`[postDeliveryReceipt] Failed to save delivery receipt`, error.message, error.errors);
    throw new Error(`Failed to post delivery receipt: ${error.message}`);
  }

  // Update PO status if linked
  if (deliveryReceipt.poId) {
    const po = await PurchaseOrder.findOne({ _id: deliveryReceipt.poId, isDeleted: false });
    if (po) {
      const allDeliveries = await DeliveryReceipt.find({ poId: deliveryReceipt.poId, status: 'POSTED', isDeleted: false });
      const receivedQuantities = new Map<string, number>();
      for (const dr of allDeliveries) {
        for (const item of dr.lineItems) {
          const key = item.productId?.toString() || item.description;
          receivedQuantities.set(key, (receivedQuantities.get(key) || 0) + item.quantityReceived);
        }
      }
      let fullyDelivered = true;
      for (const poItem of po.lineItems) {
        const key = poItem.productId?.toString() || poItem.description;
        if ((receivedQuantities.get(key) || 0) < poItem.quantity) { fullyDelivered = false; break; }
      }
      po.status = fullyDelivered ? 'COMPLETED' : (po.status === 'DRAFT' || po.status === 'SUBMITTED' ? 'PARTIAL' : po.status);
      po.updatedBy = new mongoose.Types.ObjectId(userId);
      await po.save();
    }
  }

  return deliveryReceipt;
};
