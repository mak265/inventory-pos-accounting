import { Request, Response } from 'express';
import * as salesService from '../services/salesService.js';
import { logDeleteOperation } from '../services/auditLogService.js';
import { validateSale } from '../services/validationService.js';
import { validateSaleReferences, checkDeleteSafety } from '../services/referentialIntegrityService.js';

export const getSalesJournal = async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const query: any = { isDeleted: false, status: 'COMPLETED' };
    if (startDate || endDate) {
      query.saleDate = {};
      if (startDate) query.saleDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.saleDate.$lte = end;
      }
    }

    const SaleModel = (await import('../models/Sale')).default;
    const ProductModel = (await import('../models/Product')).default;

    const sales = await SaleModel
      .find(query)
      .populate('lineItems.productId', 'code description uom')
      .sort({ saleDate: -1, createdAt: -1 })
      .lean();

    // Collect all unique product IDs across all sales
    const productIds = new Set<string>();
    for (const sale of sales) {
      for (const item of sale.lineItems) {
        const pid = (item.productId as any)?._id?.toString() || item.productId?.toString();
        if (pid) productIds.add(pid);
      }
    }

    // Fetch VOM data for all products in one query
    const products = await ProductModel
      .find({ _id: { $in: Array.from(productIds) } })
      .select('_id code description uom vomData availableStock')
      .lean();

    // Build a map: productId -> sorted vomData (ascending by date)
    const vomMap = new Map<string, any[]>();
    for (const p of products) {
      const pid = p._id.toString();
      const sorted = (p.vomData || [])
        .filter((v: any) => v.date)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      vomMap.set(pid, sorted);
    }

    // For each sale line item, reconstruct stockBefore/stockAfter from VOM
    // Strategy: find the VOM entry closest in time to the sale's postedAt/createdAt
    // that has quantityOut > 0 (a sale deduction). stockAfter = that entry's balance,
    // stockBefore = balance + quantityOut.
    const enrichedSales = sales.map((sale: any) => {
      const saleTime = sale.postedAt ? new Date(sale.postedAt).getTime() : new Date(sale.updatedAt || sale.createdAt).getTime();

      const enrichedItems = sale.lineItems.map((item: any) => {
        // If already has stockBefore/stockAfter from new capture, use it
        if (item.stockBefore != null && item.stockAfter != null) {
          return item;
        }

        const pid = (item.productId as any)?._id?.toString() || item.productId?.toString();
        if (!pid) return item;

        const vomEntries = vomMap.get(pid) || [];
        const stockToDeduct = (item.quantity || 0) * (item.conversionFactor || 1);

        // Find the VOM entry that best matches this sale:
        // - has quantityOut matching the deduction amount (within tolerance)
        // - date is closest to saleTime
        let bestEntry: any = null;
        let bestDiff = Infinity;

        for (const v of vomEntries) {
          if (!v.quantityOut || v.quantityOut <= 0) continue;
          const diff = Math.abs(new Date(v.date).getTime() - saleTime);
          // Match if quantityOut is within 1% of expected deduction
          const tolerance = Math.max(0.01, stockToDeduct * 0.01);
          if (Math.abs(v.quantityOut - stockToDeduct) <= tolerance && diff < bestDiff) {
            bestDiff = diff;
            bestEntry = v;
          }
        }

        // Fallback: if no exact match, find closest VOM entry by time with any quantityOut
        if (!bestEntry) {
          for (const v of vomEntries) {
            if (!v.quantityOut || v.quantityOut <= 0) continue;
            const diff = Math.abs(new Date(v.date).getTime() - saleTime);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestEntry = v;
            }
          }
        }

        if (bestEntry) {
          return {
            ...item,
            stockBefore: bestEntry.balance + bestEntry.quantityOut,
            stockAfter: bestEntry.balance
          };
        }

        return item;
      });

      return { ...sale, lineItems: enrichedItems };
    });

    res.json(enrichedSales);
  } catch (error: any) {
    console.error('Error fetching sales journal:', error);
    res.status(500).json({ error: 'Failed to fetch sales journal' });
  }
};

export const getSales = async (req: Request, res: Response) => {
  try {
    const filters = {
      customerId: req.query.customerId as string,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: req.query.page as string,
      limit: req.query.limit as string,
      search: req.query.search as string
    };

    const sales = await salesService.getAllSales(filters);
    res.json(sales);
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
};

export const getNextNumber = async (req: Request, res: Response) => {
  try {
    const docType = (req.query.docType as string) || 'DR';
    const nextNumber = await salesService.generateDRNumber(docType);
    res.json({ nextNumber });
  } catch (error: any) {
    console.error('Error generating next number:', error);
    res.status(500).json({ error: error.message || 'Failed to generate next number' });
  }
};

export const getSale = async (req: Request, res: Response) => {
  try {
    const sale = await salesService.getSaleById(req.params.id as string);
    res.json(sale);
  } catch (error: any) {
    console.error('Error fetching sale:', error);
    if (error.message === 'Sale not found' || error.message === 'Invalid sale ID') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch sale' });
    }
  }
};

