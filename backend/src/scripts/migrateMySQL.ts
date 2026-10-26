/**
 * MySQL to MongoDB Migration Script
 * Reads the SQL dump and inserts products (with stock), customers, vendors, and UOMs
 * 
 * Usage: export NODE_OPTIONS="--max-old-space-size=1024" && npx tsx src/scripts/migrateMySQL.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONGODB_URI = process.env.MONGODB_URI || '';

// Helper: extract tuples from INSERT statements (handles multiple INSERTs, parens/commas in quotes)
function extractTuples(sql: string, tableName: string): string[][] {
  const results: string[][] = [];
  
  // Use regex to find all INSERT INTO for this table (handles variable whitespace)
  const insertRegex = new RegExp(`insert\\s+into\\s+\`?${tableName}\`?`, 'gi');
  let insertMatch: RegExpExecArray | null;
  
  while ((insertMatch = insertRegex.exec(sql)) !== null) {
    // Find "values" after the INSERT INTO (skip column list if present)
    const afterInsert = sql.substring(insertMatch.index);
    const valuesMatch = afterInsert.match(/values\s*/i);
    if (!valuesMatch || valuesMatch.index === undefined) continue;
    
    let pos = insertMatch.index + valuesMatch.index + valuesMatch[0].length;
    
    // Now parse tuples: (val1, val2, ...), (val1, val2, ...), ...;
    while (pos < sql.length) {
      // Skip whitespace
      while (pos < sql.length && /\s/.test(sql[pos])) pos++;
      if (sql[pos] !== '(') break; // No more tuples

      // Parse one tuple: find matching ')' respecting quotes
      pos++; // skip opening '('
      const fields: string[] = [];
      let current = '';
      let inQuote = false;
      let depth = 0;

      while (pos < sql.length) {
        const ch = sql[pos];
        if (inQuote) {
          if (ch === "'" && sql[pos + 1] === "'") {
            current += "'";
            pos += 2;
            continue;
          }
          if (ch === '\\' && sql[pos + 1] === "'") {
            current += "'";
            pos += 2;
            continue;
          }
          if (ch === "'") {
            inQuote = false;
            pos++;
            continue;
          }
          current += ch;
          pos++;
          continue;
        }
        // Not in quote
        if (ch === "'") { inQuote = true; pos++; continue; }
        if (ch === '(') { depth++; current += ch; pos++; continue; }
        if (ch === ')') {
          if (depth > 0) { depth--; current += ch; pos++; continue; }
          // End of tuple
          fields.push(current.trim());
          pos++; // skip closing ')'
          break;
        }
        if (ch === ',' && depth === 0) {
          fields.push(current.trim());
          current = '';
          pos++;
          continue;
        }
        current += ch;
        pos++;
      }

      // Clean up NULL values
      const cleaned = fields.map(f => f === 'NULL' ? '' : f);
      if (cleaned.length > 1) results.push(cleaned);

      // Skip comma between tuples or semicolon at end
      while (pos < sql.length && /[\s,]/.test(sql[pos])) pos++;
      if (sql[pos] === ';') { pos++; break; }
    }
    
    // Update regex lastIndex to continue after parsed tuples
    insertRegex.lastIndex = pos;
  }

  return results;
}

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected');

  // === Drop all collections first (clean slate) ===
  console.log('\n=== Dropping all collections ===');
  const collections = await mongoose.connection.db!.listCollections().toArray();
  for (const col of collections) {
    await mongoose.connection.db!.dropCollection(col.name);
    console.log(`Dropped: ${col.name}`);
  }
  console.log('All collections dropped');

  const { default: ProductModel } = await import('../models/Product.js');
  const { default: CustomerModel } = await import('../models/Customer.js');
  const { default: VendorModel } = await import('../models/Vendor.js');
  const { default: UOMModel } = await import('../models/UOM.js');
  const { User: UserModel } = await import('../models/User.js');
  const { default: AssetAccountModel } = await import('../models/AssetAccount.js');
  const { SystemConfiguration: SystemConfigModel } = await import('../models/SystemConfiguration.js');

  // === Create admin user ===
  console.log('\n=== Creating admin user ===');
  await UserModel.create({ username: 'admin', passwordHash: 'admin123', role: 'ADMIN', fullName: 'Administrator', isActive: true });
  console.log('✅ Admin user created (admin / admin123)');

  // === Init asset accounts ===
  for (const acctType of ['Cash', 'CHECK', 'GCash', 'BPI', 'AUB']) {
    await AssetAccountModel.create({ accountType: acctType, balance: 0 });
  }
  console.log('✅ Asset accounts initialized');

  // === Company settings ===
  await SystemConfigModel.create({ key: 'main', companyName: 'Aberin Hardware', logoUrl: '', tagline: '' });
  console.log('✅ Company settings created');

  console.log('Reading SQL file...');
  const sqlFile = fs.readFileSync(path.join(__dirname, 'makisample.sql'), 'utf8').replace(/\r/g, '');
  console.log(`SQL file: ${(sqlFile.length / 1024 / 1024).toFixed(1)} MB`);

  // Debug: show what table names exist in the SQL
  const insertMatches = sqlFile.match(/insert\s+into\s+[`"]?(\w+)[`"]?/gi) || [];
  const tableNames = [...new Set(insertMatches.map(m => m.replace(/insert\s+into\s+[`"]?/i, '').replace(/[`"]?$/, '')))];
  console.log(`Tables found in SQL: ${tableNames.join(', ')}`);

  // === Collect UOMs from products ===
  console.log('\n=== Collecting UOMs from products ===');
  const itemTuples = extractTuples(sqlFile, 'itemlist');
  console.log(`Found ${itemTuples.length} product tuples in SQL`);
  const uomSet = new Set<string>();
  for (const f of itemTuples) {
    const uom = (f[6] || 'PC').trim();
    if (uom) uomSet.add(uom);
  }
  let uomCount = 0;
  for (const abbr of uomSet) {
    try {
      const exists = await UOMModel.findOne({ abbreviation: abbr });
      if (!exists) {
        await UOMModel.create({ name: abbr, abbreviation: abbr, syncVersion: 0, isDeleted: false });
        uomCount++;
      }
    } catch {}
  }
  console.log(`UOMs: ${uomCount} inserted from ${uomSet.size} unique units`);

  // === Calculate stock from itemjournal ===
  console.log('\n=== Calculating stock from journal ===');
  const journalTuples = extractTuples(sqlFile, 'itemjournal');
  console.log(`Found ${journalTuples.length} journal entries in SQL`);
  const stockMap = new Map<string, number>(); // productcode -> stock
  for (const f of journalTuples) {
    // Fields: id, code, refcode, trans_type, trans_date, trans_datetime, productid, productno, productcode, productdesc, productunit, actualqty, negativeqty, positiveqty
    const productCode = f[8] || '';
    const positiveQty = parseFloat(f[13]) || 0;
    const negativeQty = parseFloat(f[12]) || 0;
    if (productCode) {
      const current = stockMap.get(productCode) || 0;
      stockMap.set(productCode, current + positiveQty - negativeQty);
    }
  }
  console.log(`Stock entries calculated for ${stockMap.size} products`);

  // === Products ===
  console.log('\n=== Migrating Products ===');
  let prodCount = 0;
  for (const f of itemTuples) {
    try {
      // Fields: ID, ProductID, ProductNo, Code, ItemDesc, Specs, Unit, SRP, POPrice, PriceMode, COG, ...
      const code = f[3] || '';
      const description = f[4] || f[5] || '';
      const uom = f[6] || 'PC';
      const sellingPrice = parseFloat(f[7]) || 0;
      const lastCost = parseFloat(f[8]) || 0;
      const cog = parseFloat(f[10]) || lastCost;
      const markup = parseFloat(f[19]) || 0;
      const stock = Math.max(0, Math.round((stockMap.get(code) || 0) * 100) / 100);

      if (!code || !description) continue;

      // Find UOM ID
      const uomDoc = await UOMModel.findOne({ abbreviation: uom });

      const exists = await ProductModel.findOne({ code });
      if (!exists) {
        await ProductModel.create({
          code, description, uom, sellingPrice, lastCost,
          averageCost: cog || lastCost,
          markupPercentage: markup, markupType: 'percentage',
          availableStock: stock,
          uomId: uomDoc?._id || undefined,
          sellingUoms: [], vendorCosts: [], vomData: [],
          syncVersion: 0, isDeleted: false, isActive: true,
        });
        prodCount++;
      }
    } catch {}
  }
  console.log(`Products: ${prodCount} inserted (${stockMap.size} with stock data)`);

  // === Customers ===
  console.log('\n=== Migrating Customers ===');
  const custTuples = extractTuples(sqlFile, 'customerinfo');
  console.log(`Found ${custTuples.length} customer tuples in SQL`);
  let custCount = 0;
  for (const f of custTuples) {
    try {
      // Fields: CustID, CardNo, CustomerName, OfficeAddress, DelAddress, SalesNameID, SalesName, TelNo, FaxNo, Terms, TIN
      const name = f[2] || '';
      const officeAddress = f[3] || '';
      const deliveryAddress = f[4] || '';
      const phone = f[7] || '';
      const tin = f[10] || '';

      if (!name || name === 'CASH' || name === '0') continue;

      const exists = await CustomerModel.findOne({ name });
      if (!exists) {
        await CustomerModel.create({
          name, officeAddress, deliveryAddress, phone, tin,
          balance: 0, syncVersion: 0, isDeleted: false,
        });
        custCount++;
      }
    } catch {}
  }
  console.log(`Customers: ${custCount} inserted`);

  // === Vendors/Suppliers ===
  console.log('\n=== Migrating Vendors ===');
  const suppTuples = extractTuples(sqlFile, 'suppliers');
  console.log(`Found ${suppTuples.length} vendor tuples in SQL`);
  let vendCount = 0;
  for (const f of suppTuples) {
    try {
      // Fields: SupplierID, SupplierCode, SupplierName, OfficeAddress, PlantAddress, TelNo, FaxNo, Email, Terms, TIN, Contact1
      const name = f[2] || '';
      const address = f[3] || f[4] || '';
      const phone = f[5] || '';
      const email = f[7] || '';
      const contactPerson = f[10] || '';

      if (!name) continue;

      const exists = await VendorModel.findOne({ name });
      if (!exists) {
        await VendorModel.create({
          name, address, phone, email, contactPerson,
          syncVersion: 0, isDeleted: false,
        });
        vendCount++;
      }
    } catch {}
  }
  console.log(`Vendors: ${vendCount} inserted`);

  console.log('\n=== Migration Complete ===');
  console.log(`Products: ${prodCount}, Customers: ${custCount}, Vendors: ${vendCount}, UOMs: ${uomCount}`);
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
