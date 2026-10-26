import Product, { IProduct, IVOMData, IVendorCost } from '../models/Product.js';

/**
 * Calculate weighted average cost for a product
 * Formula: ((existing_quantity × existing_average_cost) + (new_quantity × new_cost)) / (existing_quantity + new_quantity)
 * 
 * @param existingQuantity - Current stock quantity
 * @param existingAverageCost - Current average cost
 * @param newQuantity - Quantity being added
 * @param newCost - Cost of new stock
 * @returns Calculated average cost
 */
export const calculateAverageCost = (
  existingQuantity: number,
  existingAverageCost: number,
  newQuantity: number,
  newCost: number
): number => {
  // Handle edge case: first stock addition
  if (existingQuantity === 0 || !existingAverageCost) {
    return newCost;
  }

  // Handle edge case: zero new quantity
  if (newQuantity === 0) {
    return existingAverageCost;
  }

  // Calculate weighted average
  const totalCost = (existingQuantity * existingAverageCost) + (newQuantity * newCost);
  const totalQuantity = existingQuantity + newQuantity;

  return totalCost / totalQuantity;
};

/**
 * Update product stock and costs when new stock arrives
 * 
 * @param productId - Product ID
 * @param quantityAdded - Quantity being added
 * @param unitCost - Cost per unit of new stock
 * @param userId - User performing the operation
 * @param reason - Reason for stock addition
 * @param referenceType - Type of reference document (e.g. 'DELIVERY')
 * @param referenceId - ID of the reference document
 * @returns Updated product
 */
export const addStock = async (
  productId: string,
  quantityAdded: number,
  unitCost: number,
  userId?: string,
  reason?: string,
  referenceType?: string,
  referenceId?: string
): Promise<IProduct> => {
  const product = await Product.findOne({ _id: productId, isDeleted: false });

  if (!product) {
    throw new Error('Product not found');
  }

  if (quantityAdded <= 0) {
    throw new Error('Quantity added must be greater than zero');
  }

  if (unitCost < 0) {
    throw new Error('Unit cost cannot be negative');
  }

  // Calculate new average cost
  const newAverageCost = calculateAverageCost(
    product.availableStock,
    product.averageCost || 0,
    quantityAdded,
    unitCost
  );

  // Update product
  product.availableStock += quantityAdded;
  product.averageCost = newAverageCost;
  product.lastCost = unitCost;

  // Record VOM data with reason fields
  const vomEntry: IVOMData = {
    date: new Date(),
    quantityIn: quantityAdded,
    quantityOut: 0,
    balance: product.availableStock,
    reason: reason,
    adjustedBy: userId,
    referenceType: referenceType,
    referenceId: referenceId
  };
  product.vomData.push(vomEntry);

  if (userId) {
    product.updatedBy = userId as any;
  }

  await product.save();

  return product;
};

/**
 * Adjust product stock (for manual adjustments, sales, etc.)
 * 
 * @param productId - Product ID
 * @param quantityChange - Quantity change (positive for additions, negative for reductions)
 * @param userId - User performing the operation
 * @param reason - Reason for stock adjustment
 * @param referenceType - Type of reference document (e.g. 'MANUAL_ADJUST', 'SALE', 'DELIVERY')
 * @param referenceId - ID of the reference document
 * @returns Updated product
 */
export const adjustStock = async (
  productId: string,
  quantityChange: number,
  userId?: string,
  reason?: string,
  referenceType?: string,
  referenceId?: string
): Promise<IProduct> => {
  const product = await Product.findOne({ _id: productId, isDeleted: false });

  if (!product) {
    throw new Error('Product not found');
  }

  const newStock = product.availableStock + quantityChange;

  // Allow negative stock — stock counts not yet accurate
  // if (newStock < 0) {
  //   throw new Error(
  //     'Insufficient stock. Available: ' + product.availableStock + ', Requested: ' + Math.abs(quantityChange)
  //   );
  // }

  // Update available stock immediately
  product.availableStock = newStock;

  // Record VOM data with reason fields
  const vomEntry: IVOMData = {
    date: new Date(),
    quantityIn: quantityChange > 0 ? quantityChange : 0,
    quantityOut: quantityChange < 0 ? Math.abs(quantityChange) : 0,
    balance: product.availableStock,
    reason: reason,
    adjustedBy: userId,
    referenceType: referenceType,
    referenceId: referenceId
  };
  product.vomData.push(vomEntry);

  if (userId) {
    product.updatedBy = userId as any;
  }

  await product.save();

  return product;
};

