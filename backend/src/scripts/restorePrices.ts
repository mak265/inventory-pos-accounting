import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractTuples(sql: string, tableName: string): string[][] {
  const results: string[][] = [];
  const insertRegex = new RegExp(`insert\\s+into\\s+\`?${tableName}\`?`, 'gi');
  let insertMatch: RegExpExecArray | null;
  while ((insertMatch = insertRegex.exec(sql)) !== null) {
    const afterInsert = sql.substring(insertMatch.index);
    const valuesMatch = afterInsert.match(/values\s*/i);
    if (!valuesMatch || valuesMatch.index === undefined) continue;
    let pos = insertMatch.index + valuesMatch.index + valuesMatch[0].length;
    while (pos < sql.length) {
      while (pos < sql.length && /\s/.test(sql[pos])) pos++;
      if (sql[pos] !== '(') break;
      pos++;
      const fields: string[] = [];
      let current = '', inQuote = false, depth = 0;
      while (pos < sql.length) {
        const ch = sql[pos];
        if (inQuote) {
          if (ch === "'" && sql[pos + 1] === "'") { current += "'"; pos += 2; continue; }
          if (ch === '\\' && sql[pos + 1] === "'") { current += "'"; pos += 2; continue; }
          if (ch === "'") { inQuote = false; pos++; continue; }
          current += ch; pos++; continue;
        }
        if (ch === "'") { inQuote = true; pos++; continue; }
        if (ch === '(') { depth++; current += ch; pos++; continue; }
        if (ch === ')') {
          if (depth > 0) { depth--; current += ch; pos++; continue; }
          fields.push(current.trim()); pos++; break;
        }
        if (ch === ',' && depth === 0) { fields.push(current.trim()); current = ''; pos++; continue; }
        current += ch; pos++;
      }
      const cleaned = fields.map(f => f === 'NULL' ? '' : f);
      if (cleaned.length > 1) results.push(cleaned);
      while (pos < sql.length && /[\s,]/.test(sql[pos])) pos++;
      if (sql[pos] === ';') { pos++; break; }
    }
    insertRegex.lastIndex = pos;
  }
  return results;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  console.log('Connected');

  const sqlFile = fs.readFileSync(path.join(__dirname, 'makisample.sql'), 'utf8').replace(/\r/g, '');
  console.log(`SQL: ${(sqlFile.length / 1024 / 1024).toFixed(1)} MB`);

  const tuples = extractTuples(sqlFile, 'itemlist');
  console.log(`Found ${tuples.length} products in SQL`);

  let count = 0;
  for (const f of tuples) {
    const code = f[3] || '';
    const srp = parseFloat(f[7]) || 0;
    const poPrice = parseFloat(f[8]) || 0;
    if (!code) continue;

    const r = await mongoose.connection.db!.collection('products').updateOne(
      { code },
      { $set: { sellingPrice: srp, lastCost: poPrice } }
    );
    if (r.modifiedCount > 0) count++;
  }

  console.log(`Restored sellingPrice and lastCost for ${count} products (averageCost stays 0)`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
