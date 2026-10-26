import mongoose from 'mongoose';
import type { SyncOperation, SyncResult } from '../types/sync.js';

export const FULL_SYNC_ENTITIES: Array<{ key: string; model: string; table?: string }> = [
  { key: 'uoms', model: 'UOM' },
  { key: 'users', model: 'User' },
  { key: 'vendors', model: 'Vendor' },
  { key: 'customers', model: 'Customer' },
  { key: 'assetAccounts', model: 'AssetAccount', table: 'asset_accounts' },
  { key: 'products', model: 'Product' },
  { key: 'purchaseOrders', model: 'PurchaseOrder', table: 'purchase_orders' },
  { key: 'deliveryReceipts', model: 'DeliveryReceipt', table: 'delivery_receipts' },
  { key: 'sales', model: 'Sale' },
  { key: 'payments', model: 'Payment' },
  { key: 'checkRecords', model: 'CheckRecord', table: 'check_records' },
  { key: 'expenses', model: 'Expense' },
  { key: 'dailyCashDrawer', model: 'DailyCashDrawer', table: 'daily_cash_drawers' },
  { key: 'systemConfigurations', model: 'SystemConfiguration', table: 'system_configurations' },
];

export type FullSnapshot = {
  meta: { generatedAt: string; source: string };
  entities: Record<string, any[]>;
  counts: Record<string, number>;
};

