import Sale, { ISale, ISaleLineItem } from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { buildSafeRegex, escapeRegExp } from '../utils/regex.js';

/**
 * Calculate line item total: quantity × selling price
 * Property 13: Sales Line Item Total Calculation
 */
export const calculateSaleLineTotal = (quantity: number, sellingPrice: number, discount: number = 0): number => {
  return (quantity * sellingPrice) - discount;
};

/**
 * Calculate sale total: sum of all line item totals
 * Property 14: Sales Transaction Total Calculation
 */
export const calculateSaleTotal = (lineItems: ISaleLineItem[]): number => {
  return lineItems.reduce((total, item) => total + item.lineTotal, 0);
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const derivePaymentProgress = (saleTotal: number, payments: Array<{ amountDue?: number; totalPaid?: number; paymentDate?: Date; createdAt?: Date }>) => {
  const grossTotal = round2(saleTotal || 0);
  if (!payments || payments.length === 0) {
    return { paid: 0, effectiveDue: grossTotal, balance: grossTotal };
  }

  const sorted = [...payments].sort((a, b) => {
    const aTime = new Date(a.paymentDate || a.createdAt || 0).getTime();
    const bTime = new Date(b.paymentDate || b.createdAt || 0).getTime();
    return aTime - bTime;
  });

  let paidBefore = 0;
  let latestImpliedDue = 0;

  for (const p of sorted) {
    const rowPaid = Number(p.totalPaid || 0);
    const amountDue = Number(p.amountDue);
    if (rowPaid > 0 && Number.isFinite(amountDue) && amountDue >= 0) {
      latestImpliedDue = round2(amountDue + paidBefore);
    }
    paidBefore = round2(paidBefore + rowPaid);
  }

  const paid = round2(paidBefore);
  const effectiveDue = round2(latestImpliedDue > 0 ? Math.max(latestImpliedDue, paid) : Math.max(grossTotal, paid));
  const balance = round2(Math.max(0, effectiveDue - paid));

  return { paid, effectiveDue, balance };
};

/**
 * Validate stock availability for all line items
 * Property 12: Stock Availability Validation
 */
export const validateStockAvailability = async (lineItems: ISaleLineItem[]): Promise<void> => {
  // Stock validation fully disabled — stock counts not yet accurate
  // Just log warnings, never throw
  for (const item of lineItems) {
    try {
      const product = await Product.findOne({ _id: item.productId, isDeleted: { $ne: true } });
      if (!product) {
        console.warn(`Stock check: Product not found for ${item.description} (${item.productId}) — skipping`);
        continue;
      }
      const stockNeeded = item.quantity * (item.conversionFactor || 1);
      if (product.availableStock < stockNeeded) {
        console.warn(`Low stock: ${item.description} - Available: ${product.availableStock}, Needed: ${stockNeeded}`);
      }
    } catch (err: any) {
      console.warn(`Stock check error for ${item.description}: ${err.message}`);
    }
  }
};

export const getAllSales = async (filters: any = {}) => {
  const query: any = { isDeleted: { $ne: true } };
  
  if (filters.customerId && filters.customerId !== 'null') {
    const customerId = filters.customerId;
    let customerName: string | null = null;
    if (Types.ObjectId.isValid(customerId)) {
      const customer = await Customer.findById(customerId).select('name').lean();
      if (customer?.name) {
        customerName = customer.name;
      }
    }

    if (customerName) {
      const escapedCustomerName = escapeRegExp(customerName);
      query.$or = [
        { customerId: new Types.ObjectId(customerId) },
        { customerName: new RegExp(`^${escapedCustomerName}$`, 'i') }
      ];
    } else if (Types.ObjectId.isValid(customerId)) {
      query.customerId = new Types.ObjectId(customerId);
    } else {
      query.customerName = new RegExp(`^${escapeRegExp(customerId)}$`, 'i');
    }
  }
  
  if (filters.status && filters.status !== 'null') {
    query.status = filters.status;
  }

  // Search by DR number or customer name
  if (filters.search && filters.search !== 'null' && filters.search.trim()) {
    const searchTerm = filters.search.trim();
    const escapedSearch = escapeRegExp(searchTerm);
    const searchConditions: any[] = [
      { drNumber: new RegExp(escapedSearch, 'i') },
      { customerName: new RegExp(escapedSearch, 'i') }
    ];
    // If it looks like a number, also search exact drNumber
    if (/^\d+$/.test(searchTerm)) {
      searchConditions.push({ drNumber: searchTerm });
    }
    if (query.$or) {
      // Already has $or from customerId — wrap in $and
      query.$and = [{ $or: query.$or }, { $or: searchConditions }];
      delete query.$or;
    } else {
      query.$or = searchConditions;
    }
  }
  
  const startDate = filters.startDate && filters.startDate !== 'null' ? filters.startDate : null;
  const endDate = filters.endDate && filters.endDate !== 'null' ? filters.endDate : null;
  
  if (startDate || endDate) {
    query.saleDate = {};
    if (startDate) {
      // Start of day — include all sales from the start date
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query.saleDate.$gte = start;
    }
    if (endDate) {
      // End of day — include all sales up to 23:59:59 of the end date
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.saleDate.$lte = end;
    }
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const rawLimit = Number(filters.limit) || 50;
  const limit = Math.min(200, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;

  const [sales, total] = await Promise.all([
    Sale.find(query)
      .populate('customerId', 'name')
      .sort({ saleDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Sale.countDocuments(query),
  ]);

  // Attach payment status + payment mode channels to each completed sale
  const completedIds = sales.filter(s => s.status === 'COMPLETED').map(s => s._id);
  let paymentRowsMap: Record<string, Array<{ amountDue?: number; totalPaid?: number; paymentDate?: Date; createdAt?: Date; paymentChannels?: any[]; cashPayment?: number; chargePayment?: number }>> = {};
  if (completedIds.length > 0) {
    try {
      const Payment = (await import('../models/Payment')).default;
      const payments = await Payment.find({
        saleId: { $in: completedIds },
        isDeleted: { $ne: true }
      }).select('saleId totalPaid amountDue paymentDate createdAt paymentChannels cashPayment chargePayment').lean();

      for (const p of payments) {
        const sid = (p.saleId?._id || p.saleId || '').toString();
        if (!sid) continue;
        if (!paymentRowsMap[sid]) paymentRowsMap[sid] = [];
        paymentRowsMap[sid].push({
          totalPaid: Number(p.totalPaid || 0),
          amountDue: typeof p.amountDue === 'number' ? p.amountDue : undefined,
          paymentDate: p.paymentDate,
          createdAt: p.createdAt,
          paymentChannels: Array.isArray(p.paymentChannels) ? p.paymentChannels : [],
          cashPayment: Number(p.cashPayment || 0),
          chargePayment: Number(p.chargePayment || 0)
        });
      }
    } catch {
      // Payment lookup failed — leave as empty
    }
  }

  const buildModeOfPayment = (rows: Array<{ paymentChannels?: any[]; cashPayment?: number; chargePayment?: number }>): { modeText: string; channels: any[] } => {
    const agg: Record<string, { amount: number; accountName?: string }> = {};
    for (const r of rows) {
      const cashAmt = Number(r.cashPayment || 0);
      const chargeAmt = Number(r.chargePayment || 0);
      if (cashAmt > 0.001) {
        if (!agg['CASH']) agg['CASH'] = { amount: 0 };
        agg['CASH'].amount += cashAmt;
      }
      if (chargeAmt > 0.001) {
        if (!agg['CHARGE']) agg['CHARGE'] = { amount: 0 };
        agg['CHARGE'].amount += chargeAmt;
      }
      for (const ch of r.paymentChannels || []) {
        const rawName = String(ch.channel || 'OTHER').trim().toUpperCase() || 'OTHER';
        const amt = Number(ch.amount || 0);
        if (amt <= 0.001) continue;
        let key = rawName;
        const accName = String(ch.accountName || '').trim();
        if (rawName === 'GCASH' && accName) {
          const lower = accName.toLowerCase();
          if (lower.includes('louie')) key = 'GCASH (Louie)';
          else if (lower.includes('katrina')) key = 'GCASH (Katrina)';
          else if (lower.includes('anicia')) key = 'GCASH (Anicia)';
          else key = `GCASH (${accName})`;
        } else if (accName) {
          key = `${rawName} (${accName})`;
        }
        if (!agg[key]) agg[key] = { amount: 0, accountName: accName };
        agg[key].amount += amt;
      }
    }
    const entries = Object.entries(agg);
    if (entries.length === 0) return { modeText: '', channels: [] };
    const fmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const modeText = entries
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([name, info]) => `${name}: P${fmt.format(info.amount)}`)
      .join(', ');
    return { modeText, channels: entries.map(([name, info]) => ({ channel: name, amount: info.amount })) };
  };

  const enrichedSales = sales.map(sale => {
    if (sale.status === 'COMPLETED') {
      const sid = sale._id.toString();
      const progressRows = paymentRowsMap[sid] || [];
      const progress = derivePaymentProgress(sale.totalAmount || 0, progressRows);
      const paid = progress.paid;
      const effectiveDue = progress.effectiveDue;
      const balance = progress.balance;
      const paymentStatus = paid <= 0 ? 'UNPAID' : balance > 0 ? 'PARTIAL' : 'PAID';
      const mode = buildModeOfPayment(progressRows);
      return { ...sale, _paid: paid, _effectiveDue: effectiveDue, _balance: balance, _paymentStatus: paymentStatus, _paymentChannels: mode.channels, _modeOfPayment: mode.modeText };
    }
    return { ...sale, _paid: 0, _paymentStatus: '', _modeOfPayment: '', _paymentChannels: [] };
  });

  return {
    data: enrichedSales,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
};

export const getSaleById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid sale ID');
  }

  const sale = await Sale.findOne({ _id: id, isDeleted: false })
    .populate('customerId', 'name officeAddress deliveryAddress tin')
    .populate('lineItems.productId', 'code description uom')
    .lean();
  
  if (!sale) {
    throw new Error('Sale not found');
  }
  
  return sale;
};

export const generateDRNumber = async (docType: string = 'DR'): Promise<string> => {
  // Each document type has its own sequence
  const lastSale = await Sale.findOne({ documentType: docType, isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .select('drNumber')
    .lean();
  
  if (!lastSale || !lastSale.drNumber) return '1';
  
  const match = lastSale.drNumber.match(/(\d+)$/);
  if (!match) return '1';
  
  const lastNum = parseInt(match[1]) || 0;
  return String(lastNum + 1);
};

export const createSale = async (saleData: Partial<ISale>, userId: string) => {
  // Auto-generate document number if not provided
  if (!saleData.drNumber) {
    saleData.drNumber = await generateDRNumber(saleData.documentType || 'DR');
  }
  // Calculate line totals
  // NOTE: Historical Price Immutability (Requirement 7.7)
  // The sellingPrice in each line item is captured at the time of sale creation.
  // This price is stored in the sale record and will not change even if the
  // product's markup percentage or selling price is updated later.
  const lineItems = saleData.lineItems!.map(item => ({
    ...item,
    lineTotal: calculateSaleLineTotal(item.quantity, item.sellingPrice, item.discount || 0)
  }));

  // Calculate total amount
  const totalAmount = calculateSaleTotal(lineItems);

  // Validate stock availability
  await validateStockAvailability(lineItems);

  const sale = new Sale({
    ...saleData,
    lineItems,
    totalAmount,
    status: 'DRAFT',
    createdBy: userId,
    updatedBy: userId
  });

  await sale.save();
  return sale;
};

export const updateSale = async (id: string, saleData: Partial<ISale>, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid sale ID');
  }

  const sale = await Sale.findOne({ _id: id, isDeleted: false });
  
  if (!sale) {
    throw new Error('Sale not found');
  }

  // Don't allow updates to completed or cancelled sales
  if (sale.status !== 'DRAFT') {
    throw new Error(`Cannot update sale with status: ${sale.status}`);
  }

  // Recalculate line totals if line items are updated
  if (saleData.lineItems) {
    const lineItems = saleData.lineItems.map(item => ({
      ...item,
      lineTotal: calculateSaleLineTotal(item.quantity, item.sellingPrice, item.discount || 0)
    }));
    
    saleData.lineItems = lineItems;
    saleData.totalAmount = calculateSaleTotal(lineItems);
    
    // Validate stock availability
    await validateStockAvailability(lineItems);
  }

  Object.assign(sale, saleData, {
    updatedBy: userId,
    updatedAt: new Date()
  });

  await sale.save();
  return sale;
};

/**
 * Admin edit — can edit any sale regardless of status (requires admin password verified by middleware)
 */
export const adminEditSale = async (id: string, saleData: Partial<ISale>, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid sale ID');
  }

  const sale = await Sale.findOne({ _id: id, isDeleted: false });
  if (!sale) throw new Error('Sale not found');

  // Recalculate line totals if line items are updated
  if (saleData.lineItems) {
    const lineItems = saleData.lineItems.map(item => ({
      ...item,
      lineTotal: calculateSaleLineTotal(item.quantity, item.sellingPrice, item.discount || 0)
    }));
    saleData.lineItems = lineItems;
    // totalAmount = line items + delivery fee + toll fee (sent from frontend)
    const lineTotal = calculateSaleTotal(lineItems);
    saleData.totalAmount = lineTotal + ((saleData as any).deliveryFee || 0) + ((saleData as any).tollFee || 0);
  }

  // Allow updating any field
  const { adminPassword, ...cleanData } = saleData as any;

  // If saleDate is being changed, also update postedAt so cash drawer report reflects the new date
  if (cleanData.saleDate && sale.postedAt) {
    const newDate = new Date(cleanData.saleDate);
    const oldPosted = new Date(sale.postedAt);
    // Keep the time from postedAt but change the date
    newDate.setHours(oldPosted.getHours(), oldPosted.getMinutes(), oldPosted.getSeconds());
    cleanData.postedAt = newDate;
  }

  Object.assign(sale, cleanData, {
    updatedBy: userId,
    updatedAt: new Date()
  });

  await sale.save();
  return sale;
};

export const deleteSale = async (id: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid sale ID');
  }

  const sale = await Sale.findOne({ _id: id, isDeleted: false });
  
  if (!sale) {
    throw new Error('Sale not found');
  }

  // Don't allow deletion of completed sales
  if (sale.status === 'COMPLETED') {
    throw new Error('Cannot delete completed sale');
  }

  sale.isDeleted = true;
  sale.updatedBy = new mongoose.Types.ObjectId(userId);
  sale.updatedAt = new Date();
  
  await sale.save();
  return { message: 'Sale deleted successfully' };
};

/**
 * Post a sale (mark as completed and reduce stock)
 * Property 2: Stock Quantity Consistency
 */
export const postSale = async (id: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid sale ID');
  }

  const sale = await Sale.findOne({ _id: id, isDeleted: false });
  if (!sale) throw new Error('Sale not found');
  if (sale.status !== 'DRAFT') throw new Error(`Cannot post sale with status: ${sale.status}`);

  // Validate stock availability
  await validateStockAvailability(sale.lineItems);

  // Reduce stock for each line item (no session — standalone MongoDB)
  const productsToSave: any[] = [];
  const postingDate = new Date();

  for (const item of sale.lineItems) {
    let product = await Product.findOne({ _id: item.productId, isDeleted: { $ne: true } });

    // Fallback: Link by description if ID is missing (Post-Migration fix)
    if (!product && item.description?.trim()) {
      const trimmedDesc = item.description.trim();
      product = await Product.findOne({
        description: { $regex: new RegExp('^' + trimmedDesc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
        isDeleted: { $ne: true }
      });
      if (product) {
        item.productId = product._id;
      }
    }

    if (!product) {
      throw new Error(`Cannot post sale: product not found for line item "${item.description || item.productId}"`);
    }

    // conversionFactor must be a positive number; treat 0/null/undefined as 1
    const cf = (item.conversionFactor && item.conversionFactor > 0) ? item.conversionFactor : 1;
    const stockToDeduct = item.quantity * cf;
    const stockBefore = product.availableStock || 0;
    product.availableStock = stockBefore - stockToDeduct;
    const stockAfter = product.availableStock;

    // Capture stock snapshot on the line item
    (item as any).stockBefore = stockBefore;
    (item as any).stockAfter = stockAfter;

    if (!product.vomData) product.vomData = [];
    product.vomData.push({
      date: postingDate,
      quantityIn: 0,
      quantityOut: stockToDeduct,
      balance: stockAfter,
      reason: `SALE: ${sale.drNumber || id}`,
      referenceType: 'SALE',
      referenceId: id
    });
    product.updatedBy = new mongoose.Types.ObjectId(userId);
    productsToSave.push(product);
  }

  // Persist all product stock updates before finalizing the sale
  for (const product of productsToSave) {
    await product.save();
  }

  // Update sale status
  sale.status = 'COMPLETED';
  sale.postedAt = new Date();
  sale.postedBy = new mongoose.Types.ObjectId(userId);
  sale.updatedBy = new mongoose.Types.ObjectId(userId);
  await sale.save();
  return sale;
};

/**
 * Void a completed sale - cancel it and reverse stock
 */
export const voidSale = async (id: string, userId: string, reason: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid sale ID');
  }

  const sale = await Sale.findOne({ _id: id, isDeleted: false });
  if (!sale) throw new Error('Sale not found');
  if (sale.status === 'CANCELLED') throw new Error('Cannot void: sale is already cancelled');

  // Reverse stock for completed/posted sales (no session — standalone MongoDB)
  if (sale.status === 'COMPLETED') {
    for (const item of sale.lineItems) {
      if (item.productId) {
        const product = await Product.findById(item.productId);
        if (product) {
          const stockToRestore = item.quantity * (item.conversionFactor || 1);
          product.availableStock = (product.availableStock || 0) + stockToRestore;
          product.vomData.push({
            date: new Date(), quantityIn: stockToRestore, quantityOut: 0,
            balance: product.availableStock, reason: `VOID: ${reason}`,
            referenceType: 'VOID', referenceId: sale._id.toString()
          });
          await product.save();
        }
      }
    }
  }

  sale.status = 'CANCELLED';
  sale.updatedBy = new mongoose.Types.ObjectId(userId);
  await sale.save();
  return sale;
};
