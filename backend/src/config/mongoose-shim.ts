/**
 * Mongoose Shim - Drop-in replacement for mongoose that uses SQLite.
 * Loaded instead of 'mongoose' when DB_MODE=sqlite via the ESM loader.
 */

import {
  SQLiteModel,
  Schema as SQLiteSchema,
  ObjectId,
  startSession as sqliteStartSession,
} from './sqlite-adapter.js';

const TABLE_MAP: Record<string, string> = {
  User: 'users', Product: 'products', Customer: 'customers',
  Vendor: 'vendors', UOM: 'uoms', PurchaseOrder: 'purchase_orders',
  DeliveryReceipt: 'delivery_receipts', Sale: 'sales', Payment: 'payments',
  Expense: 'expenses', AssetAccount: 'asset_accounts', CheckRecord: 'check_records',
  AuditLog: 'audit_logs', SavedState: 'saved_states',
  SystemConfiguration: 'system_configurations', DailyCashDrawer: 'daily_cash_drawers',
};

const sqliteModels = new Map<string, any>();

function modelFn(name: string, schema?: any): any {
  if (schema) {
    const tableName = TABLE_MAP[name] || name.toLowerCase() + 's';
    // Use the passed schema if it's already a SQLiteSchema, otherwise create new
    const sqliteSchema = schema instanceof SQLiteSchema ? schema : new SQLiteSchema({});
    // Copy methods from the original schema if present
    if (schema.methods) {
      Object.assign(sqliteSchema.methods, schema.methods);
    }
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

// The main default export (mimics `import mongoose from 'mongoose'`)
const mongoose = {
  model: modelFn,
  Schema: SQLiteSchema,
  Types: { ObjectId: ObjectId as any },
  startSession: sqliteStartSession,
  connect: async () => {},
  connection: { readyState: 1, on: () => {}, once: () => {} },
};

export default mongoose;

// Named exports (mimics `import { Schema, Document, Types } from 'mongoose'`)
export const Schema = SQLiteSchema;
export const model = modelFn;
export const Types = { ObjectId: ObjectId as any };
export const connection = mongoose.connection;
export const startSession = sqliteStartSession;

// Type stubs
export type Document = any;
export type ClientSession = any;
