import mongoose from 'mongoose'

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Validates that required fields are present and non-empty.
 */
export const validateRequired = (
  data: Record<string, unknown>,
  requiredFields: { field: string; label: string }[]
): ValidationError[] => {
  const errors: ValidationError[] = []
  for (const { field, label } of requiredFields) {
    const value = data[field]
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      errors.push({ field, message: `${label} is required` })
    }
  }
  return errors
}

/**
 * Validates that numeric fields are non-negative.
 */
export const validateNonNegative = (
  data: Record<string, unknown>,
  fields: { field: string; label: string }[]
): ValidationError[] => {
  const errors: ValidationError[] = []
  for (const { field, label } of fields) {
    const value = data[field]
    if (value !== undefined && value !== null && typeof value === 'number' && value < 0) {
      errors.push({ field, message: `${label} cannot be negative` })
    }
  }
  return errors
}

/**
 * Validates that a value is a positive number (greater than zero).
 */
export const validatePositive = (
  data: Record<string, unknown>,
  fields: { field: string; label: string }[]
): ValidationError[] => {
  const errors: ValidationError[] = []
  for (const { field, label } of fields) {
    const value = data[field]
    if (value !== undefined && value !== null) {
      if (typeof value !== 'number' || value <= 0) {
        errors.push({ field, message: `${label} must be a positive number` })
      }
    }
  }
  return errors
}

/**
 * Validates that a string is a valid ObjectId.
 */
export const validateObjectId = (
  data: Record<string, unknown>,
  fields: { field: string; label: string }[]
): ValidationError[] => {
  const errors: ValidationError[] = []
  for (const { field, label } of fields) {
    const value = data[field]
    if (value !== undefined && value !== null && typeof value === 'string') {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        errors.push({ field, message: `${label} is not a valid ID` })
      }
    }
  }
  return errors
}

/**
 * Validates that a value is one of the allowed enum values.
 */
export const validateEnum = (
  data: Record<string, unknown>,
  field: string,
  label: string,
  allowedValues: string[]
): ValidationError[] => {
  const errors: ValidationError[] = []
  const value = data[field]
  if (value !== undefined && value !== null && typeof value === 'string') {
    if (!allowedValues.includes(value)) {
      errors.push({ field, message: `${label} must be one of: ${allowedValues.join(', ')}` })
    }
  }
  return errors
}

/**
 * Validates that an array is non-empty.
 */
export const validateNonEmptyArray = (
  data: Record<string, unknown>,
  field: string,
  label: string
): ValidationError[] => {
  const errors: ValidationError[] = []
  const value = data[field]
  if (value !== undefined && value !== null) {
    if (!Array.isArray(value) || value.length === 0) {
      errors.push({ field, message: `${label} must have at least one item` })
    }
  }
  return errors
}

/**
 * Validates a date field is a valid date.
 */
export const validateDate = (
  data: Record<string, unknown>,
  fields: { field: string; label: string }[]
): ValidationError[] => {
  const errors: ValidationError[] = []
  for (const { field, label } of fields) {
    const value = data[field]
    if (value !== undefined && value !== null) {
      const date = value instanceof Date ? value : new Date(value as string)
      if (isNaN(date.getTime())) {
        errors.push({ field, message: `${label} is not a valid date` })
      }
    }
  }
  return errors
}

// ---- Model-specific validators ----

/**
 * Check if a UOM abbreviation already exists in the database.
 * Excludes the given ID (for update scenarios).
 * Uses mongoose.model to avoid circular import issues.
 */
export const checkUomAbbreviationUnique = async (
  abbreviation: string,
  excludeId?: string
): Promise<ValidationError[]> => {
  const errors: ValidationError[] = []
  const UOM = mongoose.model('UOM')
  const query: Record<string, unknown> = {
    abbreviation: abbreviation.toLowerCase().trim(),
    isDeleted: false,
  }
  if (excludeId) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeId) }
  }
  const existing = await UOM.findOne(query)
  if (existing) {
    errors.push({ field: 'abbreviation', message: 'UOM abbreviation already exists' })
  }
  return errors
}

