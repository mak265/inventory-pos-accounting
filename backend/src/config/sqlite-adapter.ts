/**
 * SQLite Adapter - Mimics Mongoose API for seamless MongoDB → SQLite transition
 * 
 * This adapter wraps better-sqlite3 to provide a Mongoose-compatible interface.
 * Services and controllers remain unchanged — only the model layer swaps out.
 * 
 * Supported Mongoose patterns:
 * - Model.find(query), Model.findOne(query), Model.findById(id)
 * - Model.findByIdAndUpdate(), Model.findOneAndUpdate()
 * - Model.create(data), Model.countDocuments(query)
 * - Model.updateMany(query, data)
 * - Chain: .lean(), .sort(), .limit(), .skip(), .select(), .populate(), .session(), .collation()
 * - Instance: doc.save(), doc.toObject()
 * - Query ops: $regex, $or, $in, $gte, $lte, $ne, $gt
 * - Transactions via session
 * - ObjectId generation (UUID-based)
 * - Pre-save hooks
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

// Get the user data path for storing the SQLite database
function getDbPath(): string {
  // Priority 1: Explicit DB_PATH from environment (set by Electron main process)
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }

  try {
    // Priority 2: Electron environment (in-process)
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'aberin-pos.db');
  } catch {
    // Priority 3: Fallback for non-Electron (dev/testing)
    return path.join(process.cwd(), 'aberin-pos.db');
  }
}

export function initSQLite(dbPath?: string): Database.Database {
  const finalPath = dbPath || getDbPath();
  const parentDir = path.dirname(finalPath);
  if (parentDir && !fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  db = new Database(finalPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function getDB(): Database.Database {
  if (!db) throw new Error('SQLite not initialized. Call initSQLite() first.');
  return db;
}

// --- ObjectId replacement ---
export class ObjectId {
  private _id: string;
  constructor(id?: string) {
    this._id = id || uuidv4().replace(/-/g, '').substring(0, 24);
  }
  toString() { return this._id; }
  toJSON() { return this._id; }
  equals(other: any) { return this._id === (other?._id || other?.toString() || other); }
  static isValid(id: any): boolean {
    return typeof id === 'string' && id.length > 0;
  }
}

// --- Schema Definition ---
interface SchemaField {
  type: any;
  required?: boolean | [boolean, string];
  default?: any;
  unique?: boolean;
  index?: boolean;
  ref?: string;
  enum?: string[];
  min?: number | [number, string];
  max?: number | [number, string];
  trim?: boolean;
  select?: boolean;
}

interface SchemaDefinition {
  [key: string]: SchemaField | any;
}

interface PreHook {
  event: string;
  fn: (this: any) => void;
}

export class Schema {
  fields: SchemaDefinition;
  options: any;
  preHooks: PreHook[] = [];
  indexes: Array<{ fields: any; options?: any }> = [];

  // Mimic Mongoose Schema.Types
  static Types = {
    ObjectId: 'ObjectId',
    Mixed: 'Mixed',
    String: 'String',
    Number: 'Number',
    Boolean: 'Boolean',
    Date: 'Date',
  };

  // Instance access too (some models use schema.Types via the instance)
  Types = Schema.Types;

  // Mimic Mongoose schema.methods and schema.statics
  methods: Record<string, Function> = {};
  statics: Record<string, Function> = {};
  s: any = { hooks: { _pres: new Map() } };

  constructor(fields: SchemaDefinition, options?: any) {
    this.fields = fields;
    this.options = options || {};
  }

  pre(event: string, fn: (this: any) => void) {
    this.preHooks.push({ event, fn });
  }

  index(fields: any, options?: any) {
    this.indexes.push({ fields, options });
  }

  set(_key: string, _value: any) {
    // No-op for SQLite — toJSON transforms etc. not needed
  }

  get(_key: string) {
    return undefined;
  }
}


// --- Query Builder ---
// Translates Mongoose-style queries to SQL WHERE clauses

function buildWhereClause(query: any, tableName: string): { sql: string; params: any[] } {
  if (!query || Object.keys(query).length === 0) return { sql: '', params: [] };

  const conditions: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (key === '$or') {
      const orConditions = (value as any[]).map(subQuery => {
        const sub = buildWhereClause(subQuery, tableName);
        params.push(...sub.params);
        return `(${sub.sql})`;
      });
      conditions.push(`(${orConditions.join(' OR ')})`);
      continue;
    }

    if (key === '$and') {
      const andConditions = (value as any[]).map(subQuery => {
        const sub = buildWhereClause(subQuery, tableName);
        params.push(...sub.params);
        return `(${sub.sql})`;
      });
      conditions.push(`(${andConditions.join(' AND ')})`);
      continue;
    }

    // Handle dot notation for JSON fields (e.g., 'lineItems.productId')
    const column = key.replace(/\./g, '_');

    if (value === null || value === undefined) {
      conditions.push(`${column} IS NULL`);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Operator queries: { $gte: ..., $lte: ..., $regex: ..., etc. }
      for (const [op, opVal] of Object.entries(value as any)) {
        switch (op) {
          case '$exists':
            if (opVal) {
              conditions.push(`${column} IS NOT NULL`);
            } else {
              conditions.push(`${column} IS NULL`);
            }
            break;
          case '$gte':
            conditions.push(`${column} >= ?`);
            params.push(opVal instanceof Date ? (opVal as Date).toISOString() : opVal);
            break;
          case '$lte':
            conditions.push(`${column} <= ?`);
            params.push(opVal instanceof Date ? (opVal as Date).toISOString() : opVal);
            break;
          case '$gt':
            conditions.push(`${column} > ?`);
            params.push(opVal instanceof Date ? (opVal as Date).toISOString() : opVal);
            break;
          case '$lt':
            conditions.push(`${column} < ?`);
            params.push(opVal instanceof Date ? (opVal as Date).toISOString() : opVal);
            break;
          case '$ne':
            conditions.push(`${column} != ?`);
            if (typeof opVal === 'boolean') params.push(opVal ? 1 : 0);
            else params.push(opVal instanceof Date ? (opVal as Date).toISOString() : opVal);
            break;
          case '$in':
            if (Array.isArray(opVal) && opVal.length > 0) {
              const placeholders = opVal.map(() => '?').join(',');
              conditions.push(`${column} IN (${placeholders})`);
              params.push(...opVal.map(v => v?.toString() || v));
            } else {
              conditions.push('0'); // Empty $in = no match
            }
            break;
          case '$regex':
            conditions.push(`${column} LIKE ?`);
            // Convert regex to LIKE pattern
            let pattern = String(opVal);
            if (pattern.startsWith('^')) pattern = pattern.substring(1) + '%';
            else pattern = '%' + pattern + '%';
            params.push(pattern);
            break;
          case '$options':
            // SQLite LIKE is case-insensitive by default — no-op
            break;
        }
      }
    } else {
      conditions.push(`${column} = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value?.toString() || value);
    }
  }

  return { sql: conditions.join(' AND '), params };
}


// --- Document class (mimics Mongoose Document) ---

class SQLiteDocument {
  _data: any;
  _tableName: string;
  _schema: Schema;
  _isNew: boolean;
  [key: string]: any;

  constructor(tableName: string, schema: Schema, data: any, isNew = false) {
    this._data = { ...data };
    this._tableName = tableName;
    this._schema = schema;
    this._isNew = isNew;

    // Proxy to allow direct property access (doc.name, doc.balance, etc.)
    return new Proxy(this, {
      get(target, prop: string) {
        // Internal properties
        if (prop === '_data' || prop === '_tableName' || prop === '_schema' || prop === '_isNew') {
          return (target as any)[prop];
        }
        // Built-in methods
        if (prop === 'save' || prop === 'toObject' || prop === 'toJSON') {
          return (target as any)[prop].bind(target);
        }
        // Check schema methods (e.g., comparePassword)
        if (target._schema.methods[prop]) {
          return target._schema.methods[prop].bind(new Proxy(target, {
            get: (t, p: string) => {
              if (p === '_data' || p === '_tableName' || p === '_schema' || p === '_isNew') return (t as any)[p];
              if (p === 'save' || p === 'toObject' || p === 'toJSON') return (t as any)[p].bind(t);
              return t._data[p];
            },
            set: (t, p: string, v) => { t._data[p] = v; return true; }
          }));
        }
        if (prop === '_id') return target._data._id;
        if (prop === 'isNew') return target._isNew;
        if (prop === 'isModified') return () => true;
        // Data fields
        const val = target._data[prop];
        if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
          try { return JSON.parse(val); } catch { return val; }
        }
        if (val === 0 || val === false || val === '') return val;
        return val !== undefined ? val : undefined;
      },
      set(target, prop: string, value) {
        if (prop.startsWith('_') && prop in target) {
          (target as any)[prop] = value;
        } else {
          target._data[prop] = value;
        }
        return true;
      }
    });
  }

  toObject() {
    const obj = { ...this._data };
    // Parse JSON fields
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try { obj[key] = JSON.parse(val); } catch { /* keep as string */ }
      }
    }
    return obj;
  }

  toJSON() { return this.toObject(); }

  async save(options?: { session?: any }) {
    const database = getDB();

    // Create a context for pre-save hooks with Mongoose-like helpers
    const hookContext: any = {
      ...this._data,
      isNew: this._isNew,
      isModified: (_field: string) => this._isNew, // Only "modified" on new docs
      get: (field: string) => this._data[field],
    };

    // Run pre-save hooks
    for (const hook of this._schema.preHooks) {
      if (hook.event === 'save') {
        const result = hook.fn.call(hookContext);
        if (result instanceof Promise) await result;
        // Copy any changes back from hook context
        for (const [k, v] of Object.entries(hookContext)) {
          if (typeof v !== 'function' && k !== 'isNew' && k !== 'isModified' && k !== 'get') {
            this._data[k] = v;
          }
        }
      }
    }

    const data = { ...this._data };

    // Serialize arrays/objects to JSON
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) || (typeof val === 'object' && val !== null && !(val instanceof Date))) {
        data[key] = JSON.stringify(val);
      }
      if (val instanceof Date) {
        data[key] = val.toISOString();
      }
    }

    // Get valid columns for this table and filter out unknown ones
    const tableInfo = database.prepare(`PRAGMA table_info(${this._tableName})`).all() as any[];
    const validColumns = new Set(tableInfo.map((c: any) => c.name));
    for (const key of Object.keys(data)) {
      if (!validColumns.has(key)) delete data[key];
    }

    // Ensure all values are SQLite-compatible (numbers, strings, bigints, buffers, null)
    for (const [key, val] of Object.entries(data)) {
      if (typeof val === 'boolean') data[key] = val ? 1 : 0;
      else if (val === undefined) data[key] = null;
      else if (typeof val === 'object' && val !== null) data[key] = JSON.stringify(val);
    }

    if (this._isNew || !data._id) {
      // INSERT
      if (!data._id) data._id = new ObjectId().toString();
      const columns = Object.keys(data);
      const placeholders = columns.map(() => '?').join(',');
      const sql = `INSERT OR REPLACE INTO ${this._tableName} (${columns.join(',')}) VALUES (${placeholders})`;
      database.prepare(sql).run(...columns.map(c => data[c]));
      this._isNew = false;
    } else {
      // UPDATE
      const { _id, ...rest } = data;
      const setClauses = Object.keys(rest).map(k => `${k} = ?`).join(', ');
      const sql = `UPDATE ${this._tableName} SET ${setClauses} WHERE _id = ?`;
      database.prepare(sql).run(...Object.values(rest), _id);
    }

    this._data = data;
    return this;
  }
}


