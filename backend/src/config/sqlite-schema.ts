/**
 * SQLite Schema - Creates all tables matching the MongoDB collections
 * Run once on app startup to initialize the database
 */

import { getDB } from './sqlite-adapter.js';

export function createTables() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      _id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      fullName TEXT DEFAULT '',
      role TEXT DEFAULT 'cashier',
      isActive INTEGER DEFAULT 1,
      lastLogin TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      _id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      description TEXT NOT NULL,
      availableStock REAL DEFAULT 0,
      minStock REAL DEFAULT 0,
      lastCost REAL DEFAULT 0,
      averageCost REAL DEFAULT 0,
      lastDiscounts TEXT,
      sellingPrice REAL DEFAULT 0,
      markupPercentage REAL DEFAULT 0,
      markupType TEXT DEFAULT 'percentage',
      fixedMarkupAmount REAL DEFAULT 0,
      uom TEXT DEFAULT '',
      uomId TEXT,
      sellingUoms TEXT DEFAULT '[]',
      vendorCosts TEXT DEFAULT '[]',
      vomData TEXT DEFAULT '[]',
      createdAt TEXT DEFAULT (datetime('now')),
      createdBy TEXT,
      updatedAt TEXT DEFAULT (datetime('now')),
      updatedBy TEXT,
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS customers (
      _id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      officeAddress TEXT DEFAULT '',
      deliveryAddress TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      tin TEXT DEFAULT '',
      balance REAL DEFAULT 0,
      advanceBalance REAL DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      createdBy TEXT,
      updatedAt TEXT DEFAULT (datetime('now')),
      updatedBy TEXT,
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS vendors (
      _id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT DEFAULT '',
      termsOfPayment TEXT DEFAULT '',
      contactPerson TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      tin TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      createdBy TEXT,
      updatedAt TEXT DEFAULT (datetime('now')),
      updatedBy TEXT,
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS uoms (
      _id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      abbreviation TEXT UNIQUE NOT NULL,
      createdBy TEXT,
      updatedBy TEXT,
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      _id TEXT PRIMARY KEY,
      poNumber TEXT UNIQUE NOT NULL,
      poDate TEXT NOT NULL,
      vendorId TEXT,
      lineItems TEXT DEFAULT '[]',
      totalAmount REAL DEFAULT 0,
      status TEXT DEFAULT 'DRAFT',
      createdAt TEXT DEFAULT (datetime('now')),
      createdBy TEXT,
      updatedAt TEXT DEFAULT (datetime('now')),
      updatedBy TEXT,
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS delivery_receipts (
      _id TEXT PRIMARY KEY,
      drNumber TEXT UNIQUE NOT NULL,
      poId TEXT,
      vendorId TEXT,
      vendorName TEXT DEFAULT '',
      vendorAddress TEXT DEFAULT '',
      terms TEXT DEFAULT '',
      siNumber TEXT DEFAULT '',
      referenceNumber TEXT DEFAULT '',
      deliveryDate TEXT NOT NULL,
      barcode TEXT DEFAULT '',
      status TEXT DEFAULT 'PENDING',
      lineItems TEXT DEFAULT '[]',
      totalAmount REAL DEFAULT 0,
      amountPaid REAL DEFAULT 0,
      paymentStatus TEXT DEFAULT 'UNPAID',
      paymentHistory TEXT DEFAULT '[]',
      postedAt TEXT,
      postedBy TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      createdBy TEXT,
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      _id TEXT PRIMARY KEY,
      drNumber TEXT UNIQUE NOT NULL,
      documentType TEXT DEFAULT 'DR',
      saleDate TEXT NOT NULL,
      customerId TEXT,
      customerName TEXT DEFAULT 'Walk-in',
      officeAddress TEXT DEFAULT '',
      deliveryAddress TEXT DEFAULT '',
      tin TEXT DEFAULT '',
      lineItems TEXT DEFAULT '[]',
      totalAmount REAL DEFAULT 0,
      deliveryFee REAL DEFAULT 0,
      tollFee REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'DRAFT',
      postedAt TEXT,
      postedBy TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      createdBy TEXT,
      updatedAt TEXT DEFAULT (datetime('now')),
      updatedBy TEXT,
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      _id TEXT PRIMARY KEY,
      saleId TEXT NOT NULL,
      customerId TEXT,
      paymentDate TEXT NOT NULL,
      referenceNumber TEXT DEFAULT '',
      siNumber TEXT DEFAULT '',
      amountDue REAL DEFAULT 0,
      cashPayment REAL DEFAULT 0,
      chargePayment REAL DEFAULT 0,
      paymentChannels TEXT DEFAULT '[]',
      totalPaid REAL DEFAULT 0,
      unpaidAmount REAL DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      createdBy TEXT,
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS expenses (
      _id TEXT PRIMARY KEY,
      expenseDate TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL DEFAULT 0,
      category TEXT DEFAULT '',
      isPettyCash INTEGER DEFAULT 0,
      paymentStatus TEXT DEFAULT 'PAID',
      paidFrom TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      createdBy TEXT,
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS asset_accounts (
      _id TEXT PRIMARY KEY,
      accountType TEXT UNIQUE NOT NULL,
      balance REAL DEFAULT 0,
      transactions TEXT DEFAULT '[]',
      updatedAt TEXT DEFAULT (datetime('now')),
      syncVersion INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS check_records (
      _id TEXT PRIMARY KEY,
      paymentId TEXT NOT NULL,
      customerName TEXT NOT NULL,
      amount REAL NOT NULL,
      referenceNumber TEXT DEFAULT '',
      accountName TEXT DEFAULT '',
      effectiveDate TEXT,
      receivedDate TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      bankAccount TEXT,
      approvedDate TEXT,
      approvedBy TEXT,
      bouncedDate TEXT,
      bouncedBy TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      _id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      collectionName TEXT,
      recordId TEXT,
      recordData TEXT DEFAULT '{}',
      userId TEXT,
      username TEXT DEFAULT '',
      ipAddress TEXT DEFAULT '',
      details TEXT DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saved_states (
      _id TEXT PRIMARY KEY,
      collectionName TEXT NOT NULL,
      recordId TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      savedBy TEXT,
      savedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_configurations (
      _id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT DEFAULT '',
      updatedAt TEXT DEFAULT (datetime('now')),
      updatedBy TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_cash_drawers (
      _id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT DEFAULT 'REMITTANCE',
      cashierId TEXT,
      cashierName TEXT DEFAULT '',
      customerId TEXT,
      customerName TEXT DEFAULT '',
      openingBalance REAL DEFAULT 0,
      cashSales REAL DEFAULT 0,
      checkPayments REAL DEFAULT 0,
      onlinePayments REAL DEFAULT 0,
      totalSales REAL DEFAULT 0,
      expenses REAL DEFAULT 0,
      closingBalance REAL DEFAULT 0,
      remittedAmount REAL DEFAULT 0,
      carryOver REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      closedAt TEXT,
      closedBy TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      syncVersion INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
    CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_deleted ON customers(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_sales_dr ON sales(drNumber);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customerId);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(saleDate);
    CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
    CREATE INDEX IF NOT EXISTS idx_sales_deleted ON sales(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(saleId);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customerId);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paymentDate);
    CREATE INDEX IF NOT EXISTS idx_payments_deleted ON payments(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expenseDate);
    CREATE INDEX IF NOT EXISTS idx_expenses_deleted ON expenses(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_check_records_status ON check_records(status);
    CREATE INDEX IF NOT EXISTS idx_check_records_payment ON check_records(paymentId);
    CREATE INDEX IF NOT EXISTS idx_check_records_deleted ON check_records(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_delivery_receipts_dr ON delivery_receipts(drNumber);
    CREATE INDEX IF NOT EXISTS idx_delivery_receipts_deleted ON delivery_receipts(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_po ON purchase_orders(poNumber);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_deleted ON purchase_orders(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_vendors_deleted ON vendors(isDeleted);
  `);

  console.log('SQLite tables and indexes created');
}
