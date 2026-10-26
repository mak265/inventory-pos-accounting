import { Request, Response } from 'express';
import Product from '../models/Product.js';
import { logDeleteOperation } from '../services/auditLogService.js';
import { validateProduct, validateStockAdjustment } from '../services/validationService.js';
import { checkDeleteSafety } from '../services/referentialIntegrityService.js';
import { adjustStock } from '../services/productService.js';
import { calculateFinalSellingPrice } from '../services/pricingService.js';

// Use Request type - user is added by authenticate middleware via global declaration
type AuthRequest = Request;

// GET /api/products - List products with pagination and filters
export const getProducts = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      sortBy = 'code',
      sortOrder = 'asc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query: any = { isDeleted: false };
    
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by active status
    if (req.query.isActive === 'true') query.isActive = { $ne: false };
    else if (req.query.isActive === 'false') query.isActive = false;

    // Build sort
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .select('-vomData') // Exclude VOM data for list view
        .lean(),
      Product.countDocuments(query)
    ]);

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

// GET /api/products/:id - Get product details
export const getProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await Product.findOne({ _id: id, isDeleted: false });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
};

// GET /api/products/:id/history - Get stock movement history
export const getProductHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await Product.findOne({ _id: id, isDeleted: false })
      .select('code description vomData')
      .lean();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      code: product.code,
      description: product.description,
      history: product.vomData
    });
  } catch (error) {
    console.error('Error fetching product history:', error);
    res.status(500).json({ error: 'Failed to fetch product history' });
  }
};

// POST /api/products - Create product
export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const productData = req.body;

    // Validate data integrity before save
    const validation = validateProduct(productData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const product = new Product({
      ...productData,
      createdBy: req.user?.userId,
      updatedBy: req.user?.userId
    });

    await product.save();

    res.status(201).json(product);
  } catch (error: any) {
    console.error('Error creating product:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
    
    res.status(500).json({ error: 'Failed to create product' });
  }
};

// PUT /api/products/:id - Update product
export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const product = await Product.findOne({ _id: id, isDeleted: false });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Update fields
    Object.assign(product, updates);
    product.updatedBy = req.user?.userId;

    // Auto-recalculate only when sellingPrice is not explicitly provided by the user.
    // This prevents save-time overwrites where preview and saved values diverge.
    const hasExplicitSellingPrice = updates.sellingPrice !== undefined && updates.sellingPrice !== null && updates.sellingPrice !== '';
    if (!hasExplicitSellingPrice && product.averageCost && product.averageCost > 0) {
      const markupChanged = updates.markupType !== undefined || updates.markupPercentage !== undefined || updates.fixedMarkupAmount !== undefined;
      if (markupChanged || updates.averageCost !== undefined || updates.lastCost !== undefined) {
        product.sellingPrice = calculateFinalSellingPrice(
          product.lastCost || product.averageCost,
          product.markupType,
          product.markupPercentage,
          product.fixedMarkupAmount
        );
      }
    }

    await product.save();

    res.json(product);
  } catch (error: any) {
    console.error('Error updating product:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
    
    res.status(500).json({ error: 'Failed to update product' });
  }
};

// DELETE /api/products/:id - Delete product (requires admin password via middleware)
export const deleteProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check referential integrity before delete
    const safety = await checkDeleteSafety('products', id);
    if (!safety.valid) {
      return res.status(400).json({ error: 'Cannot delete: referential integrity violation', details: safety.errors });
    }

    const product = await Product.findOne({ _id: id, isDeleted: false });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Capture data before deletion for audit log
    const productData = product.toObject();

    // Soft delete
    product.isDeleted = true;
    product.updatedBy = req.user?.userId;
    await product.save();

    await logDeleteOperation({
      collectionName: 'products',
      recordId: id,
      recordData: productData as unknown as Record<string, unknown>,
      userId: req.user?.userId || 'unknown',
      username: req.user?.username || 'unknown',
      ipAddress: typeof req.ip === 'string' ? req.ip : undefined,
      details: `Product "${productData.code} - ${productData.description}" deleted`,
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
};


// POST /api/products/:id/stock-adjust - Adjust stock with reason tracking
export const stockAdjust = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { type, quantity, reason, notes } = req.body;

    // Validate stock adjustment request
    const validation = validateStockAdjustment({ type, quantity, reason });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const quantityChange = type === 'IN' ? quantity : -quantity;
    const userId = req.user?.userId;

    const updatedProduct = await adjustStock(
      id,
      quantityChange,
      userId,
      reason,
      'MANUAL_ADJUST'
    );

    res.json(updatedProduct);
  } catch (error: any) {
    console.error('Error adjusting stock:', error);

    if (error.message?.startsWith('Insufficient stock') || error.message === 'Product not found') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to adjust stock' });
  }
};

