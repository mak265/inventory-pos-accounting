import Dexie, { type EntityTable } from 'dexie';

// Define interfaces for all collections
export interface UOM {
  _id?: string;
  name: string;
  abbreviation: string;
  createdBy?: string;
  updatedBy?: string;
  syncVersion?: number;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SellingUom {
  uomId: string;
  uomAbbreviation: string;
  conversionFactor: number;
  sellingPrice: number;
}

export interface VendorCost {
  vendorId: string;
  vendorName: string;
  unitCost: number;
  lastPurchaseQty?: number;
  lastUpdated: string;
  isPreferred: boolean;
  notes?: string;
}

export interface Product {
  _id?: string;
  code: string;
  description: string;
  availableStock: number;
  lastCost?: number;
  averageCost?: number;
  sellingPrice?: number;
  markupPercentage?: number;
  markupType?: 'percentage' | 'fixed';
  fixedMarkupAmount?: number;
  uom: string;
  uomId?: string;
  sellingUoms?: SellingUom[];
  vendorCosts?: VendorCost[];
  vomData?: Array<{
    date: Date;
    quantityIn: number;
    quantityOut: number;
    balance: number;
    reason?: string;
    adjustedBy?: string;
    referenceType?: string;
    referenceId?: string;
  }>;
  createdAt?: Date;
  createdBy?: string;
  updatedAt?: Date;
  updatedBy?: string;
  syncVersion?: number;
  isDeleted?: boolean;
}

export interface Vendor {
  _id?: string;
  name: string;
  address?: string;
  termsOfPayment?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  createdAt?: Date;
  createdBy?: string;
  updatedAt?: Date;
  updatedBy?: string;
  syncVersion?: number;
  isDeleted?: boolean;
}

export interface PurchaseOrder {
  _id?: string;
  poNumber: string;
  poDate: Date;
  vendorId: string;
  lineItems: Array<{
    productId?: string;
    description: string;
    quantity: number;
    uomCode: string;
    uomValue: string;
    unitCost: number;
    supplierDiscount: number;
    lineTotal: number;
  }>;
  totalAmount: number;
  status: 'DRAFT' | 'SUBMITTED' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';
  createdAt?: Date;
  createdBy?: string;
  updatedAt?: Date;
  updatedBy?: string;
  syncVersion?: number;
  isDeleted?: boolean;
}

export interface DeliveryReceipt {
  _id?: string;
  drNumber: string;
  poId?: string;
  vendorId: string;
  vendorName: string;
  vendorAddress?: string;
  terms?: string;
  referenceNumber?: string;
  deliveryDate: Date;
  barcode?: string;
  status: 'PENDING' | 'POSTED';
  lineItems: Array<{
    productId?: string;
    description: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number;
  }>;
  postedAt?: Date;
  postedBy?: string;
  createdAt?: Date;
  createdBy?: string;
  syncVersion?: number;
  isDeleted?: boolean;
}

export interface Customer {
  _id?: string;
  name: string;
  officeAddress?: string;
  deliveryAddress?: string;
  phone?: string;
  tin?: string;
  balance: number;
  createdAt?: Date;
  createdBy?: string;
  updatedAt?: Date;
  updatedBy?: string;
  syncVersion?: number;
  isDeleted?: boolean;
}

export interface Sale {
  _id?: string;
  drNumber: string;
  saleDate: Date;
  customerId: string;
  customerName: string;
  officeAddress?: string;
  deliveryAddress?: string;
  tin?: string;
  lineItems: Array<{
    productId?: string;
    description: string;
    quantity: number;
    sellingPrice: number;
    lineTotal: number;
  }>;
  totalAmount: number;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  postedAt?: Date;
  postedBy?: string;
  createdAt?: Date;
  createdBy?: string;
  syncVersion?: number;
  isDeleted?: boolean;
}

export interface Payment {
  _id?: string;
  saleId: string;
  customerId: string;
  paymentDate: Date;
  referenceNumber?: string;
  amountDue: number;
  cashPayment: number;
  chargePayment: number;
  paymentChannels: Array<{
    channel: 'CASH' | 'GCASH' | 'BPI' | 'AUB' | 'BPI ONLINE' | 'AUB ONLINE' | 'MAYA' | 'CHECK' | 'OTHER_BANK';
    amount: number;
    referenceNumber?: string;
    accountName?: string;
    effectiveDate?: Date;
  }>;
  totalPaid: number;
  unpaidAmount: number;
  createdAt?: Date;
  createdBy?: string;
  syncVersion?: number;
  isDeleted?: boolean;
}

export interface Expense {
  _id?: string;
  expenseDate: Date;
  description: string;
  amount: number;
  category?: string;
  isPettyCash: boolean;
  paymentStatus: 'PAID' | 'UNPAID';
  paidFrom?: 'CASH' | 'GCASH LOUIE' | 'GCASH KATRINA' | 'GCASH ANICIA' | 'MAYA' | 'BPI ONLINE' | 'AUB ONLINE' | 'BPI' | 'AUB' | 'GCASH' | 'CHECK';
  createdAt?: Date;
  createdBy?: string;
  syncVersion?: number;
  isDeleted?: boolean;
}

export interface AssetAccount {
  _id?: string;
  accountType: 'BPI' | 'AUB' | 'GCASH' | 'CHECK' | 'CASH';
  balance: number;
  transactions: Array<{
    date: Date;
    type: 'CREDIT' | 'DEBIT';
    amount: number;
    description: string;
    referenceId?: string;
    referenceType?: string;
  }>;
  updatedAt?: Date;
  syncVersion?: number;
}

export interface CheckRecord {
  _id?: string;
  paymentId: string;
  customerName: string;
  amount: number;
  referenceNumber: string;
  accountName: string;
  effectiveDate?: string;
  receivedDate: string;
  status: 'PENDING' | 'CLEARED' | 'BOUNCED';
  bankAccount?: string;
  approvedDate?: string;
  approvedBy?: string;
  bouncedDate?: string;
  bouncedBy?: string;
  createdAt?: string;
  syncVersion?: number;
  isDeleted?: boolean;
}

export interface SyncQueueItem {
  id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  collection: string;
  data: any;
  timestamp: string;
  userId: string;
  status: 'PENDING' | 'SYNCING' | 'COMPLETED' | 'FAILED';
  retryCount: number;
  error?: string;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  operation: string;
  collection: string;
  recordId?: string;
  status: 'SUCCESS' | 'CONFLICT' | 'ERROR';
  conflictData?: any;
  errorMessage?: string;
}

/**
 * Dead letter queue — stores sync items that failed too many times.
 * These are never permanently deleted and can be reviewed/retried manually.
 */
export interface DeadLetterItem {
  id: string;
  originalId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  collection: string;
  data: any;
  timestamp: string;
  userId: string;
  retryCount: number;
  lastError?: string;
  movedAt: string;
}

// Define the database
class InventoryPOSDatabase extends Dexie {
  products!: EntityTable<Product, '_id'>;
  vendors!: EntityTable<Vendor, '_id'>;
  purchaseOrders!: EntityTable<PurchaseOrder, '_id'>;
  deliveries!: EntityTable<DeliveryReceipt, '_id'>;
  customers!: EntityTable<Customer, '_id'>;
  sales!: EntityTable<Sale, '_id'>;
  payments!: EntityTable<Payment, '_id'>;
  expenses!: EntityTable<Expense, '_id'>;
  assetAccounts!: EntityTable<AssetAccount, '_id'>;
  checkRecords!: EntityTable<CheckRecord, '_id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  syncLog!: EntityTable<SyncLog, 'id'>;
  uoms!: EntityTable<UOM, '_id'>;
  deadLetterQueue!: EntityTable<DeadLetterItem, 'id'>;

