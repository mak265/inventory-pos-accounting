import mongoose from 'mongoose'
import Product from '../models/Product.js'
import Customer from '../models/Customer.js'
import Vendor from '../models/Vendor.js'
import PurchaseOrder from '../models/PurchaseOrder.js'
import Sale from '../models/Sale.js'
import Payment from '../models/Payment.js'

export interface IntegrityError {
  field: string
  message: string
}

export interface IntegrityResult {
  valid: boolean
  errors: IntegrityError[]
}

/**
 * Check if a referenced document exists and is not soft-deleted.
 */
const checkReferenceExists = async (
  model: mongoose.Model<any>,
  id: string,
  field: string,
  label: string
): Promise<IntegrityError | null> => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { field, message: `${label} is not a valid reference` }
  }

  const doc = await model.findOne({ _id: id, isDeleted: { $ne: true } }).lean()
  if (!doc) {
    return { field, message: `Referenced ${label} does not exist` }
  }

  return null
}

/**
 * Validate referential integrity for a sale.
 * Checks that customerId and all productIds in lineItems exist.
 */
export const validateSaleReferences = async (data: Record<string, unknown>): Promise<IntegrityResult> => {
  const errors: IntegrityError[] = []

  // Check customer exists
  if (data.customerId) {
    const err = await checkReferenceExists(Customer, data.customerId as string, 'customerId', 'customer')
    if (err) errors.push(err)
  }

  // Check product references in line items
  const lineItems = data.lineItems as Array<Record<string, unknown>> | undefined
  if (lineItems && Array.isArray(lineItems)) {
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i]
      if (item.productId) {
        const err = await checkReferenceExists(
          Product,
          item.productId as string,
          `lineItems[${i}].productId`,
          'product'
        )
        if (err) errors.push(err)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate referential integrity for a payment.
 * Checks that saleId and customerId exist.
 */
export const validatePaymentReferences = async (data: Record<string, unknown>): Promise<IntegrityResult> => {
  const errors: IntegrityError[] = []

  if (data.saleId) {
    const err = await checkReferenceExists(Sale, data.saleId as string, 'saleId', 'sale')
    if (err) errors.push(err)
  }

  if (data.customerId) {
    const err = await checkReferenceExists(Customer, data.customerId as string, 'customerId', 'customer')
    if (err) errors.push(err)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate referential integrity for a purchase order.
 * Checks that vendorId exists.
 */
export const validatePurchaseOrderReferences = async (data: Record<string, unknown>): Promise<IntegrityResult> => {
  const errors: IntegrityError[] = []

  if (data.vendorId) {
    const err = await checkReferenceExists(Vendor, data.vendorId as string, 'vendorId', 'vendor')
    if (err) errors.push(err)
  }

  // Check product references in line items
  const lineItems = data.lineItems as Array<Record<string, unknown>> | undefined
  if (lineItems && Array.isArray(lineItems)) {
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i]
      if (item.productId) {
        const err = await checkReferenceExists(
          Product,
          item.productId as string,
          `lineItems[${i}].productId`,
          'product'
        )
        if (err) errors.push(err)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate referential integrity for a delivery receipt.
 * Checks that vendorId and optional poId exist.
 */
export const validateDeliveryReceiptReferences = async (data: Record<string, unknown>): Promise<IntegrityResult> => {
  const errors: IntegrityError[] = []

  // vendorId might be an object from q-select — extract _id
  const vendorId = typeof data.vendorId === 'object' && data.vendorId ? (data.vendorId as any)._id || data.vendorId : data.vendorId;
  if (vendorId && typeof vendorId === 'string') {
    const err = await checkReferenceExists(Vendor, vendorId, 'vendorId', 'vendor')
    if (err) errors.push(err)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Check if a record can be safely deleted without creating orphaned records.
 * Returns errors if other records reference this one.
 */
export const checkDeleteSafety = async (
  collectionName: string,
  recordId: string
): Promise<IntegrityResult> => {
  const errors: IntegrityError[] = []

  switch (collectionName) {
    case 'customers': {
      const salesCount = await Sale.countDocuments({ customerId: recordId, isDeleted: { $ne: true } })
      if (salesCount > 0) {
        errors.push({
          field: 'customerId',
          message: `Cannot delete customer: ${salesCount} sale(s) reference this customer`,
        })
      }
      const paymentsCount = await Payment.countDocuments({ customerId: recordId, isDeleted: { $ne: true } })
      if (paymentsCount > 0) {
        errors.push({
          field: 'customerId',
          message: `Cannot delete customer: ${paymentsCount} payment(s) reference this customer`,
        })
      }
      break
    }
    case 'vendors': {
      const posCount = await PurchaseOrder.countDocuments({ vendorId: recordId, isDeleted: { $ne: true } })
      if (posCount > 0) {
        errors.push({
          field: 'vendorId',
          message: `Cannot delete vendor: ${posCount} purchase order(s) reference this vendor`,
        })
      }
      break
    }
    case 'products': {
      // Allow deletion — soft delete only, sales still reference the product ID
      break
    }
    case 'sales': {
      const paymentsForSale = await Payment.countDocuments({ saleId: recordId, isDeleted: { $ne: true } })
      if (paymentsForSale > 0) {
        errors.push({
          field: 'saleId',
          message: `Cannot delete sale: ${paymentsForSale} payment(s) reference this sale`,
        })
      }
      break
    }
    case 'uoms': {
      // Check if any products use this UOM as base UOM
      const productsWithBaseUom = await Product.countDocuments({
        uomId: recordId,
        isDeleted: { $ne: true }
      })
      if (productsWithBaseUom > 0) {
        errors.push({
          field: 'uomId',
          message: `Cannot delete UOM: ${productsWithBaseUom} product(s) use this as base UOM`,
        })
      }

      // Check if any products use this UOM in selling UOMs
      const productsWithSellingUom = await Product.countDocuments({
        'sellingUoms.uomId': recordId,
        isDeleted: { $ne: true }
      })
      if (productsWithSellingUom > 0) {
        errors.push({
          field: 'uomId',
          message: `Cannot delete UOM: ${productsWithSellingUom} product(s) use this in selling UOMs`,
        })
      }
      break
    }
  }

  return { valid: errors.length === 0, errors }
}