// Product Sales Journal — who bought this product, when, qty, price
export const getProductJournal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const Sale = (await import('../models/Sale')).default;
    const idStr = String(id);

    // Do NOT filter by 'lineItems.productId' at the DB layer.
    // - Mongo (web): URL param is a raw hex STRING, stored lineItems.productId is ObjectId class.
    //   Strict embedded-array compare returns empty set for type mismatch (no auto-coerce on nested).
    // - SQLite (desktop): dot-notated key 'lineItems.productId' maps to fake column 'lineItems_productId'
    //   via sqlite-adapter.ts buildWhereClause → "no such column" SqliteError → 500 → silent blank journal.
    // Instead pull all completed sales cheaply, then filter+match by .toString() equality in JS.
    // Works for BOTH platforms regardless of whether productId is ObjectId or primitive string.
    const baseQuery: any = { isDeleted: { $ne: true }, status: 'COMPLETED' };
    const salesAll = await Sale.find(baseQuery)
      .populate('customerId', 'name')
      .sort({ saleDate: -1 })
      .lean();

    function matchesProduct(li: any) {
      const liPidStr = (li?.productId?._id || li?.productId)?.toString?.();
      return liPidStr === idStr;
    }

    const sales = salesAll.filter((s: any) => Array.isArray(s.lineItems) && s.lineItems.some(matchesProduct));

    const journal = sales.map((sale: any) => {
      const item = sale.lineItems.find(matchesProduct);
      return {
        date: sale.saleDate,
        drNumber: sale.drNumber,
        customerName: sale.customerId?.name || sale.customerName || 'Walk-in',
        quantity: item?.quantity || 0,
        sellingPrice: item?.sellingPrice || 0,
        discount: item?.discount || 0,
        lineTotal: item?.lineTotal || 0
      };
    });

    res.json(journal);
  } catch (error: any) {
    console.error('[Product] getProductJournal error:', error?.message, error?.stack || '');
    res.status(500).json({ error: error.message || 'Failed to get product journal', message: error?.message, stack: error?.stack, name: error?.name });
  }
};


// Product Vendor/Purchase Journal — all deliveries of this product with prices & discounts
export const getProductVendorJournal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const DeliveryReceipt = (await import('../models/DeliveryReceipt')).default;
    const idStr = String(id);

    // Same reasoning as getProductJournal — skip nested lineItems filter in DB layer,
    // filter in memory using .toString() comparison to avoid Mongo type mismatch + SQLite fake-column errors.
    const baseQuery: any = { isDeleted: { $ne: true }, status: 'POSTED' };
    const drsAll = await DeliveryReceipt.find(baseQuery)
      .populate('vendorId', 'name')
      .sort({ deliveryDate: -1 })
      .lean();

    function matchesProduct(li: any) {
      const liPidStr = (li?.productId?._id || li?.productId)?.toString?.();
      return liPidStr === idStr;
    }

    const drs = drsAll.filter((d: any) => Array.isArray(d.lineItems) && d.lineItems.some(matchesProduct));

    const journal = drs.map((dr: any) => {
      const item = dr.lineItems.find(matchesProduct);
      return {
        date: dr.deliveryDate,
        drNumber: dr.drNumber,
        vendorName: dr.vendorId?.name || dr.vendorName || '',
        quantity: item?.quantityReceived || 0,
        grossCost: item?.unitCost || 0,
        discount1: item?.discount1 || 0, discount1Mode: item?.discount1Mode || 'subtract',
        discount2: item?.discount2 || 0, discount2Mode: item?.discount2Mode || 'subtract',
        discount3: item?.discount3 || 0, discount3Mode: item?.discount3Mode || 'subtract',
        discount4: item?.discount4 || 0, discount4Mode: item?.discount4Mode || 'subtract',
        netCost: item?.netCost || item?.unitCost || 0,
        lineTotal: (item?.quantityReceived || 0) * (item?.netCost || item?.unitCost || 0)
      };
    });

    res.json(journal);
  } catch (error: any) {
    console.error('[Product] getProductVendorJournal error:', error?.message, error?.stack || '');
    res.status(500).json({ error: error.message || 'Failed to get vendor journal', message: error?.message, stack: error?.stack, name: error?.name });
  }
};
