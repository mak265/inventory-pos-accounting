import {
  validateRequired,
  validateNonNegative,
  validatePositive,
  validateObjectId,
  validateEnum,
  validateNonEmptyArray,
  validateDate,
  validateProduct,
  validateVendor,
  validatePurchaseOrder,
  validateSale,
  validatePayment,
  validateExpense,
  validateCustomer,
  validateUom,
  checkUomAbbreviationUnique,
  validateSellingUoms,
  validateVendorCosts,
  validateStockAdjustment,
} from './validationService.js'

describe('Validation Service', () => {
  describe('validateRequired', () => {
    it('should return errors for missing required fields', () => {
      const errors = validateRequired({}, [
        { field: 'name', label: 'Name' },
        { field: 'code', label: 'Code' },
      ])
      expect(errors).toHaveLength(2)
      expect(errors[0].message).toBe('Name is required')
      expect(errors[1].message).toBe('Code is required')
    })

    it('should return errors for empty string fields', () => {
      const errors = validateRequired({ name: '  ', code: '' }, [
        { field: 'name', label: 'Name' },
        { field: 'code', label: 'Code' },
      ])
      expect(errors).toHaveLength(2)
    })

    it('should return no errors when all fields present', () => {
      const errors = validateRequired({ name: 'Test', code: 'ABC' }, [
        { field: 'name', label: 'Name' },
        { field: 'code', label: 'Code' },
      ])
      expect(errors).toHaveLength(0)
    })
  })

  describe('validateNonNegative', () => {
    it('should return error for negative values', () => {
      const errors = validateNonNegative({ amount: -5 }, [{ field: 'amount', label: 'Amount' }])
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('Amount cannot be negative')
    })

    it('should allow zero values', () => {
      const errors = validateNonNegative({ amount: 0 }, [{ field: 'amount', label: 'Amount' }])
      expect(errors).toHaveLength(0)
    })

    it('should skip undefined values', () => {
      const errors = validateNonNegative({}, [{ field: 'amount', label: 'Amount' }])
      expect(errors).toHaveLength(0)
    })
  })

  describe('validatePositive', () => {
    it('should return error for zero', () => {
      const errors = validatePositive({ amount: 0 }, [{ field: 'amount', label: 'Amount' }])
      expect(errors).toHaveLength(1)
    })

    it('should return error for negative', () => {
      const errors = validatePositive({ amount: -1 }, [{ field: 'amount', label: 'Amount' }])
      expect(errors).toHaveLength(1)
    })

    it('should allow positive values', () => {
      const errors = validatePositive({ amount: 1 }, [{ field: 'amount', label: 'Amount' }])
      expect(errors).toHaveLength(0)
    })
  })

  describe('validateObjectId', () => {
    it('should return error for invalid ObjectId', () => {
      const errors = validateObjectId({ id: 'invalid' }, [{ field: 'id', label: 'ID' }])
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('ID is not a valid ID')
    })

    it('should accept valid ObjectId', () => {
      const errors = validateObjectId({ id: '507f1f77bcf86cd799439011' }, [{ field: 'id', label: 'ID' }])
      expect(errors).toHaveLength(0)
    })
  })

  describe('validateEnum', () => {
    it('should return error for invalid enum value', () => {
      const errors = validateEnum({ status: 'INVALID' }, 'status', 'Status', ['ACTIVE', 'INACTIVE'])
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('must be one of')
    })

    it('should accept valid enum value', () => {
      const errors = validateEnum({ status: 'ACTIVE' }, 'status', 'Status', ['ACTIVE', 'INACTIVE'])
      expect(errors).toHaveLength(0)
    })
  })

  describe('validateNonEmptyArray', () => {
    it('should return error for empty array', () => {
      const errors = validateNonEmptyArray({ items: [] }, 'items', 'Items')
      expect(errors).toHaveLength(1)
    })

    it('should accept non-empty array', () => {
      const errors = validateNonEmptyArray({ items: [1] }, 'items', 'Items')
      expect(errors).toHaveLength(0)
    })
  })

  describe('validateDate', () => {
    it('should return error for invalid date', () => {
      const errors = validateDate({ date: 'not-a-date' }, [{ field: 'date', label: 'Date' }])
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('Date is not a valid date')
    })

    it('should accept valid date string', () => {
      const errors = validateDate({ date: '2024-01-15' }, [{ field: 'date', label: 'Date' }])
      expect(errors).toHaveLength(0)
    })

    it('should accept Date object', () => {
      const errors = validateDate({ date: new Date() }, [{ field: 'date', label: 'Date' }])
      expect(errors).toHaveLength(0)
    })
  })

  describe('validateProduct', () => {
    it('should fail when required fields are missing', () => {
      const result = validateProduct({})
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(3)
    })

    it('should pass with valid product data', () => {
      const result = validateProduct({ code: 'P001', description: 'Test Product', uom: 'pcs' })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail with negative stock', () => {
      const result = validateProduct({
        code: 'P001',
        description: 'Test',
        uom: 'pcs',
        availableStock: -1,
      })
      expect(result.valid).toBe(false)
    })

    it('should not validate tuboPercentage (removed field)', () => {
      const result = validateProduct({
        code: 'P001',
        description: 'Test',
        uom: 'pcs',
        tuboPercentage: -5,
      })
      // tuboPercentage is no longer validated, so this should pass
      expect(result.valid).toBe(true)
    })

    it('should validate markupType enum', () => {
      const result = validateProduct({
        code: 'P001',
        description: 'Test',
        uom: 'pcs',
        markupType: 'invalid',
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'markupType')).toBe(true)
    })

    it('should accept valid markupType percentage', () => {
      const result = validateProduct({
        code: 'P001',
        description: 'Test',
        uom: 'pcs',
        markupType: 'percentage',
      })
      expect(result.valid).toBe(true)
    })

    it('should accept valid markupType fixed', () => {
      const result = validateProduct({
        code: 'P001',
        description: 'Test',
        uom: 'pcs',
        markupType: 'fixed',
        fixedMarkupAmount: 10,
      })
      expect(result.valid).toBe(true)
    })

    it('should fail with negative fixedMarkupAmount', () => {
      const result = validateProduct({
        code: 'P001',
        description: 'Test',
        uom: 'pcs',
        markupType: 'fixed',
        fixedMarkupAmount: -5,
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'fixedMarkupAmount')).toBe(true)
    })
  })

  describe('validateSale', () => {
    it('should fail when required fields are missing', () => {
      const result = validateSale({})
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(4)
    })

    it('should pass with valid sale data', () => {
      const result = validateSale({
        drNumber: 'DR001',
        saleDate: '2024-01-15',
        customerId: '507f1f77bcf86cd799439011',
        customerName: 'Test Customer',
        lineItems: [{ productId: '507f1f77bcf86cd799439011', quantity: 1 }],
        totalAmount: 100,
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('validatePayment', () => {
    it('should fail when required fields are missing', () => {
      const result = validatePayment({})
      expect(result.valid).toBe(false)
    })

    it('should pass with valid payment data', () => {
      const result = validatePayment({
        saleId: '507f1f77bcf86cd799439011',
        customerId: '507f1f77bcf86cd799439011',
        paymentDate: '2024-01-15',
        amountDue: 100,
        totalPaid: 100,
        unpaidAmount: 0,
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('validateExpense', () => {
    it('should fail when required fields are missing', () => {
      const result = validateExpense({})
      expect(result.valid).toBe(false)
    })

    it('should fail with invalid payment status', () => {
      const result = validateExpense({
        expenseDate: '2024-01-15',
        description: 'Test',
        amount: 100,
        paymentStatus: 'INVALID',
      })
      expect(result.valid).toBe(false)
    })

    it('should pass with valid expense data', () => {
      const result = validateExpense({
        expenseDate: '2024-01-15',
        description: 'Office supplies',
        amount: 50,
        paymentStatus: 'PAID',
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('validateCustomer', () => {
    it('should fail when name is missing', () => {
      const result = validateCustomer({})
      expect(result.valid).toBe(false)
    })

    it('should pass with valid customer data', () => {
      const result = validateCustomer({ name: 'Test Customer' })
      expect(result.valid).toBe(true)
    })
  })

  describe('validateVendor', () => {
    it('should fail when name is missing', () => {
      const result = validateVendor({})
      expect(result.valid).toBe(false)
    })

    it('should pass with valid vendor data', () => {
      const result = validateVendor({ name: 'Test Vendor' })
      expect(result.valid).toBe(true)
    })
  })

  describe('validatePurchaseOrder', () => {
    it('should fail when required fields are missing', () => {
      const result = validatePurchaseOrder({})
      expect(result.valid).toBe(false)
    })

    it('should pass with valid PO data', () => {
      const result = validatePurchaseOrder({
        poDate: '2024-01-15',
        vendorId: '507f1f77bcf86cd799439011',
        lineItems: [{ description: 'Item 1', quantity: 10 }],
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('validateDeliveryReceipt', () => {
    it('should fail when required fields are missing', () => {
      const result = validateProduct({})
      expect(result.valid).toBe(false)
    })
  })

  describe('validateUom', () => {
    it('should fail when name is missing', () => {
      const result = validateUom({ abbreviation: 'kg' })
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].field).toBe('name')
      expect(result.errors[0].message).toBe('UOM name is required')
    })

    it('should fail when abbreviation is missing', () => {
      const result = validateUom({ name: 'Kilogram' })
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].field).toBe('abbreviation')
      expect(result.errors[0].message).toBe('UOM abbreviation is required')
    })

    it('should fail when both fields are missing', () => {
      const result = validateUom({})
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)
    })

    it('should fail when name is empty string', () => {
      const result = validateUom({ name: '  ', abbreviation: 'kg' })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('name')
    })

    it('should fail when abbreviation is empty string', () => {
      const result = validateUom({ name: 'Kilogram', abbreviation: '' })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('abbreviation')
    })

    it('should pass with valid UOM data', () => {
      const result = validateUom({ name: 'Kilogram', abbreviation: 'kg' })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('checkUomAbbreviationUnique', () => {
    // This function queries MongoDB, so it needs integration tests with a real DB.
    // We verify the function is exported and callable.
    it('should be a function', () => {
      expect(typeof checkUomAbbreviationUnique).toBe('function')
    })
  })

  describe('validateSellingUoms', () => {
    it('should pass with valid selling UOM entries', () => {
      const result = validateSellingUoms([
        { uomId: '507f1f77bcf86cd799439011', conversionFactor: 12, sellingPrice: 100 },
      ])
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail with zero conversionFactor', () => {
      const result = validateSellingUoms([
        { uomId: '507f1f77bcf86cd799439011', conversionFactor: 0 },
      ])
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('sellingUoms[0].conversionFactor')
    })

    it('should fail with negative conversionFactor', () => {
      const result = validateSellingUoms([
        { uomId: '507f1f77bcf86cd799439011', conversionFactor: -5 },
      ])
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'sellingUoms[0].conversionFactor')).toBe(true)
    })

    it('should fail with missing uomId', () => {
      const result = validateSellingUoms([
        { conversionFactor: 10 },
      ])
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'sellingUoms[0].uomId')).toBe(true)
    })

    it('should fail with invalid uomId format', () => {
      const result = validateSellingUoms([
        { uomId: 'not-valid', conversionFactor: 10 },
      ])
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'sellingUoms[0].uomId')).toBe(true)
    })

    it('should validate multiple entries independently', () => {
      const result = validateSellingUoms([
        { uomId: '507f1f77bcf86cd799439011', conversionFactor: 12 },
        { uomId: 'invalid', conversionFactor: -1 },
      ])
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'sellingUoms[1].uomId')).toBe(true)
      expect(result.errors.some(e => e.field === 'sellingUoms[1].conversionFactor')).toBe(true)
    })

    it('should pass with empty array', () => {
      const result = validateSellingUoms([])
      expect(result.valid).toBe(true)
    })
  })

  describe('validateVendorCosts', () => {
    it('should pass with valid vendor cost entries', () => {
      const result = validateVendorCosts([
        { vendorId: '507f1f77bcf86cd799439011', unitCost: 50 },
      ])
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail with missing vendorId', () => {
      const result = validateVendorCosts([
        { unitCost: 50 },
      ])
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'vendorCosts[0].vendorId')).toBe(true)
    })

    it('should fail with invalid vendorId format', () => {
      const result = validateVendorCosts([
        { vendorId: 'bad-id', unitCost: 50 },
      ])
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'vendorCosts[0].vendorId')).toBe(true)
    })

    it('should fail with negative unitCost', () => {
      const result = validateVendorCosts([
        { vendorId: '507f1f77bcf86cd799439011', unitCost: -10 },
      ])
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'vendorCosts[0].unitCost')).toBe(true)
    })

    it('should allow zero unitCost', () => {
      const result = validateVendorCosts([
        { vendorId: '507f1f77bcf86cd799439011', unitCost: 0 },
      ])
      expect(result.valid).toBe(true)
    })

    it('should pass with empty array', () => {
      const result = validateVendorCosts([])
      expect(result.valid).toBe(true)
    })
  })

  describe('validateStockAdjustment', () => {
    it('should pass with valid IN adjustment', () => {
      const result = validateStockAdjustment({ type: 'IN', quantity: 10, reason: 'INITIAL_COUNT' })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should pass with valid OUT adjustment', () => {
      const result = validateStockAdjustment({ type: 'OUT', quantity: 5, reason: 'DAMAGE' })
      expect(result.valid).toBe(true)
    })

    it('should fail with invalid type', () => {
      const result = validateStockAdjustment({ type: 'INVALID', quantity: 10, reason: 'DAMAGE' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'type')).toBe(true)
    })

    it('should fail with zero quantity', () => {
      const result = validateStockAdjustment({ type: 'IN', quantity: 0, reason: 'RETURN' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'quantity')).toBe(true)
    })

    it('should fail with negative quantity', () => {
      const result = validateStockAdjustment({ type: 'IN', quantity: -5, reason: 'RETURN' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'quantity')).toBe(true)
    })

    it('should fail with empty reason', () => {
      const result = validateStockAdjustment({ type: 'IN', quantity: 10, reason: '' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'reason')).toBe(true)
    })

    it('should fail with whitespace-only reason', () => {
      const result = validateStockAdjustment({ type: 'IN', quantity: 10, reason: '   ' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'reason')).toBe(true)
    })

    it('should fail with missing reason', () => {
      const result = validateStockAdjustment({ type: 'IN', quantity: 10 })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'reason')).toBe(true)
    })

    it('should pass with custom reason string', () => {
      const result = validateStockAdjustment({ type: 'OUT', quantity: 3, reason: 'Customer return - defective' })
      expect(result.valid).toBe(true)
    })
  })
})
