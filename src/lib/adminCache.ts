/**
 * Module-level in-memory cache that survives React component unmounts.
 * Data lives as long as the browser tab is open (JS module lifecycle).
 *
 * Pattern: stale-while-revalidate
 *  1. On mount → read cache → show data instantly (no loading spinner)
 *  2. In background → revalidate from DB → update cache + component state
 *  3. Real-time events → patch individual records in cache + component state
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // ms
}

const _store: Record<string, CacheEntry<unknown>> = {};
const _subs: Record<string, Set<(d: unknown) => void>> = {};

// Cache keys — import these in components
export const CACHE_ORDERS     = "admin:orders";
export const CACHE_DASH_STATS = "admin:dash:stats";
export const CACHE_DASH_FIN   = "admin:dash:financials";
export const CACHE_USERS      = "admin:users";

/** Return cached value, or null if not present */
export function cacheGet<T>(key: string): T | null {
  const entry = _store[key] as CacheEntry<T> | undefined;
  return entry ? entry.data : null;
}

/** True when there is no entry OR the entry is older than its TTL */
export function cacheIsStale(key: string): boolean {
  const entry = _store[key];
  if (!entry) return true;
  return Date.now() - entry.timestamp > entry.ttl;
}

/** Write a value and notify all subscribers */
export function cacheSet<T>(key: string, data: T, ttl = 60_000): void {
  _store[key] = { data, timestamp: Date.now(), ttl };
  (_subs[key] as Set<(d: T) => void> | undefined)?.forEach(fn => fn(data));
}

/**
 * Upsert or delete a single item (by `.id`) inside a cached array.
 * Returns the new array (or null if the key isn't cached yet).
 */
export function cachePatchItem<T extends { id: string }>(
  key: string,
  item: T,
  mode: "upsert" | "delete" = "upsert",
): T[] | null {
  const arr = cacheGet<T[]>(key);
  if (!arr) return null;

  let next: T[];
  if (mode === "delete") {
    next = arr.filter(x => x.id !== item.id);
  } else {
    const idx = arr.findIndex(x => x.id === item.id);
    if (idx >= 0) {
      next = [...arr];
      next[idx] = item;
    } else {
      next = [item, ...arr]; // INSERT → prepend newest first
    }
  }

  const entry = _store[key];
  if (entry) _store[key] = { ...entry, data: next };
  (_subs[key] as Set<(d: T[]) => void> | undefined)?.forEach(fn => fn(next));
  return next;
}

/** Subscribe to cache writes for a key. Returns an unsubscribe function. */
export function cacheSubscribe<T>(key: string, fn: (d: T) => void): () => void {
  if (!_subs[key]) _subs[key] = new Set();
  (_subs[key] as Set<(d: T) => void>).add(fn);
  return () => (_subs[key] as Set<(d: T) => void>)?.delete(fn);
}

/** Force a cache entry to be considered stale (triggers revalidation on next mount) */
export function cacheInvalidate(key: string): void {
  const entry = _store[key];
  if (entry) _store[key] = { ...entry, timestamp: 0 };
}
