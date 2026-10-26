import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../config/database-adapter.js'
import { User } from '../models/User.js'
import UOM from '../models/UOM.js'
import Product from '../models/Product.js'
import Customer from '../models/Customer.js'
import Vendor from '../models/Vendor.js'
import { SystemConfiguration } from '../models/SystemConfiguration.js'
import Sale from '../models/Sale.js'
import PurchaseOrder from '../models/PurchaseOrder.js'
import DeliveryReceipt from '../models/DeliveryReceipt.js'
import Expense from '../models/Expense.js'
import AssetAccount from '../models/AssetAccount.js'
import { createPayment } from '../services/paymentService.js'

async function seed() {
  try {
    await connectDatabase()
    console.log('🌱 Seeding database for presentation...\n')

    // ── Users ──
    let admin = await User.findOne({ username: 'admin' })
    if (!admin) { admin = await User.create({ username: 'admin', passwordHash: 'admin123', role: 'ADMIN', fullName: 'Super Admin', isActive: true }); console.log('✅ Admin (admin/admin123)') }
    let cashier = await User.findOne({ username: 'cashier1' })
    if (!cashier) { cashier = await User.create({ username: 'cashier1', passwordHash: 'cashier123', role: 'CASHIER', fullName: 'Maria Santos', isActive: true }); console.log('✅ Cashier (cashier1/cashier123)') }
    let manager = await User.findOne({ username: 'manager1' })
    if (!manager) { manager = await User.create({ username: 'manager1', passwordHash: 'manager123', role: 'MANAGER', fullName: 'Juan Reyes', isActive: true }); console.log('✅ Manager (manager1/manager123)') }
    const uid = admin._id

    // ── Settings ──
    if (!await SystemConfiguration.findOne({ key: 'main' })) {
      await SystemConfiguration.create({ key: 'main', companyName: 'Aberin Hardware & Construction Supply', tagline: 'Your Trusted Hardware Partner Since 2010' })
      console.log('✅ Company settings')
    }

    // ── UOMs ──
    const uoms = [
      { name: 'Piece', abbreviation: 'pcs' }, { name: 'Kilogram', abbreviation: 'kg' },
      { name: 'Meter', abbreviation: 'm' }, { name: 'Liter', abbreviation: 'ltr' },
      { name: 'Box', abbreviation: 'box' }, { name: 'Bag', abbreviation: 'bag' },
      { name: 'Roll', abbreviation: 'roll' }, { name: 'Sheet', abbreviation: 'sht' },
      { name: 'Gallon', abbreviation: 'gal' }, { name: 'Foot', abbreviation: 'ft' },
    ]
    for (const u of uoms) { if (!await UOM.findOne({ abbreviation: u.abbreviation })) await UOM.create({ ...u, createdBy: uid, updatedBy: uid }) }
    console.log('✅ 10 UOMs')

    // ── Vendors ──
    const vendorData = [
      { name: 'Manila Steel Corp', contactPerson: 'Juan Dela Cruz', phone: '09171234567', address: 'Quezon City', termsOfPayment: '30 days' },
      { name: 'Eagle Cement Inc', contactPerson: 'Maria Santos', phone: '09181234567', address: 'Bulacan', termsOfPayment: 'COD' },
      { name: 'Davao Lumber Supply', contactPerson: 'Pedro Reyes', phone: '09191234567', address: 'Davao City', termsOfPayment: '15 days' },
      { name: 'National Paint Co', contactPerson: 'Ana Garcia', phone: '09201234567', address: 'Makati City', termsOfPayment: '30 days' },
      { name: 'Pacific Plumbing Supply', contactPerson: 'Jose Ramos', phone: '09211234567', address: 'Pasig City', termsOfPayment: 'COD' },
    ]
    const vendors: any[] = []
    for (const v of vendorData) {
      let vendor = await Vendor.findOne({ name: v.name })
      if (!vendor) vendor = await Vendor.create({ ...v, createdBy: uid, updatedBy: uid })
      vendors.push(vendor)
    }
    console.log('✅ 5 Vendors')

    // ── Customers ──
    const custData = [
      { name: 'ABC Construction Co.', officeAddress: '123 Rizal Ave, Manila', deliveryAddress: '456 Project Site, QC', phone: '09171111111', tin: '123-456-789-000', balance: 0 },
      { name: 'XYZ Builders Inc.', officeAddress: '789 Ayala Ave, Makati', deliveryAddress: '321 Build St, Taguig', phone: '09172222222', tin: '987-654-321-000', balance: 0 },
      { name: 'Metro Renovations', officeAddress: '555 Ortigas, Pasig', deliveryAddress: '777 Reno Rd, Mandaluyong', phone: '09173333333', tin: '456-789-123-000', balance: 0 },
      { name: 'Sunshine Homes Dev.', officeAddress: '100 Alabang, Muntinlupa', deliveryAddress: '200 Home St, Las Pinas', phone: '09174444444', tin: '321-654-987-000', balance: 0 },
      { name: 'Golden Gate Contractors', officeAddress: '888 EDSA, Caloocan', deliveryAddress: '999 Gate Rd, Valenzuela', phone: '09175555555', tin: '654-321-987-000', balance: 0 },
      { name: 'Engr. Roberto Cruz', officeAddress: 'Brgy. San Jose, Naga City', deliveryAddress: 'Same', phone: '09176666666', tin: '111-222-333-000', balance: 0 },
      { name: 'Dra. Liza Mendoza', officeAddress: '45 Magsaysay St, Legazpi', deliveryAddress: 'Same', phone: '09177777777', tin: '444-555-666-000', balance: 0 },
    ]
    const customers: any[] = []
    for (const c of custData) {
      let cust = await Customer.findOne({ name: c.name })
      if (!cust) cust = await Customer.create({ ...c, createdBy: uid, updatedBy: uid })
      customers.push(cust)
    }
    console.log('✅ 7 Customers')

    // ── Products ──
    const prodData = [
      { code: 'CEM-001', description: 'Portland Cement 40kg (Eagle)', uom: 'bag', availableStock: 500, lastCost: 220, averageCost: 218, sellingPrice: 280, markupType: 'percentage', markupPercentage: 28 },
      { code: 'CEM-002', description: 'Portland Cement 40kg (Republic)', uom: 'bag', availableStock: 300, lastCost: 215, averageCost: 212, sellingPrice: 272, markupType: 'percentage', markupPercentage: 28 },
      { code: 'STL-001', description: 'Deformed Bar 10mm x 6m', uom: 'pcs', availableStock: 200, lastCost: 145, averageCost: 142, sellingPrice: 185, markupType: 'percentage', markupPercentage: 30 },
      { code: 'STL-002', description: 'Deformed Bar 12mm x 6m', uom: 'pcs', availableStock: 150, lastCost: 210, averageCost: 205, sellingPrice: 267, markupType: 'percentage', markupPercentage: 30 },
      { code: 'STL-003', description: 'Deformed Bar 16mm x 6m', uom: 'pcs', availableStock: 100, lastCost: 380, averageCost: 375, sellingPrice: 488, markupType: 'percentage', markupPercentage: 30 },
      { code: 'PLY-001', description: 'Marine Plywood 1/2"', uom: 'sht', availableStock: 80, lastCost: 580, averageCost: 575, sellingPrice: 748, markupType: 'percentage', markupPercentage: 30 },
      { code: 'PLY-002', description: 'Ordinary Plywood 1/4"', uom: 'sht', availableStock: 100, lastCost: 320, averageCost: 315, sellingPrice: 419, markupType: 'percentage', markupPercentage: 33 },
      { code: 'PNT-001', description: 'Latex Paint White 4L (Boysen)', uom: 'gal', availableStock: 60, lastCost: 450, averageCost: 445, sellingPrice: 579, markupType: 'percentage', markupPercentage: 30 },
      { code: 'PNT-002', description: 'Enamel Paint Black 1L', uom: 'ltr', availableStock: 40, lastCost: 180, averageCost: 175, sellingPrice: 228, markupType: 'percentage', markupPercentage: 30 },
      { code: 'PIP-001', description: 'PVC Pipe 1/2" x 10ft (Neltex)', uom: 'pcs', availableStock: 300, lastCost: 45, averageCost: 43, sellingPrice: 58, markupType: 'percentage', markupPercentage: 35 },
      { code: 'PIP-002', description: 'PVC Pipe 3/4" x 10ft', uom: 'pcs', availableStock: 250, lastCost: 65, averageCost: 63, sellingPrice: 85, markupType: 'percentage', markupPercentage: 35 },
      { code: 'PIP-003', description: 'PVC Elbow 1/2"', uom: 'pcs', availableStock: 500, lastCost: 8, averageCost: 7, sellingPrice: 12, markupType: 'percentage', markupPercentage: 70 },
      { code: 'NL-001', description: 'Common Nails 2" (1kg)', uom: 'kg', availableStock: 100, lastCost: 55, averageCost: 53, sellingPrice: 72, markupType: 'percentage', markupPercentage: 35 },
      { code: 'NL-002', description: 'Common Nails 3" (1kg)', uom: 'kg', availableStock: 80, lastCost: 58, averageCost: 56, sellingPrice: 76, markupType: 'percentage', markupPercentage: 35 },
      { code: 'NL-003', description: 'Concrete Nails 2" (1kg)', uom: 'kg', availableStock: 50, lastCost: 75, averageCost: 72, sellingPrice: 100, markupType: 'percentage', markupPercentage: 38 },
      { code: 'GI-001', description: 'GI Wire #16 (1kg)', uom: 'kg', availableStock: 50, lastCost: 70, averageCost: 68, sellingPrice: 90, markupType: 'percentage', markupPercentage: 32 },
      { code: 'SND-001', description: 'Washed Sand (1 bag)', uom: 'bag', availableStock: 200, lastCost: 35, averageCost: 33, sellingPrice: 50, markupType: 'percentage', markupPercentage: 50 },
      { code: 'GRV-001', description: 'Gravel 3/4" (1 bag)', uom: 'bag', availableStock: 180, lastCost: 40, averageCost: 38, sellingPrice: 55, markupType: 'percentage', markupPercentage: 45 },
      { code: 'HLB-001', description: 'Hollow Blocks 4"', uom: 'pcs', availableStock: 2000, lastCost: 8, averageCost: 7.5, sellingPrice: 12, markupType: 'percentage', markupPercentage: 60 },
      { code: 'HLB-002', description: 'Hollow Blocks 6"', uom: 'pcs', availableStock: 1500, lastCost: 12, averageCost: 11, sellingPrice: 18, markupType: 'percentage', markupPercentage: 60 },
      { code: 'ROF-001', description: 'Corrugated GI Sheet 8ft', uom: 'sht', availableStock: 120, lastCost: 280, averageCost: 275, sellingPrice: 358, markupType: 'percentage', markupPercentage: 30 },
      { code: 'ROF-002', description: 'Corrugated GI Sheet 10ft', uom: 'sht', availableStock: 80, lastCost: 350, averageCost: 345, sellingPrice: 449, markupType: 'percentage', markupPercentage: 30 },
      { code: 'ELC-001', description: 'THHN Wire #12 (per meter)', uom: 'm', availableStock: 500, lastCost: 18, averageCost: 17, sellingPrice: 25, markupType: 'percentage', markupPercentage: 45 },
      { code: 'ELC-002', description: 'Electrical Tape (Big)', uom: 'pcs', availableStock: 200, lastCost: 15, averageCost: 14, sellingPrice: 22, markupType: 'percentage', markupPercentage: 55 },
      { code: 'ELC-003', description: 'Outlet Duplex', uom: 'pcs', availableStock: 100, lastCost: 35, averageCost: 33, sellingPrice: 55, markupType: 'percentage', markupPercentage: 65 },
      { code: 'TLS-001', description: 'Floor Tiles 30x30cm (Mariwasa)', uom: 'pcs', availableStock: 400, lastCost: 18, averageCost: 17, sellingPrice: 28, markupType: 'percentage', markupPercentage: 60 },
      { code: 'TLS-002', description: 'Wall Tiles 20x30cm', uom: 'pcs', availableStock: 350, lastCost: 15, averageCost: 14, sellingPrice: 24, markupType: 'percentage', markupPercentage: 70 },
      { code: 'TLS-003', description: 'Tile Adhesive 25kg', uom: 'bag', availableStock: 40, lastCost: 280, averageCost: 275, sellingPrice: 370, markupType: 'percentage', markupPercentage: 35 },
      { code: 'WTR-001', description: 'Water Hose 1/2" (per meter)', uom: 'm', availableStock: 200, lastCost: 22, averageCost: 20, sellingPrice: 30, markupType: 'percentage', markupPercentage: 50 },
      { code: 'TLS-004', description: 'Tile Grout White 1kg', uom: 'kg', availableStock: 30, lastCost: 45, averageCost: 42, sellingPrice: 65, markupType: 'percentage', markupPercentage: 55 },
    ]
    const products: any[] = []
    for (const p of prodData) {
      let prod = await Product.findOne({ code: p.code })
      if (!prod) prod = await Product.create({ ...p, createdBy: uid, updatedBy: uid })
      products.push(prod)
    }
    console.log('✅ 30 Products')

    // ── Sales + Payments (last 7 days) ──
    const today = new Date()
    const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d }
    const existingSales = await Sale.countDocuments({ isDeleted: false })
    if (existingSales < 5) {
      console.log('Creating sales transactions...')
      let drNum = 1
      const salesData = [
        // Day 1 (6 days ago) - 3 sales
        { date: daysAgo(6), cust: 0, items: [{ pi: 0, qty: 50, price: 280 }, { pi: 16, qty: 20, price: 50 }], paid: true, method: 'CASH' },
        { date: daysAgo(6), cust: 1, items: [{ pi: 2, qty: 30, price: 185 }, { pi: 3, qty: 20, price: 267 }], paid: true, method: 'CHECK', channel: 'BDO' },
        { date: daysAgo(6), cust: 2, items: [{ pi: 18, qty: 200, price: 12 }, { pi: 16, qty: 30, price: 50 }], paid: false },
        // Day 2 (5 days ago)
        { date: daysAgo(5), cust: 3, items: [{ pi: 5, qty: 10, price: 748 }, { pi: 6, qty: 15, price: 419 }], paid: true, method: 'CASH' },
        { date: daysAgo(5), cust: 4, items: [{ pi: 20, qty: 20, price: 358 }, { pi: 12, qty: 5, price: 72 }], paid: true, method: 'ONLINE', channel: 'GCash' },
        // Day 3 (4 days ago)
        { date: daysAgo(4), cust: 0, items: [{ pi: 0, qty: 100, price: 280 }, { pi: 17, qty: 50, price: 55 }, { pi: 15, qty: 10, price: 90 }], paid: true, method: 'CHECK', channel: 'BPI' },
        { date: daysAgo(4), cust: 5, items: [{ pi: 7, qty: 5, price: 579 }, { pi: 8, qty: 3, price: 228 }], paid: false },
        // Day 4 (3 days ago)
        { date: daysAgo(3), cust: 1, items: [{ pi: 4, qty: 15, price: 488 }, { pi: 2, qty: 25, price: 185 }], paid: true, method: 'CASH' },
        { date: daysAgo(3), cust: 6, items: [{ pi: 25, qty: 50, price: 28 }, { pi: 26, qty: 30, price: 24 }, { pi: 27, qty: 5, price: 370 }], paid: true, method: 'ONLINE', channel: 'BPI Online' },
        // Day 5 (2 days ago)
        { date: daysAgo(2), cust: 2, items: [{ pi: 9, qty: 50, price: 58 }, { pi: 10, qty: 30, price: 85 }, { pi: 11, qty: 100, price: 12 }], paid: true, method: 'CASH' },
        { date: daysAgo(2), cust: 3, items: [{ pi: 22, qty: 100, price: 25 }, { pi: 23, qty: 20, price: 22 }, { pi: 24, qty: 10, price: 55 }], paid: false },
        // Day 6 (yesterday)
        { date: daysAgo(1), cust: 4, items: [{ pi: 0, qty: 80, price: 280 }, { pi: 1, qty: 50, price: 272 }], paid: true, method: 'CASH' },
        { date: daysAgo(1), cust: 0, items: [{ pi: 20, qty: 15, price: 358 }, { pi: 21, qty: 10, price: 449 }], paid: true, method: 'CHECK', channel: 'Metrobank' },
        { date: daysAgo(1), cust: 5, items: [{ pi: 18, qty: 500, price: 12 }, { pi: 19, qty: 300, price: 18 }], paid: false },
        // Today
        { date: today, cust: 1, items: [{ pi: 0, qty: 30, price: 280 }, { pi: 16, qty: 15, price: 50 }, { pi: 12, qty: 3, price: 72 }], paid: true, method: 'CASH' },
        { date: today, cust: 6, items: [{ pi: 7, qty: 3, price: 579 }, { pi: 25, qty: 20, price: 28 }], paid: true, method: 'ONLINE', channel: 'GCash' },
      ]

      for (const sd of salesData) {
        const lineItems = sd.items.map(it => ({
          productId: products[it.pi]._id,
          description: products[it.pi].description,
          quantity: it.qty,
          sellingPrice: it.price,
          lineTotal: it.qty * it.price
        }))
        const totalAmount = lineItems.reduce((s, li) => s + li.lineTotal, 0)
        const sale = await Sale.create({
          drNumber: `DR-2026-${String(drNum++).padStart(4, '0')}`,
          saleDate: sd.date, customerId: customers[sd.cust]._id,
          customerName: customers[sd.cust].name,
          officeAddress: customers[sd.cust].officeAddress,
          deliveryAddress: customers[sd.cust].deliveryAddress,
          tin: customers[sd.cust].tin,
          lineItems, totalAmount, status: 'COMPLETED',
          postedAt: sd.date, postedBy: uid, createdBy: uid, updatedBy: uid
        })
        if (sd.paid) {
          const channels: any[] = []
          let cashPay = 0
          if (sd.method === 'CASH') { cashPay = totalAmount }
          else if (sd.method === 'CHECK') { channels.push({ channel: sd.channel || 'BDO', amount: totalAmount }) }
          else if (sd.method === 'ONLINE') { channels.push({ channel: sd.channel || 'GCash', amount: totalAmount }) }
          await createPayment({
            saleId: sale._id,
            customerId: customers[sd.cust]._id,
            paymentDate: sd.date,
            amountDue: totalAmount,
            cashPayment: cashPay,
            paymentChannels: channels
          }, String(uid))
        }
      }
      console.log('✅ 16 Sales (12 paid, 4 unpaid)')
    }

    // ── Purchase Orders ──
    const existingPOs = await PurchaseOrder.countDocuments({ isDeleted: false })
    if (existingPOs < 3) {
      console.log('Creating purchase orders...')
      if (!await PurchaseOrder.findOne({ poNumber: 'PO-2026-0001' })) {
        await PurchaseOrder.create({
          poNumber: 'PO-2026-0001', poDate: daysAgo(10), vendorId: vendors[1]._id,
          status: 'COMPLETED', lineItems: [
            { productId: products[0]._id, description: products[0].description, quantity: 200, uomCode: 'bag', uomValue: 'bag', unitCost: 220, supplierDiscount: 0, lineTotal: 44000 },
            { productId: products[1]._id, description: products[1].description, quantity: 100, uomCode: 'bag', uomValue: 'bag', unitCost: 215, supplierDiscount: 0, lineTotal: 21500 },
          ], totalAmount: 65500, createdBy: uid, updatedBy: uid
        })
      }
      if (!await PurchaseOrder.findOne({ poNumber: 'PO-2026-0002' })) {
        await PurchaseOrder.create({
          poNumber: 'PO-2026-0002', poDate: daysAgo(7), vendorId: vendors[0]._id,
          status: 'COMPLETED', lineItems: [
            { productId: products[2]._id, description: products[2].description, quantity: 100, uomCode: 'pcs', uomValue: 'pcs', unitCost: 145, supplierDiscount: 0, lineTotal: 14500 },
            { productId: products[3]._id, description: products[3].description, quantity: 80, uomCode: 'pcs', uomValue: 'pcs', unitCost: 210, supplierDiscount: 0, lineTotal: 16800 },
            { productId: products[4]._id, description: products[4].description, quantity: 50, uomCode: 'pcs', uomValue: 'pcs', unitCost: 380, supplierDiscount: 0, lineTotal: 19000 },
          ], totalAmount: 50300, createdBy: uid, updatedBy: uid
        })
      }
      if (!await PurchaseOrder.findOne({ poNumber: 'PO-2026-0003' })) {
        await PurchaseOrder.create({
          poNumber: 'PO-2026-0003', poDate: daysAgo(3), vendorId: vendors[2]._id,
          status: 'SUBMITTED', lineItems: [
            { productId: products[5]._id, description: products[5].description, quantity: 50, uomCode: 'sht', uomValue: 'sht', unitCost: 580, supplierDiscount: 0, lineTotal: 29000 },
            { productId: products[6]._id, description: products[6].description, quantity: 60, uomCode: 'sht', uomValue: 'sht', unitCost: 320, supplierDiscount: 0, lineTotal: 19200 },
          ], totalAmount: 48200, createdBy: uid, updatedBy: uid
        })
      }
      console.log('✅ 3 Purchase Orders')
    }

    // ── Delivery Receipts ──
    const existingDRs = await DeliveryReceipt.countDocuments({ isDeleted: false })
    if (existingDRs < 2) {
      console.log('Creating delivery receipts...')
      if (!await DeliveryReceipt.findOne({ drNumber: 'DLV-2026-0001' })) {
        await DeliveryReceipt.create({
          drNumber: 'DLV-2026-0001', deliveryDate: daysAgo(8), vendorId: vendors[1]._id, vendorName: vendors[1].name,
          status: 'POSTED', postedAt: daysAgo(8), postedBy: uid,
          lineItems: [
            { productId: products[0]._id, description: products[0].description, quantityOrdered: 200, quantityReceived: 200, unitCost: 220 },
            { productId: products[1]._id, description: products[1].description, quantityOrdered: 100, quantityReceived: 100, unitCost: 215 },
          ], createdBy: uid
        })
      }
      if (!await DeliveryReceipt.findOne({ drNumber: 'DLV-2026-0002' })) {
        await DeliveryReceipt.create({
          drNumber: 'DLV-2026-0002', deliveryDate: daysAgo(5), vendorId: vendors[0]._id, vendorName: vendors[0].name,
          status: 'POSTED', postedAt: daysAgo(5), postedBy: uid,
          lineItems: [
            { productId: products[2]._id, description: products[2].description, quantityOrdered: 100, quantityReceived: 100, unitCost: 145 },
            { productId: products[3]._id, description: products[3].description, quantityOrdered: 80, quantityReceived: 80, unitCost: 210 },
          ], createdBy: uid
        })
      }
      console.log('✅ 2 Delivery Receipts (posted)')
    }

    // ── Expenses ──
    const existingExp = await Expense.countDocuments({ isDeleted: false })
    if (existingExp < 3) {
      console.log('Creating expenses...')
      const expenses = [
        { expenseDate: daysAgo(6), description: 'Gasoline for delivery truck', amount: 1500, category: 'Transportation', isPettyCash: false, paymentStatus: 'PAID', paidFrom: 'CASH', createdBy: uid },
        { expenseDate: daysAgo(5), description: 'Office supplies (bond paper, ink)', amount: 850, category: 'Office Supplies', isPettyCash: true, paymentStatus: 'PAID', paidFrom: 'CASH', createdBy: uid },
        { expenseDate: daysAgo(4), description: 'Electric bill - March 2026', amount: 3200, category: 'Utilities', isPettyCash: false, paymentStatus: 'PAID', paidFrom: 'CASH', createdBy: uid },
        { expenseDate: daysAgo(3), description: 'Water bill - March 2026', amount: 450, category: 'Utilities', isPettyCash: false, paymentStatus: 'PAID', paidFrom: 'CASH', createdBy: uid },
        { expenseDate: daysAgo(2), description: 'Lunch for staff (5 pax)', amount: 750, category: 'Food', isPettyCash: true, paymentStatus: 'PAID', paidFrom: 'CASH', createdBy: uid },
        { expenseDate: daysAgo(1), description: 'Forklift maintenance', amount: 2500, category: 'Maintenance', isPettyCash: false, paymentStatus: 'PAID', paidFrom: 'CASH', createdBy: uid },
        { expenseDate: today, description: 'Cleaning supplies', amount: 320, category: 'Office Supplies', isPettyCash: true, paymentStatus: 'PAID', paidFrom: 'CASH', createdBy: uid },
        { expenseDate: today, description: 'Delivery rider allowance', amount: 500, category: 'Transportation', isPettyCash: true, paymentStatus: 'PAID', paidFrom: 'CASH', createdBy: uid },
      ]
      for (const e of expenses) await Expense.create(e)
      console.log('✅ 8 Expenses')
    }

    // ── Asset Accounts ──
    for (const acct of ['CASH', 'CHECK', 'GCASH', 'BANK']) {
      if (!await AssetAccount.findOne({ accountType: acct })) {
        await AssetAccount.create({ accountType: acct, balance: 0, transactions: [] })
      }
    }
    console.log('✅ Asset Accounts initialized')

    console.log('\n🎉 Seed complete! Ready for presentation.')
    console.log('   Login: admin / admin123')
    console.log('   Login: cashier1 / cashier123')
    console.log('   Login: manager1 / manager123\n')
    await disconnectDatabase()
    process.exit(0)
  } catch (error) {
    console.error('❌ Seed failed:', error)
    await disconnectDatabase()
    process.exit(1)
  }
}

seed()