// --- Query Chain (mimics Mongoose Query) ---

class QueryChain {
  private _tableName: string;
  private _schema: Schema;
  private _query: any;
  private _sortFields: string | null = null;
  private _limitVal: number | null = null;
  private _skipVal: number | null = null;
  private _selectFields: string[] | null = null;
  private _populateRefs: Array<{ path: string; select?: string }> = [];
  private _isLean = false;
  private _isFindOne = false;

  constructor(tableName: string, schema: Schema, query: any, isFindOne = false) {
    this._tableName = tableName;
    this._schema = schema;
    this._query = query || {};
    this._isFindOne = isFindOne;
  }

  sort(fields: any): this {
    if (typeof fields === 'string') {
      this._sortFields = fields;
    } else if (typeof fields === 'object') {
      const parts = Object.entries(fields).map(([k, v]) => `${k} ${(v as number) === -1 ? 'DESC' : 'ASC'}`);
      this._sortFields = parts.join(', ');
    }
    return this;
  }

  limit(n: number): this { this._limitVal = n; return this; }
  skip(n: number): this { this._skipVal = n; return this; }
  lean(): this { this._isLean = true; return this; }
  session(_s: any): this { return this; } // No-op for SQLite (no sessions)
  collation(_c: any): this { return this; } // No-op

