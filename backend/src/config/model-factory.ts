/**
 * Model Factory - Registers a Node.js module loader that intercepts
 * `import mongoose from 'mongoose'` and returns our SQLite shim instead.
 */

import { getDbMode } from './database-adapter.js';
import { SQLiteModel, Schema, ObjectId, startSession } from './sqlite-adapter.js';
import Module from 'module';

const TABLE_MAP: Record<string, string> = {
  User: 'users',
  Product: 'products',
  Customer: 'customers',
  Vendor: 'vendors',
  UOM: 'uoms',
  PurchaseOrder: 'purchase_orders',
  DeliveryReceipt: 'delivery_receipts',
  Sale: 'sales',
  Payment: 'payments',
  Expense: 'expenses',
  AssetAccount: 'asset_accounts',
  CheckRecord: 'check_records',
  AuditLog: 'audit_logs',
  SavedState: 'saved_states',
  SystemConfiguration: 'system_configurations',
  DailyCashDrawer: 'daily_cash_drawers',
};

const sqliteModels = new Map<string, any>();

function modelFn(name: string, schema?: any): any {
  if (schema) {
    const tableName = TABLE_MAP[name] || name.toLowerCase() + 's';
    const sqliteSchema = new Schema({});
    const model = new SQLiteModel(tableName, sqliteSchema);

    const Ctor: any = function(data: any) { return model.new(data); };
    Ctor.find = model.find.bind(model);
    Ctor.findOne = model.findOne.bind(model);
    Ctor.findById = model.findById.bind(model);
    Ctor.findByIdAndUpdate = model.findByIdAndUpdate.bind(model);
    Ctor.findOneAndUpdate = model.findOneAndUpdate.bind(model);
    Ctor.create = model.create.bind(model);
    Ctor.countDocuments = model.countDocuments.bind(model);
    Ctor.updateMany = model.updateMany.bind(model);
    Ctor.modelName = name;
    Ctor.schema = sqliteSchema;
    sqliteModels.set(name, Ctor);
    return Ctor;
  }
  return sqliteModels.get(name) || null;
}

// The fake mongoose object
const fakeMongoose: any = {
  model: modelFn,
  Schema: Schema,
  Types: { ObjectId },
  startSession,
  connect: async () => {},
  connection: { readyState: 1, on: () => {}, once: () => {} },
};
fakeMongoose.default = fakeMongoose;

let patched = false;

export function patchMongooseForSQLite() {
  if (patched || getDbMode() !== 'sqlite') return;
  patched = true;

  // Intercept CommonJS require('mongoose')
  const origResolve = (Module as any)._resolveFilename;
  (Module as any)._resolveFilename = function(request: string, ...args: any[]) {
    if (request === 'mongoose') {
      // Return a sentinel that we'll handle
      return 'mongoose-sqlite-shim';
    }
    return origResolve.call(this, request, ...args);
  };

  // Cache our fake module
  const cache = (Module as any)._cache || require.cache;
  cache['mongoose-sqlite-shim'] = {
    id: 'mongoose-sqlite-shim',
    filename: 'mongoose-sqlite-shim',
    loaded: true,
    exports: fakeMongoose,
  };

  console.log('Mongoose intercepted → SQLite shim active');
}
