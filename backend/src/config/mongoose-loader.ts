/**
 * Custom ESM loader hook that intercepts `import mongoose from 'mongoose'`
 * and returns our SQLite shim instead.
 */

import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

export async function resolve(specifier: string, context: any, nextResolve: any) {
  // Intercept mongoose → our SQLite shim
  if (specifier === 'mongoose' && process.env.DB_MODE === 'sqlite') {
    return {
      shortCircuit: true,
      url: new URL('./mongoose-shim.js', import.meta.url).href,
    };
  }

  // Try default resolution first
  try {
    return await nextResolve(specifier, context);
  } catch (err: any) {
    // If module not found and it's a relative import without .js, try adding .js
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.js')) {
      try {
        return await nextResolve(specifier + '.js', context);
      } catch {
        // If .js doesn't work either, try /index.js
        try {
          return await nextResolve(specifier + '/index.js', context);
        } catch {
          throw err; // Throw original error
        }
      }
    }
    throw err;
  }
}