export const createSale = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Validate data integrity before save
    const validation = validateSale(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    // Validate referential integrity (warn only, don't block)
    const refIntegrity = await validateSaleReferences(req.body);
    if (!refIntegrity.valid) {
      console.warn('Sale referential integrity warnings:', refIntegrity.errors);
    }

    const sale = await salesService.createSale(req.body, userId);
    res.status(201).json(sale);
  } catch (error: any) {
    console.error('Error creating sale:', error?.message || error);
    res.status(error?.name === 'ValidationError' ? 400 : 500).json({ error: error.message || 'Failed to create sale' });
  }
};

export const updateSale = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const sale = await salesService.updateSale(req.params.id as string, req.body, userId);
    res.json(sale);
  } catch (error: any) {
    console.error('Error updating sale:', error);
    if (error.message === 'Sale not found' || error.message === 'Invalid sale ID') {
      res.status(404).json({ error: error.message });
    } else if (error.name === 'ValidationError' || error.message.includes('Cannot update') || error.message.includes('Insufficient stock')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update sale' });
    }
  }
};

// Admin edit — can edit any sale regardless of status
export const adminEditSale = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const sale = await salesService.adminEditSale(req.params.id as string, req.body, userId);
    res.json(sale);
  } catch (error: any) {
    console.error('Error admin-editing sale:', error);
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to edit sale' });
  }
};

export const deleteSale = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const username = (req as any).user.username;

    // Check referential integrity before delete
    const safety = await checkDeleteSafety('sales', req.params.id as string);
    if (!safety.valid) {
      return res.status(400).json({ error: 'Cannot delete: referential integrity violation', details: safety.errors });
    }

    const sale = await salesService.getSaleById(req.params.id as string);

    const result = await salesService.deleteSale(req.params.id as string, userId);

    await logDeleteOperation({
      collectionName: 'sales',
      recordId: req.params.id as string,
      recordData: sale as unknown as Record<string, unknown>,
      userId,
      username,
      ipAddress: req.ip,
      details: `Sale "${sale.drNumber}" deleted`,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error deleting sale:', error);
    if (error.message === 'Sale not found' || error.message === 'Invalid sale ID') {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('Cannot delete')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete sale' });
    }
  }
};

export const postSale = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const sale = await salesService.postSale(req.params.id as string, userId);
    res.json(sale);
  } catch (error: any) {
    console.error('Error posting sale:', error);
    if (error.message === 'Sale not found' || error.message === 'Invalid sale ID') {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('Cannot post') || error.message.includes('Insufficient stock')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Failed to post sale' });
    }
  }
};

export const voidSale = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { reason } = req.body;
    const sale = await salesService.voidSale(req.params.id as string, userId, reason || 'No reason provided');
    res.json(sale);
  } catch (error: any) {
    console.error('Error voiding sale:', error);
    if (error.message === 'Sale not found' || error.message === 'Invalid sale ID') {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('Cannot void')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Failed to void sale' });
    }
  }
};

// Return items — partial return, restore stock per product, reduce sale totalAmount
export const returnItems = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { items } = req.body; // [{ productId, returnQty, reason, conversionFactor, sellingPrice }]
    const Sale = (await import('../models/Sale')).default;
    const sale = await Sale.findOne({ _id: req.params.id, isDeleted: false });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const Product = (await import('../models/Product')).default;
    const mongoose = (await import('mongoose')).default;

    let totalRefund = 0;

    for (const item of items) {
      if (!item.productId || !item.returnQty || item.returnQty <= 0) continue;
      const product = await Product.findById(item.productId);
      if (!product) continue;

      // Restore stock
      const stockToRestore = item.returnQty * (item.conversionFactor || 1);
      product.availableStock = (product.availableStock || 0) + stockToRestore;
      if (!product.vomData) product.vomData = [];
      product.vomData.push({
        date: new Date(), quantityIn: stockToRestore, quantityOut: 0,
        balance: product.availableStock, reason: `RETURN: ${item.reason || 'No reason'}`,
        referenceType: 'RETURN', referenceId: req.params.id
      });
      product.updatedBy = new mongoose.Types.ObjectId(userId);
      await product.save();

      // Calculate refund amount for this item
      const sellingPrice = item.sellingPrice || 0;
      const refundAmount = item.returnQty * sellingPrice;
      totalRefund += refundAmount;

      // Update line item quantity in the sale
      const lineItem = sale.lineItems.find((li: any) => {
        const liPid = li.productId?.toString() || li.productId;
        return liPid === item.productId;
      });
      if (lineItem) {
        lineItem.quantity = Math.max(0, (lineItem.quantity || 0) - item.returnQty);
        lineItem.lineTotal = Math.max(0, lineItem.quantity * (lineItem.sellingPrice || 0) - (lineItem.discount || 0));
      }
    }

    // Reduce sale totalAmount by refund
    if (totalRefund > 0) {
      sale.totalAmount = Math.max(0, (sale.totalAmount || 0) - totalRefund);
      // Recalculate from line items
      const lineItemsTotal = sale.lineItems.reduce((s: number, li: any) => s + (li.lineTotal || 0), 0);
      sale.totalAmount = lineItemsTotal + (sale.deliveryFee || 0) + (sale.tollFee || 0);
    }

    sale.updatedBy = new mongoose.Types.ObjectId(userId);
    await sale.save();

    res.json({ message: 'Return processed', itemsReturned: items.filter((i: any) => i.returnQty > 0).length, totalRefund });
  } catch (error: any) {
    console.error('Error processing return:', error);
    res.status(500).json({ error: error.message || 'Failed to process return' });
  }
};