  constructor() {
    super('InventoryPOSDB');

    this.version(1).stores({
      products: '_id, code, description, availableStock',
      vendors: '_id, name',
      purchaseOrders: '_id, poNumber, vendorId, status, poDate',
      deliveries: '_id, drNumber, poId, vendorId, status, deliveryDate',
      customers: '_id, name, balance',
      sales: '_id, drNumber, customerId, status, saleDate',
      payments: '_id, saleId, customerId, paymentDate',
      expenses: '_id, expenseDate, category, isPettyCash',
      assetAccounts: '_id, accountType',
      syncQueue: 'id, status, timestamp, collection',
      syncLog: 'id, timestamp, collection, status'
    });

    this.version(2).stores({
      uoms: '_id, abbreviation, isDeleted'
    });

    this.version(3).stores({
      checkRecords: '_id, paymentId, status, receivedDate'
    });

    this.version(4).stores({
      deadLetterQueue: 'id, originalId, collection, movedAt'
    });
  }
}

// Create and export database instance
export const db = new InventoryPOSDatabase();

// Flag to track if IndexedDB is available
export let isDbAvailable = true;

// Patch db methods to be resilient — if any operation fails with DatabaseClosedError, 
// switch to no-op mode so the app continues working in online-only mode
const _originalOpen = db.open.bind(db);
(db as any)._safeOpen = async function() {
  try {
    const result = await _originalOpen();
    isDbAvailable = true;
    return result;
  } catch (error) {
    isDbAvailable = false;
    console.warn('IndexedDB not available — running in online-only mode');
    patchDbForOfflineMode();
    return db as any;
  }
};

function patchDbForOfflineMode() {
  const noopAsync = async (..._args: any[]) => undefined as any;
  const noopArrayAsync = async (..._args: any[]) => [] as any;
  const fakeWhere = () => ({ 
    equals: () => ({ sortBy: noopArrayAsync, toArray: noopArrayAsync, delete: noopAsync, count: async () => 0 }), 
    toArray: noopArrayAsync 
  });
  const tables = ['products', 'vendors', 'purchaseOrders', 'deliveries', 'customers', 
                  'sales', 'payments', 'expenses', 'assetAccounts', 'checkRecords',
                  'syncQueue', 'syncLog', 'uoms', 'deadLetterQueue'] as const;
  for (const tableName of tables) {
    const table = (db as any)[tableName];
    if (table) {
      table.put = noopAsync;
      table.add = noopAsync;
      table.get = noopAsync;
      table.delete = noopAsync;
      table.update = noopAsync;
      table.clear = noopAsync;
      table.toArray = noopArrayAsync;
      table.where = fakeWhere;
      table.toCollection = () => ({ toArray: noopArrayAsync });
      table.filter = () => ({ toArray: noopArrayAsync });
      table.count = async () => 0;
    }
  }
}

// Also handle the case where db opens fine initially but fails on operations later
// This catches the "DatabaseClosedError" that happens in Electron
db.on('blocked', () => { 
  isDbAvailable = false; 
  patchDbForOfflineMode(); 
});

// Initialize database
export async function initializeDatabase(): Promise<void> {
  try {
    await (db as any)._safeOpen();
  } catch (error) {
    isDbAvailable = false;
    console.warn('IndexedDB not available — running in online-only mode');
    patchDbForOfflineMode();
  }
}

// CRUD operations helper functions
export const dbOperations = {
  // Generic create operation
  async create<T>(collection: string, data: T): Promise<string> {
    const table = (db as any)[collection];
    if (!table) throw new Error(`Collection ${collection} not found`);
    return await table.add(data);
  },

  // Generic read operation
  async read<T>(collection: string, id: string): Promise<T | undefined> {
    const table = (db as any)[collection];
    if (!table) throw new Error(`Collection ${collection} not found`);
    return await table.get(id);
  },

  // Generic update operation
  async update<T>(collection: string, id: string, data: Partial<T>): Promise<number> {
    const table = (db as any)[collection];
    if (!table) throw new Error(`Collection ${collection} not found`);
    return await table.update(id, data);
  },

  // Generic delete operation
  async delete(collection: string, id: string): Promise<void> {
    const table = (db as any)[collection];
    if (!table) throw new Error(`Collection ${collection} not found`);
    await table.delete(id);
  },

  // Generic list operation
  async list<T>(collection: string): Promise<T[]> {
    const table = (db as any)[collection];
    if (!table) throw new Error(`Collection ${collection} not found`);
    return await table.toArray();
  },

  // Generic query operation
  async query<T>(collection: string, filter: (item: T) => boolean): Promise<T[]> {
    const table = (db as any)[collection];
    if (!table) throw new Error(`Collection ${collection} not found`);
    return await table.filter(filter).toArray();
  }
};
