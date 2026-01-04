// src/lib/cache.ts
// Simple in-memory + sessionStorage cache to reduce reads/invocations

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

/**
 * Get cached data or fetch it if expired/missing.
 * @param key - Unique cache key
 * @param fetcher - Function to fetch data if cache miss
 * @param ttlMs - Time-to-live in milliseconds (default: 5 minutes)
 * @param useSessionStorage - Also persist to sessionStorage (survives page refreshes within tab)
 */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 5 * 60 * 1000,
  useSessionStorage: boolean = true
): Promise<T> {
  const now = Date.now();

  // Check memory cache first
  const memEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memEntry && memEntry.expiresAt > now) {
    return memEntry.data;
  }

  // Check sessionStorage
  if (useSessionStorage) {
    try {
      const stored = sessionStorage.getItem(`cache:${key}`);
      if (stored) {
        const parsed: CacheEntry<T> = JSON.parse(stored);
        if (parsed.expiresAt > now) {
          // Restore to memory cache
          memoryCache.set(key, parsed);
          return parsed.data;
        } else {
          sessionStorage.removeItem(`cache:${key}`);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  // Fetch fresh data
  const data = await fetcher();
  const entry: CacheEntry<T> = { data, expiresAt: now + ttlMs };

  // Store in memory
  memoryCache.set(key, entry);

  // Store in sessionStorage
  if (useSessionStorage) {
    try {
      sessionStorage.setItem(`cache:${key}`, JSON.stringify(entry));
    } catch {
      // Storage full or unavailable
    }
  }

  return data;
}

/**
 * Invalidate a specific cache key
 */
export function invalidateCache(key: string): void {
  memoryCache.delete(key);
  try {
    sessionStorage.removeItem(`cache:${key}`);
  } catch {}
}

/**
 * Invalidate all cache entries matching a prefix
 */
export function invalidateCachePrefix(prefix: string): void {
  // Memory cache
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }

  // SessionStorage
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const storageKey = sessionStorage.key(i);
      if (storageKey?.startsWith(`cache:${prefix}`)) {
        keysToRemove.push(storageKey);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

/**
 * Clear all cached data
 */
export function clearAllCache(): void {
  memoryCache.clear();
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("cache:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