/**
 * POST /api/sales/repair-stock
 *
 * Scans every COMPLETED sale and checks whether each line item already has a
 * VOM entry with referenceType 'SALE' and referenceId matching that sale.
 * If the entry is missing the stock deduction was never recorded — the repair
 * re-applies it now.
 *
 * Query param:  ?dryRun=true   → report what would change, no writes
 * Body:         { adminPassword } (checked by requireAdminPassword middleware)
 *
 * Returns a detailed report:
 *   { salesScanned, itemsScanned, itemsAlreadyOk, itemsRepaired, itemsSkipped,
 *     details: [{ saleId, drNumber, productCode, description, qtyDeducted, action }] }
 */
export const repairStock = async (req: Request, res: Response) => {
  const dryRun = req.query.dryRun === 'true';
  const userId = (req as any).user.userId;

  try {
    const SaleModel    = (await import('../models/Sale')).default;
    const ProductModel = (await import('../models/Product')).default;
    const mongoose     = (await import('mongoose')).default;

    // Fetch all COMPLETED, non-deleted sales — sorted oldest first so stock
    // deductions are applied in chronological order.
    const sales = await SaleModel
      .find({ isDeleted: { $ne: true }, status: 'COMPLETED' })
      .sort({ postedAt: 1, createdAt: 1 })
      .lean();

    let salesScanned  = 0;
    let itemsScanned  = 0;
    let itemsAlreadyOk = 0;
    let itemsRepaired  = 0;
    let itemsSkipped   = 0;

    const details: Array<{
      saleId: string; drNumber: string; productCode: string;
      description: string; qtyDeducted: number; action: string;
    }> = [];

    for (const sale of sales) {
      salesScanned++;

      for (const item of sale.lineItems as any[]) {
        itemsScanned++;

        // ------------------------------------------------------------------
        // 1. Resolve the product (same logic as postSale)
        // ------------------------------------------------------------------
        let product: any = null;

        if (item.productId) {
          try {
            product = await ProductModel.findOne({
              _id: item.productId, isDeleted: { $ne: true }
            });
          } catch { /* invalid ObjectId — fall through to description match */ }
        }

        // Fallback: match by exact description (post-migration records)
        if (!product && item.description?.trim()) {
          const escaped = item.description.trim().replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
          product = await ProductModel.findOne({
            description: { $regex: new RegExp('^' + escaped + '$', 'i') },
            isDeleted: { $ne: true }
          });
        }

        // Additional fallback: try matching by product code if provided in the line item
        if (!product && (item.productCode || item.code)) {
          const codeToMatch = (item.productCode || item.code || '').toString().trim();
          if (codeToMatch) {
            const escapedCode = codeToMatch.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
            product = await ProductModel.findOne({
              code: { $regex: new RegExp('^' + escapedCode + '$', 'i') },
              isDeleted: { $ne: true }
            });
          }
        }

        if (!product) {
          itemsSkipped++;
          details.push({
            saleId: sale._id.toString(), drNumber: sale.drNumber,
            productCode: '', description: item.description || '(unknown)',
            qtyDeducted: 0, action: 'SKIPPED — product not found'
          });
          continue;
        }

        // ------------------------------------------------------------------
        // 2. Check whether a SALE VOM entry already exists for this sale+item
        // ------------------------------------------------------------------
        const saleIdStr = sale._id.toString();
        const cf = (item.conversionFactor && item.conversionFactor > 0) ? item.conversionFactor : 1;
        const expectedDeduction = item.quantity * cf;

        const alreadyDeducted = (product.vomData || []).some((v: any) =>
          v.referenceType === 'SALE' && v.referenceId === saleIdStr
        );

        if (alreadyDeducted) {
          itemsAlreadyOk++;
          continue; // stock was already deducted for this sale
        }

        // ------------------------------------------------------------------
        // 3. Also check heuristically: is there an untagged VOM entry close
        //    in time whose quantityOut matches the expected deduction?
        //    (These are old postSale entries that lack referenceType.)
        // ------------------------------------------------------------------
        const saleTime = sale.postedAt
          ? new Date(sale.postedAt).getTime()
          : new Date(sale.updatedAt || sale.createdAt).getTime();

        const matchingEntry = (product.vomData || []).find((v: any) => {
          if (v.referenceType) return false; // already tagged — handled above
          if (!v.quantityOut || v.quantityOut <= 0) return false;
          // Allow a slightly larger tolerance and wider time window for old entries
          const tolerance = Math.max(0.01, expectedDeduction * 0.05); // 5% tolerance
          const timeDiff  = Math.abs(new Date(v.date).getTime() - saleTime);
          return (
            Math.abs(v.quantityOut - expectedDeduction) <= tolerance &&
            timeDiff < 60 * 60 * 1000 // within 1 hour
          );
        });

        if (matchingEntry) {
          // Tag the existing VOM entry so we don't re-deduct on the next run
          if (!dryRun) {
            // Tag the existing VOM entry by matching on date and absence of referenceType.
            // We avoid matching on quantity here because old recordings may have slight rounding differences.
            await ProductModel.updateOne(
              { _id: product._id },
              { $set: { 'vomData.$[entry].referenceType': 'SALE', 'vomData.$[entry].referenceId': saleIdStr } },
              {
                arrayFilters: [
                  {
                    'entry.referenceType': { $exists: false },
                    'entry.date': matchingEntry.date
                  }
                ]
              }
            );
          }
          itemsAlreadyOk++;
          details.push({
            saleId: saleIdStr, drNumber: sale.drNumber,
            productCode: product.code, description: item.description,
            qtyDeducted: expectedDeduction,
            action: dryRun
              ? 'DRY-RUN: would tag existing untagged VOM entry'
              : 'TAGGED — existing VOM entry labelled with referenceType=SALE'
          });
          continue;
        }

        // ------------------------------------------------------------------
        // 4. No matching VOM entry — this is missing stock data. Apply it.
        // ------------------------------------------------------------------
        if (dryRun) {
          itemsRepaired++;
          details.push({
            saleId: saleIdStr, drNumber: sale.drNumber,
            productCode: product.code, description: item.description,
            qtyDeducted: expectedDeduction,
            action: `DRY-RUN: would deduct ${expectedDeduction} (current stock: ${product.availableStock})`
          });
          continue;
        }

        // Re-fetch with a write-lock intent (re-fetch to avoid stale reads)
        const freshProduct = await ProductModel.findOne({ _id: product._id, isDeleted: { $ne: true } });
        if (!freshProduct) { itemsSkipped++; continue; }

        const stockBefore = freshProduct.availableStock || 0;
        freshProduct.availableStock = stockBefore - expectedDeduction;
        const stockAfter = freshProduct.availableStock;

        if (!freshProduct.vomData) freshProduct.vomData = [];
        freshProduct.vomData.push({
          date: sale.postedAt ? new Date(sale.postedAt) : new Date(sale.updatedAt || sale.createdAt),
          quantityIn: 0,
          quantityOut: expectedDeduction,
          balance: stockAfter,
          reason: `REPAIR: SALE ${sale.drNumber}`,
          referenceType: 'SALE',
          referenceId: saleIdStr
        });
        freshProduct.updatedBy = new mongoose.Types.ObjectId(userId);
        await freshProduct.save();

        // Also stamp stockBefore/stockAfter on the sale line item
        await SaleModel.updateOne(
          { _id: sale._id, 'lineItems.productId': item.productId },
          {
            $set: {
              'lineItems.$[li].stockBefore': stockBefore,
              'lineItems.$[li].stockAfter': stockAfter
            }
          },
          { arrayFilters: [{ 'li.productId': item.productId }] }
        );

        itemsRepaired++;
        details.push({
          saleId: saleIdStr, drNumber: sale.drNumber,
          productCode: freshProduct.code, description: item.description,
          qtyDeducted: expectedDeduction,
          action: `REPAIRED — deducted ${expectedDeduction} (${stockBefore} → ${stockAfter})`
        });
      }
    }

    res.json({
      dryRun,
      salesScanned,
      itemsScanned,
      itemsAlreadyOk,
      itemsRepaired,
      itemsSkipped,
      details
    });
  } catch (error: any) {
    console.error('Error repairing stock:', error);
    res.status(500).json({ error: error.message || 'Failed to repair stock' });
  }
};