export class SyncService {
  /**
   * Dump all entities into a portable snapshot — used for cloud -> local initial pull.
   * Returns all non-deleted rows; rows are plain objects (no mongoose methods).
   */
  async getFullSnapshot(): Promise<FullSnapshot> {
    const entities: Record<string, any[]> = {};
    const counts: Record<string, number> = {};
    for (const { key, model } of FULL_SYNC_ENTITIES) {
      try {
        const Model = mongoose.model(model);
        const rows = await Model.find({ isDeleted: { $ne: true } }).lean();
        entities[key] = rows;
        counts[key] = rows.length;
      } catch (err: any) {
        console.error(`[Sync-Full] Failed to snapshot ${key}/${model}:`, err?.message || err);
        entities[key] = [];
        counts[key] = 0;
      }
    }
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        source: process.env.DB_MODE || 'mongodb',
      },
      entities,
      counts,
    };
  }

  /**
   * Apply a full snapshot to the local DB.
   *
   * Has two implementations:
   *  - DB_MODE=sqlite: raw better-sqlite3 INSERT OR REPLACE by _id
   *      (respects syncVersion: skip incoming older rows than existing)
   *  - DB_MODE=mongodb (remote cloud server): mongoose upsert per row
   *
   * NEVER crashes the caller — per-entity errors are counted and logged only.
   */
  async applyFullSnapshot(snapshot: FullSnapshot): Promise<{ applied: Record<string, { upserted: number; skipped: number; errors: number }>; total: number }> {
    const applied: Record<string, { upserted: number; skipped: number; errors: number }> = {};
    let total = 0;
    const mode = (process.env.DB_MODE || 'mongodb') as 'mongodb' | 'sqlite';

    if (mode === 'sqlite') {
      // ========== SQLITE FAST PATH ==========
      const { getDB } = await import('../config/sqlite-adapter.js');
      const db = getDB();

      const sqlTypeMap: Record<string, string[]> = {
        string: ['code', 'description', 'name', 'officeAddress', 'deliveryAddress', 'phone', 'tin',
                 'address', 'termsOfPayment', 'contactPerson', 'email', 'abbreviation',
                 'poNumber', 'poDate', 'vendorId', 'totalAmount', 'status',
                 'drNumber', 'poId', 'vendorName', 'vendorAddress', 'terms', 'siNumber', 'referenceNumber',
                 'deliveryDate', 'barcode', 'amountPaid', 'paymentStatus', 'postedAt', 'postedBy',
                 'documentType', 'saleDate', 'customerId', 'customerName',
                 'notes', 'paymentDate', 'dueDate', 'referenceNumber', 'amountDue', 'cashPayment',
                 'chargePayment', 'totalPaid', 'unpaidAmount',
                 'expenseDate', 'description', 'category', 'paidFrom', 'paymentStatus',
                 'accountType', 'bankName', 'bankAccount', 'balance',
                 'paymentId', 'customerName', 'accountName', 'effectiveDate', 'receivedDate',
                 'approvedDate', 'approvedBy', 'bouncedDate', 'bouncedBy',
                 'action', 'collectionName', 'recordId', 'userId', 'username', 'ipAddress', 'details', 'timestamp',
                 'savedBy', 'savedAt', 'key', 'value',
                 'date', 'type', 'cashierId', 'cashierName', 'openingBalance', 'closingBalance',
                 'remittedAmount', 'carryOver', 'closedAt', 'closedBy',
                 'lastLogin', 'passwordHash', 'fullName', 'role',
                 'uom', 'uomId', 'markupType',
                 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'syncVersion',
                 'isActive', 'isDeleted', 'isPettyCash', '_id'],
      };
      const numericCols = new Set([
        'availableStock','minStock','lastCost','averageCost','sellingPrice','markupPercentage',
        'fixedMarkupAmount','conversionFactor','unitCost','grossCost',
        'discount1','discount2','discount3','discount4',
        'netCost','lastPurchaseQty','quantityIn','quantityOut','balance',
        'balance','advanceBalance','totalAmount','deliveryFee','tollFee',
        'amountDue','cashPayment','chargePayment','totalPaid','unpaidAmount',
        'amount','openingBalance','cashSales','checkPayments','onlinePayments',
        'totalSales','expenses','closingBalance','remittedAmount','carryOver','overShort',
        'isActive','isDeleted','isPettyCash','syncVersion'
      ]);
      const integerCols = new Set([
        'isActive','isDeleted','isPettyCash','syncVersion'
      ]);

      function serializeCell(raw: any): any {
        if (raw === null || raw === undefined) return null;
        if (raw instanceof Date) return raw.toISOString();
        if (typeof raw === 'boolean') return raw ? 1 : 0;
        if (typeof raw === 'number' || typeof raw === 'bigint' || typeof raw === 'string') return raw;
        return JSON.stringify(raw);
      }

      for (const { key, model, table } of FULL_SYNC_ENTITIES) {
        applied[key] = { upserted: 0, skipped: 0, errors: 0 };
        const rows = snapshot.entities?.[key] || [];
        if (!rows.length) continue;

        const tableName = table || ((model.toLowerCase() || 'x') + 's');

        // Read table schema once to know valid columns
        let tableInfo: Array<{ name: string; type: string }> = [];
        try {
          tableInfo = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any;
        } catch (e: any) {
          applied[key].errors = rows.length;
          console.warn(`[Sync-Apply] pragma failed for ${tableName}:`, e?.message);
          continue;
        }
        if (!tableInfo.length) continue;
        const validCols = new Set(tableInfo.map(c => c.name));

        // Existing syncVersion lookup (by _id)
        let existingVersions: Record<string, number> = {};
        try {
          if (validCols.has('syncVersion') && validCols.has('_id')) {
            const ids = rows.map(r => r?._id).filter(Boolean);
            if (ids.length) {
              const placeholders = ids.map(() => '?').join(',');
              const stmt = db.prepare(`SELECT _id, syncVersion FROM "${tableName}" WHERE _id IN (${placeholders})`);
              const res = stmt.all(...ids) as any[];
              for (const r of res) existingVersions[r._id] = Number(r.syncVersion) || 0;
            }
          }
        } catch { /* ignore */ }

        const columns = tableInfo.map(c => c.name);
        const placeholders = columns.map(() => '?').join(',');
        const updatePart = columns
          .filter(c => c !== '_id')
          .map(c => `"${c}"=excluded."${c}"`)
          .join(',');
        const sql = `INSERT INTO "${tableName}" ("${columns.join('","')}") VALUES (${placeholders})
                     ON CONFLICT(_id) DO UPDATE SET ${updatePart}`;

        const txInsert = db.transaction((batch: any[]) => {
          const stmt = db.prepare(sql);
          for (const values of batch) stmt.run(...values);
          return batch.length;
        });

        const BATCH = 200;
        let batchArr: any[][] = [];
        for (const raw of rows) {
          try {
            const _id = raw?._id;
            if (!_id) { applied[key].errors++; continue; }

            // Skip older incoming rows based on syncVersion (when known)
            const incomingVersion = Number(raw.syncVersion) || 0;
            const existingVer = existingVersions[_id];
            if (existingVer !== undefined && incomingVersion < existingVer) {
              applied[key].skipped++;
              continue;
            }

            const values: any[] = [];
            for (const col of columns) {
              if (col === '_id') { values.push(String(raw._id)); continue; }
              let v = (raw as any)[col];
              if (integerCols.has(col)) {
                v = v === null || v === undefined || v === '' ? null : (Number(v) ? 1 : 0);
              } else if (numericCols.has(col)) {
                v = v === null || v === undefined || v === '' ? null : Number(v);
                if (Number.isNaN(v as number)) v = null;
              } else {
                v = serializeCell(v);
              }
              values.push(v);
            }
            batchArr.push(values);
            if (batchArr.length >= BATCH) {
              try { txInsert(batchArr); applied[key].upserted += batchArr.length; total += batchArr.length; }
              catch (e: any) {
                applied[key].errors += batchArr.length;
                if (applied[key].errors <= 5) console.warn(`[Sync-Apply] ${key} batch err:`, e?.message);
              }
              batchArr = [];
            }
          } catch (rowErr: any) {
            applied[key].errors++;
            if (applied[key].errors <= 5) console.warn(`[Sync-Apply] ${key} row err:`, rowErr?.message);
          }
        }
        if (batchArr.length) {
          try { txInsert(batchArr); applied[key].upserted += batchArr.length; total += batchArr.length; }
          catch (e: any) {
            applied[key].errors += batchArr.length;
            if (applied[key].errors <= 5) console.warn(`[Sync-Apply] ${key} final batch err:`, e?.message);
          }
        }
      }
      return { applied, total };
    }

    // ========== MONGODB PATH (Remote cloud server when it imports a snapshot — rare) ==========
    const session = await mongoose.startSession();
    try {
      for (const { key, model } of FULL_SYNC_ENTITIES) {
        applied[key] = { upserted: 0, skipped: 0, errors: 0 };
        const rows = snapshot.entities?.[key] || [];
        if (!rows.length) continue;
        try {
          const Model = mongoose.model(model);
          await session.withTransaction(async () => {
            for (const raw of rows) {
              try {
                const _id = raw._id;
                if (!_id) { (applied[key] as any).errors++; continue; }
                const { __v, ...data } = raw as any;
                const existing = await Model.findById(_id).session(session);
                if (existing) {
                  Object.assign(existing, data, { updatedAt: new Date() });
                  await existing.save({ session });
                } else {
                  const doc = new Model(data);
                  await doc.save({ session });
                }
                (applied[key] as any).upserted++;
                total++;
              } catch (rowErr: any) {
                (applied[key] as any).errors++;
                if ((applied[key] as any).errors < 5) {
                  console.warn(`[Sync-Full] ${key} row upsert err:`, rowErr?.message || rowErr);
                }
              }
            }
          });
        } catch (err: any) {
          console.error(`[Sync-Full] Entity ${key} apply failed:`, err?.message || err);
        }
      }
    } finally {
      session.endSession();
    }
    return { applied, total };
  }

  /**
   * Process a batch of sync operations
   */
  async processBatch(operations: SyncOperation[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    // Process each operation in a transaction
    const session = await mongoose.startSession();
    
    try {
      await session.startTransaction();

      for (const operation of operations) {
        try {
          const result = await this.processOperation(operation, session);
          results.push(result);
        } catch (error) {
          results.push({
            id: operation.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    return results;
  }

  /**
   * Process a single sync operation
   */
  private async processOperation(
    operation: SyncOperation,
    session: mongoose.ClientSession
  ): Promise<SyncResult> {
    const { id, operation: op, collection, data } = operation;

    try {
      // Get the model for the collection
      const Model = this.getModel(collection);
      if (!Model) {
        return {
          id,
          success: false,
          error: `Collection ${collection} not found`
        };
      }

      switch (op) {
        case 'CREATE':
          return await this.handleCreate(id, Model, data, session, collection);
        case 'UPDATE':
          return await this.handleUpdate(id, Model, data, session);
        case 'DELETE':
          return await this.handleDelete(id, Model, data, session);
        default:
          return {
            id,
            success: false,
            error: `Unknown operation: ${op}`
          };
      }
    } catch (error) {
      return {
        id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle CREATE operation
   */
  private async handleCreate(
    queueId: string,
    Model: mongoose.Model<any>,
    data: any,
    session: mongoose.ClientSession,
    collection?: string
  ): Promise<SyncResult> {
    // Remove local _id if it exists (we'll use server-generated one)
    const { _id, ...dataWithoutId } = data;

    // Special handling for payments — use paymentService to create CheckRecords and update asset accounts
    if (collection === 'payments') {
      const { createPayment } = await import('./paymentService');
      const payment = await createPayment(dataWithoutId, dataWithoutId.createdBy || data.createdBy);
      return {
        id: queueId,
        success: true,
        serverId: payment._id.toString()
      };
    }

    // Ensure products created via sync have required markup defaults if missing
    if (collection === 'products') {
      if (!dataWithoutId.markupType) {
        dataWithoutId.markupType = 'percentage';
        dataWithoutId.markupPercentage = dataWithoutId.markupPercentage || 0;
      }
      
      // Ensure vomData entries have a reason if they are being synced
      if (Array.isArray(dataWithoutId.vomData)) {
        dataWithoutId.vomData = dataWithoutId.vomData.map((entry: any) => ({
          ...entry,
          reason: entry.reason || 'INITIAL_COUNT'
        }));
      }
    }

    const doc = new Model(dataWithoutId);
    await doc.save({ session });

    return {
      id: queueId,
      success: true,
      serverId: doc._id.toString()
    };
  }

  /**
   * Handle UPDATE operation
   */
  private async handleUpdate(
    queueId: string,
    Model: mongoose.Model<any>,
    data: any,
    session: mongoose.ClientSession
  ): Promise<SyncResult> {
    const { _id, syncVersion, ...updateData } = data;

    if (!_id) {
      return {
        id: queueId,
        success: false,
        error: 'Missing _id for update operation'
      };
    }

    // Check for conflicts using syncVersion
    const existingDoc = await Model.findById(_id).session(session);
    
    if (!existingDoc) {
      return {
        id: queueId,
        success: false,
        error: 'Document not found'
      };
    }

    // Check for version conflict
    if (syncVersion !== undefined && existingDoc.syncVersion !== undefined) {
      if (existingDoc.syncVersion > syncVersion) {
        // Conflict detected - server has newer version
        return {
          id: queueId,
          success: false,
          conflict: {
            localVersion: syncVersion,
            serverVersion: existingDoc.syncVersion,
            serverData: existingDoc.toObject()
          }
        };
      }
    }

    // Ensure updates to vomData include reasons as per requirements
    if (updateData.vomData && Array.isArray(updateData.vomData)) {
      updateData.vomData = updateData.vomData.map((entry: any) => {
        if (!entry.reason) {
          return { ...entry, reason: 'CORRECTION' };
        }
        return entry;
      });
    }

    // Update the document
    const updatedDoc = await Model.findByIdAndUpdate(
      _id,
      {
        ...updateData,
        syncVersion: (existingDoc.syncVersion || 0) + 1,
        updatedAt: new Date()
      },
      { new: true, session }
    );

    return {
      id: queueId,
      success: true,
      serverId: updatedDoc._id.toString()
    };
  }

  /**
   * Handle DELETE operation
   */
  private async handleDelete(
    queueId: string,
    Model: mongoose.Model<any>,
    data: any,
    session: mongoose.ClientSession
  ): Promise<SyncResult> {
    const { _id } = data;

    if (!_id) {
      return {
        id: queueId,
        success: false,
        error: 'Missing _id for delete operation'
      };
    }

    // Soft delete by setting isDeleted flag
    const doc = await Model.findByIdAndUpdate(
      _id,
      {
        isDeleted: true,
        updatedAt: new Date()
      },
      { new: true, session }
    );

    if (!doc) {
      return {
        id: queueId,
        success: false,
        error: 'Document not found'
      };
    }

    return {
      id: queueId,
      success: true,
      serverId: doc._id.toString()
    };
  }

  /**
   * Get Mongoose model by collection name
   */
  private getModel(collection: string): mongoose.Model<any> | null {
    const modelMap: Record<string, string> = {
      products: 'Product',
      vendors: 'Vendor',
      purchaseOrders: 'PurchaseOrder',
      deliveries: 'DeliveryReceipt',
      deliveryReceipts: 'DeliveryReceipt',
      customers: 'Customer',
      sales: 'Sale',
      payments: 'Payment',
      expenses: 'Expense',
      assetAccounts: 'AssetAccount',
      uoms: 'UOM',
      users: 'User',
      checkRecords: 'CheckRecord',
      dailyCashDrawer: 'DailyCashDrawer',
      systemConfigurations: 'SystemConfiguration',
    };

    const modelName = modelMap[collection];
    if (!modelName) return null;

    try {
      return mongoose.model(modelName);
    } catch {
      return null;
    }
  }

  /**
   * Get changes since a specific timestamp
   */
  async getChangesSince(
    collection: string,
    since: string
  ): Promise<any[]> {
    const Model = this.getModel(collection);
    if (!Model) {
      throw new Error(`Collection ${collection} not found`);
    }

    const sinceDate = new Date(since);
    const changes = await Model.find({
      updatedAt: { $gt: sinceDate }
    }).sort({ updatedAt: 1 });

    return changes;
  }
}

export const syncService = new SyncService();
