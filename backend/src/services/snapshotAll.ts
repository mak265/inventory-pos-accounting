/**
 * Build a full snapshot from the LOCAL SQLite DB, INCLUDING soft-deleted rows,
 * with JSON text columns parsed back into objects/arrays and id-like string
 * fields sanitized (strip stray quotes). Shaped exactly for the cloud's
 * POST /api/sync/apply-full.
 *
 * Unlike syncService.getFullSnapshot (which filters isDeleted != true), this
 * includes deleted/voided rows so status changes and deletions reflect on the
 * cloud when the user presses "Sync to Cloud".
 *
 * SQLite-only.
 */

import { getDB } from '../config/sqlite-adapter.js';

// entityKey -> sqlite table name
const MAP: Array<[string, string]> = [
  ['uoms', 'uoms'],
  ['vendors', 'vendors'],
  ['customers', 'customers'],
  ['products', 'products'],
  ['purchaseOrders', 'purchase_orders'],
  ['deliveryReceipts', 'delivery_receipts'],
  ['sales', 'sales'],
  ['payments', 'payments'],
  ['checkRecords', 'check_records'],
  ['expenses', 'expenses'],
  ['dailyCashDrawer', 'daily_cash_drawers'],
];

const JSON_COLS = new Set([
  'lineItems', 'sellingUoms', 'vendorCosts', 'vomData',
  'paymentChannels', 'transactions', 'paymentHistory', 'lastDiscounts', 'recordData',
]);

const ID_FIELDS = new Set([
  'postedBy', 'createdBy', 'updatedBy', 'closedBy', 'savedBy', 'approvedBy', 'bouncedBy',
  'customerId', 'vendorId', 'productId', 'poId', 'saleId', 'paymentId', 'cashierId', 'userId',
]);

function cleanId(v: any): any {
  if (typeof v !== 'string') return v;
  const s = v.trim().replace(/^["'\\]+/, '').replace(/["'\\]+$/, '').replace(/["'\\]/g, '');
  return s === '' ? null : s;
}

export async function getFullSnapshotIncludingDeleted(): Promise<{ meta: any; entities: Record<string, any[]>; counts: Record<string, number> }> {
  const db = getDB();
  const entities: Record<string, any[]> = {};
  const counts: Record<string, number> = {};

  for (const [key, table] of MAP) {
    let rows: any[] = [];
    try {
      rows = db.prepare(`SELECT * FROM "${table}"`).all() as any[];
    } catch {
      rows = [];
    }
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        const v = r[k];
        if (v === null || v === undefined) continue;
        if (JSON_COLS.has(k) && typeof v === 'string') {
          try { r[k] = JSON.parse(v); } catch { /* leave as-is */ }
        } else if (ID_FIELDS.has(k) && typeof v === 'string') {
          r[k] = cleanId(v);
        }
      }
    }
    entities[key] = rows;
    counts[key] = rows.length;
  }

  return {
    meta: { generatedAt: new Date().toISOString(), source: 'offline-app-full' },
    entities,
    counts,
  };
}