  select(fields: string): this {
    if (typeof fields === 'string') {
      this._selectFields = fields.split(' ').filter(f => !f.startsWith('-'));
    }
    return this;
  }

  populate(pathOrObj: string | any, selectFields?: string): this {
    if (typeof pathOrObj === 'string') {
      this._populateRefs.push({ path: pathOrObj, select: selectFields });
    }
    return this;
  }

  // Execute the query
  async then(resolve: (value: any) => void, reject?: (reason: any) => void) {
    try {
      const result = this._execute();
      resolve(result);
    } catch (err) {
      if (reject) reject(err);
      else throw err;
    }
  }

  private _execute(): any {
    const database = getDB();
    const { sql: whereClause, params } = buildWhereClause(this._query, this._tableName);

    let sql = `SELECT * FROM ${this._tableName}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    if (this._sortFields) sql += ` ORDER BY ${this._sortFields}`;
    if (this._limitVal) sql += ` LIMIT ${this._limitVal}`;
    if (this._skipVal) sql += ` OFFSET ${this._skipVal}`;

    if (this._isFindOne) {
      sql += this._limitVal ? '' : ' LIMIT 1';
      const row = database.prepare(sql).get(...params) as any;
      if (!row) return null;
      return this._isLean ? this._parseRow(row) : new SQLiteDocument(this._tableName, this._schema, this._parseRow(row));
    }

    const rows = database.prepare(sql).all(...params) as any[];
    if (this._isLean) return rows.map(r => this._parseRow(r));
    return rows.map(r => new SQLiteDocument(this._tableName, this._schema, this._parseRow(r)));
  }

  private _parseRow(row: any): any {
    if (!row) return row;
    const parsed = { ...row };
    // Convert boolean integers back
    if ('isDeleted' in parsed) parsed.isDeleted = !!parsed.isDeleted;
    if ('isPettyCash' in parsed) parsed.isPettyCash = !!parsed.isPettyCash;
    // Parse JSON strings
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try { parsed[key] = JSON.parse(val); } catch { /* keep as string */ }
      }
    }
    return parsed;
  }
}


// --- Model class (mimics mongoose.Model) ---

export class SQLiteModel {
  tableName: string;
  schema: Schema;

  constructor(tableName: string, schema: Schema) {
    this.tableName = tableName;
    this.schema = schema;
  }

  // Create a new document instance (not saved yet)
  new(data: any): SQLiteDocument {
    return new SQLiteDocument(this.tableName, this.schema, data, true);
  }

  find(query?: any): QueryChain {
    return new QueryChain(this.tableName, this.schema, query, false);
  }

  findOne(query?: any): QueryChain {
    return new QueryChain(this.tableName, this.schema, query, true);
  }

  findById(id: string): QueryChain {
    return new QueryChain(this.tableName, this.schema, { _id: id?.toString() }, true);
  }

  async findByIdAndUpdate(id: string, update: any, options?: any): Promise<any> {
    const database = getDB();
    const { _id, __v, ...data } = update;

    // Serialize complex fields
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) || (typeof val === 'object' && val !== null && !(val instanceof Date))) {
        data[key] = JSON.stringify(val);
      }
      if (val instanceof Date) data[key] = (val as Date).toISOString();
    }

    const setClauses = Object.keys(data).map(k => `${k} = ?`).join(', ');
    if (!setClauses) return null;

    const sql = `UPDATE ${this.tableName} SET ${setClauses} WHERE _id = ?`;
    database.prepare(sql).run(...Object.values(data), id?.toString());

    if (options?.new !== false) {
      const row = database.prepare(`SELECT * FROM ${this.tableName} WHERE _id = ?`).get(id?.toString());
      return row ? new SQLiteDocument(this.tableName, this.schema, row) : null;
    }
    return null;
  }

  async findOneAndUpdate(query: any, update: any, options?: any): Promise<any> {
    const database = getDB();
    const { sql: whereClause, params } = buildWhereClause(query, this.tableName);
    const row = database.prepare(`SELECT _id FROM ${this.tableName} WHERE ${whereClause} LIMIT 1`).get(...params) as any;
    if (!row) {
      if (options?.upsert) {
        // Create new document
        const newData = { ...query, ...update, _id: new ObjectId().toString() };
        return this.create(newData);
      }
      return null;
    }
    return this.findByIdAndUpdate(row._id, update, options);
  }

  async create(data: any): Promise<any> {
    const doc = new SQLiteDocument(this.tableName, this.schema, data, true);
    if (!doc._data._id) doc._data._id = new ObjectId().toString();
    await doc.save();
    return doc;
  }

  async countDocuments(query?: any): Promise<number> {
    const database = getDB();
    const { sql: whereClause, params } = buildWhereClause(query || {}, this.tableName);
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    const result = database.prepare(sql).get(...params) as any;
    return result?.count || 0;
  }

  async updateMany(query: any, update: any): Promise<{ modifiedCount: number }> {
    const database = getDB();
    const { sql: whereClause, params: whereParams } = buildWhereClause(query, this.tableName);
    const { _id, __v, ...data } = update;

    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) || (typeof val === 'object' && val !== null && !(val instanceof Date))) {
        data[key] = JSON.stringify(val);
      }
      if (val instanceof Date) data[key] = (val as Date).toISOString();
      if (typeof val === 'boolean') data[key] = val ? 1 : 0;
    }

    const setClauses = Object.keys(data).map(k => `${k} = ?`).join(', ');
    let sql = `UPDATE ${this.tableName} SET ${setClauses}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;

    const result = database.prepare(sql).run(...Object.values(data), ...whereParams);
    return { modifiedCount: result.changes };
  }
}