/**
 * Reduce stock for a sale
 * 
 * @param productId - Product ID
 * @param quantity - Quantity to reduce
 * @param userId - User performing the operation
 * @param reason - Reason for stock reduction
 * @param referenceType - Type of reference document (e.g. 'SALE')
 * @param referenceId - ID of the reference document
 * @returns Updated product
 */
export const reduceStock = async (
  productId: string,
  quantity: number,
  userId?: string,
  reason?: string,
  referenceType?: string,
  referenceId?: string
): Promise<IProduct> => {
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }

  return adjustStock(productId, -quantity, userId, reason, referenceType, referenceId);
};

/**
 * Validate stock availability for a sale
 * 
 * @param productId - Product ID
 * @param requestedQuantity - Quantity requested
 * @returns True if stock is available, false otherwise
 */
export const validateStockAvailability = async (
  productId: string,
  requestedQuantity: number
): Promise<boolean> => {
  const product = await Product.findOne({ _id: productId, isDeleted: false });

  if (!product) {
    throw new Error('Product not found');
  }

  return product.availableStock >= requestedQuantity;
};


/**
 * Calculate weighted average cost from an array of vendor cost entries.
 * Formula: sum(unitCost_i × lastPurchaseQty_i) / sum(lastPurchaseQty_i)
 *
 * This is a pure function with no DB access.
 *
 * @param vendorCosts - Array of IVendorCost objects
 * @returns Weighted average cost, or 0 if no valid entries
 */
export const calculateWeightedAverageCost = (vendorCosts: IVendorCost[]): number => {
  const validEntries = vendorCosts.filter(
    (vc) => vc.lastPurchaseQty != null && vc.lastPurchaseQty > 0
  );

  if (validEntries.length === 0) {
    return 0;
  }

  let totalWeightedCost = 0;
  let totalQuantity = 0;

  for (const entry of validEntries) {
    totalWeightedCost += entry.unitCost * entry.lastPurchaseQty!;
    totalQuantity += entry.lastPurchaseQty!;
  }

  return totalWeightedCost / totalQuantity;
};

/**
 * Upsert a vendor cost entry on a product and recalculate the weighted average cost.
 *
 * @param productId - Product ID
 * @param vendorId - Vendor ID
 * @param vendorName - Vendor display name (denormalized)
 * @param unitCost - Cost per unit from this vendor
 * @param quantity - Last purchase quantity from this vendor
 * @returns Updated product
 */
export const updateVendorCost = async (
  productId: string,
  vendorId: string,
  vendorName: string,
  unitCost: number,
  quantity: number
): Promise<IProduct> => {
  const product = await Product.findOne({ _id: productId, isDeleted: false });

  if (!product) {
    throw new Error('Product not found');
  }

  const existingIndex = product.vendorCosts.findIndex(
    (vc) => vc.vendorId.toString() === vendorId
  );

  if (existingIndex >= 0) {
    // Update existing vendor cost entry
    product.vendorCosts[existingIndex].unitCost = unitCost;
    product.vendorCosts[existingIndex].lastPurchaseQty = quantity;
    product.vendorCosts[existingIndex].lastUpdated = new Date();
    product.vendorCosts[existingIndex].vendorName = vendorName;
  } else {
    // Push new vendor cost entry
    product.vendorCosts.push({
      vendorId: vendorId as any,
      vendorName,
      unitCost,
      lastPurchaseQty: quantity,
      lastUpdated: new Date(),
      isPreferred: false,
    });
  }

  // Recalculate weighted average cost
  product.averageCost = calculateWeightedAverageCost(product.vendorCosts);

  await product.save();

  return product;
};
