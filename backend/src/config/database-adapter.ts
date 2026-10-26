/**
 * Database Adapter - Switches between MongoDB (web) and SQLite (desktop/Electron)
 * 
 * For SQLite mode:
 *   1. Start with: node --import ./dist/config/register-loader.js dist/index.js
 *   2. Set DB_MODE=sqlite in environment
 *   The loader intercepts `import mongoose` → returns our SQLite shim
 */

export type DbMode = 'mongodb' | 'sqlite';

export function getDbMode(): DbMode {
  return (process.env.DB_MODE || 'mongodb') as DbMode;
}

export async function connectDatabase(): Promise<void> {
  const mode = getDbMode();

  if (mode === 'sqlite') {
    const { initSQLite } = await import('./sqlite-adapter.js');
    const { createTables } = await import('./sqlite-schema.js');
    initSQLite();
    createTables();
    console.log('Connected to SQLite (offline mode)');

    // Seed admin user if no users exist
    try {
      const { getDB, ObjectId } = await import('./sqlite-adapter.js');
      const db = getDB();
      const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
      if (userCount === 0) {
        const bcrypt = await import('bcrypt');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('admin123', salt);
        const id = new ObjectId().toString();
        db.prepare(`INSERT INTO users (_id, username, passwordHash, fullName, role, isActive, createdAt, updatedAt, syncVersion, isDeleted) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0, 0)`)
          .run(id, 'admin', hash, 'Super Admin', 'ADMIN', 1);
        console.log('  ✓ Admin user seeded (admin / admin123)');
      }
    } catch (e: any) {
      console.error('  ✗ Admin seed:', e.message?.substring(0, 100));
    }

    // Initialize asset accounts for SQLite
    try {
      const { getDB, ObjectId } = await import('./sqlite-adapter.js');
      const db = getDB();
      for (const acct of ['CASH', 'CHECK', 'GCASH', 'BANK']) {
        const existing = db.prepare('SELECT _id FROM asset_accounts WHERE accountType = ?').get(acct);
        if (!existing) {
          db.prepare(`INSERT INTO asset_accounts (_id, accountType, balance, transactions, updatedAt, syncVersion) VALUES (?, ?, 0, '[]', datetime('now'), 0)`)
            .run(new ObjectId().toString(), acct);
        }
      }
      console.log('  ✓ Asset accounts initialized (SQLite)');
    } catch (e: any) {
      console.error('  ✗ Asset accounts init (SQLite):', e.message?.substring(0, 100));
    }
  } else {
    const { connectDatabase: connectMongo } = await import('./database.js');
    await connectMongo();
  }
}

export async function disconnectDatabase(): Promise<void> {
  const mode = getDbMode();
  if (mode === 'sqlite') return;
  const { disconnectDatabase: disconnectMongo } = await import('./database.js');
  await disconnectMongo();
}