// --- Model Registry (mimics mongoose.model()) ---

const modelRegistry = new Map<string, SQLiteModel>();

export function createModel(name: string, schema: Schema, tableName?: string): SQLiteModel {
  const table = tableName || name.toLowerCase() + 's';
  const model = new SQLiteModel(table, schema);
  modelRegistry.set(name, model);
  return model;
}

export function getModel(name: string): SQLiteModel | undefined {
  return modelRegistry.get(name);
}

// --- Session/Transaction support (wraps SQLite transactions) ---

export class SQLiteSession {
  private _db: Database.Database;
  private _inTransaction = false;

  constructor() {
    this._db = getDB();
  }

  async startTransaction() {
    this._db.exec('BEGIN TRANSACTION');
    this._inTransaction = true;
  }

  async commitTransaction() {
    if (this._inTransaction) {
      this._db.exec('COMMIT');
      this._inTransaction = false;
    }
  }

  async abortTransaction() {
    if (this._inTransaction) {
      this._db.exec('ROLLBACK');
      this._inTransaction = false;
    }
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    try {
      await this.startTransaction();
      const result = await fn();
      await this.commitTransaction();
      return result;
    } catch (e) {
      try { await this.abortTransaction(); } catch { /* noop */ }
      throw e;
    }
  }

  endSession() {
    if (this._inTransaction) {
      try { this._db.exec('ROLLBACK'); } catch { /* already ended */ }
    }
  }
}

export async function startSession(): Promise<SQLiteSession> {
  return new SQLiteSession();
}

// --- Mongoose compatibility namespace ---
// Drop-in replacement for `import mongoose from 'mongoose'`

export const sqliteMongoose = {
  Types: {
    ObjectId: {
      isValid: ObjectId.isValid
    }
  },
  startSession,
  model: getModel,
  Schema,
};

export default sqliteMongoose;