/**
 * Validate UOM data before save.
 */
export const validateUom = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateRequired(data, [
      { field: 'name', label: 'UOM name' },
      { field: 'abbreviation', label: 'UOM abbreviation' },
    ]),
  ]
  return { valid: errors.length === 0, errors }
}

/**
 * Validate product data before save.
 */
export const validateProduct = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateRequired(data, [
      { field: 'code', label: 'Product code' },
      { field: 'description', label: 'Product description' },
      { field: 'uom', label: 'Unit of measure' },
    ]),
    ...validateNonNegative(data, [
      { field: 'availableStock', label: 'Available stock' },
      { field: 'lastCost', label: 'Last cost' },
      { field: 'averageCost', label: 'Average cost' },
      { field: 'sellingPrice', label: 'Selling price' },
      { field: 'markupPercentage', label: 'Markup percentage' },
      { field: 'fixedMarkupAmount', label: 'Fixed markup amount' },
    ]),
    ...validateEnum(data, 'markupType', 'Markup type', ['percentage', 'fixed']),
  ]
  return { valid: errors.length === 0, errors }
}

/**
 * Validate selling UOM entries.
 * Each entry must have a positive conversionFactor and a valid uomId format.
 */
export const validateSellingUoms = (sellingUoms: Record<string, unknown>[]): ValidationResult => {
  const errors: ValidationError[] = []
  for (let i = 0; i < sellingUoms.length; i++) {
    const entry = sellingUoms[i]
    const conversionFactor = entry.conversionFactor
    if (conversionFactor === undefined || conversionFactor === null || typeof conversionFactor !== 'number' || conversionFactor <= 0) {
      errors.push({ field: `sellingUoms[${i}].conversionFactor`, message: `Selling UOM entry ${i + 1}: conversion factor must be a positive number` })
    }
    const uomId = entry.uomId
    if (uomId === undefined || uomId === null) {
      errors.push({ field: `sellingUoms[${i}].uomId`, message: `Selling UOM entry ${i + 1}: uomId is required` })
    } else if (typeof uomId === 'string' && !mongoose.Types.ObjectId.isValid(uomId)) {
      errors.push({ field: `sellingUoms[${i}].uomId`, message: `Selling UOM entry ${i + 1}: uomId is not a valid ID` })
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Validate vendor cost entries.
 * Each entry must have a valid vendorId format and non-negative unitCost.
 */
export const validateVendorCosts = (vendorCosts: Record<string, unknown>[]): ValidationResult => {
  const errors: ValidationError[] = []
  for (let i = 0; i < vendorCosts.length; i++) {
    const entry = vendorCosts[i]
    const vendorId = entry.vendorId
    if (vendorId === undefined || vendorId === null) {
      errors.push({ field: `vendorCosts[${i}].vendorId`, message: `Vendor cost entry ${i + 1}: vendorId is required` })
    } else if (typeof vendorId === 'string' && !mongoose.Types.ObjectId.isValid(vendorId)) {
      errors.push({ field: `vendorCosts[${i}].vendorId`, message: `Vendor cost entry ${i + 1}: vendorId is not a valid ID` })
    }
    const unitCost = entry.unitCost
    if (unitCost !== undefined && unitCost !== null && typeof unitCost === 'number' && unitCost < 0) {
      errors.push({ field: `vendorCosts[${i}].unitCost`, message: `Vendor cost entry ${i + 1}: unit cost cannot be negative` })
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Validate stock adjustment request.
 * Type must be 'IN' or 'OUT', quantity must be positive, reason must be non-empty.
 */
export const validateStockAdjustment = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateEnum(data, 'type', 'Adjustment type', ['IN', 'OUT']),
    ...validatePositive(data, [{ field: 'quantity', label: 'Quantity' }]),
  ]

  // Validate reason: must be a non-empty, non-whitespace-only string
  const reason = data.reason
  if (reason === undefined || reason === null || typeof reason !== 'string' || reason.trim() === '') {
    errors.push({ field: 'reason', message: 'Reason is required and must be non-empty' })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate vendor data before save.
 */
export const validateVendor = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateRequired(data, [{ field: 'name', label: 'Vendor name' }]),
  ]
  return { valid: errors.length === 0, errors }
}

/**
 * Validate purchase order data before save.
 */
export const validatePurchaseOrder = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateRequired(data, [
      { field: 'poDate', label: 'PO date' },
      { field: 'vendorId', label: 'Vendor' },
    ]),
    ...validateDate(data, [{ field: 'poDate', label: 'PO date' }]),
    ...validateObjectId(data, [{ field: 'vendorId', label: 'Vendor' }]),
    ...validateNonEmptyArray(data, 'lineItems', 'Line items'),
  ]
  return { valid: errors.length === 0, errors }
}

/**
 * Validate delivery receipt data before save.
 */
export const validateDeliveryReceipt = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateRequired(data, [
      { field: 'vendorId', label: 'Vendor' },
      { field: 'deliveryDate', label: 'Delivery date' },
    ]),
    ...validateDate(data, [{ field: 'deliveryDate', label: 'Delivery date' }]),
    ...validateNonEmptyArray(data, 'lineItems', 'Line items'),
  ]
  return { valid: errors.length === 0, errors }
}

