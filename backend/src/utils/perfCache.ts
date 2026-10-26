type CacheEntry<T = any> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();

export function getCache<T = any>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCache<T = any>(key: string, value: T, ttlMs: number): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function makeCacheKey(prefix: string, query: Record<string, any>): string {
  const sorted = Object.keys(query || {})
    .sort()
    .map((k) => `${k}:${String((query as any)[k])}`)
    .join('|');
  return `${prefix}|${sorted}`;
}
