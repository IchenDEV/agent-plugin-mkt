import { LRUCache } from "lru-cache";

type CatalogPromise = Promise<unknown>;

const globalForCatalogCache = globalThis as unknown as {
  catalogQueryCache?: LRUCache<string, CatalogPromise>;
};

const catalogQueryCache =
  globalForCatalogCache.catalogQueryCache ??
  new LRUCache<string, CatalogPromise>({
    // Query strings are deliberately excluded by callers. This cap bounds the
    // remaining combination of pages, filters, slugs, and report snapshots.
    max: 320,
    ttl: process.env.NODE_ENV === "production" ? 6 * 60 * 60 * 1000 : 5_000,
  });

globalForCatalogCache.catalogQueryCache = catalogQueryCache;

/**
 * Deduplicate immutable catalog reads across requests in a warm server process.
 * Rejected promises are evicted immediately so a transient database error is
 * never retained for the full TTL.
 */
export function cacheCatalogQuery<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = catalogQueryCache.get(key);
  if (existing) return existing as Promise<T>;

  const pending = load().catch((error: unknown) => {
    catalogQueryCache.delete(key);
    throw error;
  });
  catalogQueryCache.set(key, pending);
  return pending;
}