/**
 * Validate sale data before save.
 */
export const validateSale = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateRequired(data, [
      { field: 'saleDate', label: 'Sale date' },
      { field: 'customerName', label: 'Customer name' },
    ]),
    ...validateDate(data, [{ field: 'saleDate', label: 'Sale date' }]),
    ...(data.customerId ? validateObjectId(data, [{ field: 'customerId', label: 'Customer' }]) : []),
    ...validateNonEmptyArray(data, 'lineItems', 'Line items'),
    ...validateNonNegative(data, [{ field: 'totalAmount', label: 'Total amount' }]),
  ]
  return { valid: errors.length === 0, errors }
}

/**
 * Validate payment data before save.
 */
export const validatePayment = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateRequired(data, [
      { field: 'saleId', label: 'Sale reference' },
      { field: 'paymentDate', label: 'Payment date' },
    ]),
    ...validateDate(data, [{ field: 'paymentDate', label: 'Payment date' }]),
    ...validateObjectId(data, [
      { field: 'saleId', label: 'Sale reference' },
    ]),
    ...(data.customerId ? validateObjectId(data, [{ field: 'customerId', label: 'Customer' }]) : []),
    ...validateNonNegative(data, [
      { field: 'amountDue', label: 'Amount due' },
      { field: 'cashPayment', label: 'Cash payment' },
      { field: 'totalPaid', label: 'Total paid' },
    ]),
  ]
  return { valid: errors.length === 0, errors }
}

/**
 * Validate expense data before save.
 */
export const validateExpense = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateRequired(data, [
      { field: 'expenseDate', label: 'Expense date' },
      { field: 'description', label: 'Description' },
      { field: 'amount', label: 'Amount' },
      { field: 'paymentStatus', label: 'Payment status' },
    ]),
    ...validateDate(data, [{ field: 'expenseDate', label: 'Expense date' }]),
    ...validatePositive(data, [{ field: 'amount', label: 'Amount' }]),
    ...validateEnum(data, 'paymentStatus', 'Payment status', ['PAID', 'UNPAID']),
  ]
  return { valid: errors.length === 0, errors }
}

/**
 * Validate customer data before save.
 */
export const validateCustomer = (data: Record<string, unknown>): ValidationResult => {
  const errors: ValidationError[] = [
    ...validateRequired(data, [{ field: 'name', label: 'Customer name' }]),
    ...validateNonNegative(data, [{ field: 'balance', label: 'Balance' }]),
  ]
  return { valid: errors.length === 0, errors }
}
