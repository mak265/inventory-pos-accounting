/**
 * Registers the custom ESM loader for SQLite mode.
 * Use with: node --import ./dist/config/register-loader.js
 */
import { register } from 'node:module';

if (process.env.DB_MODE === 'sqlite') {
  register('./mongoose-loader.js', import.meta.url);
}
