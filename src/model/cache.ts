/**
 * cache.ts — a STEP file read once opens in a second the next time.
 *
 * Reading a 21 MB STEP takes about 30 s, and nothing of that work used to be
 * kept: only names and notes were. Now the parts, once read, are written as a
 * GLB (the three.js scene, part names included) into the frame's IndexedDB,
 * under the SHA-256 of the file's bytes. The same bytes open from the cache;
 * a file changed by even one byte is read again, whatever its name or size.
 *
 * The cache is a convenience, never a source: a cache that cannot be opened,
 * read or written is said in the console and the file is read the long way.
 * It keeps the most recently used models up to a byte budget.
 */
export type CacheEntry = {hash: string; glb: ArrayBuffer; name: string; savedAt: number; usedAt: number};
export type CacheMeta = {hash: string; size: number; usedAt: number};

/** What the cache may hold in total. */
export const CACHE_BUDGET_BYTES = 400 * 1024 * 1024;
/** Opening the database or one read/write that has not answered in this long is given up. */
export const CACHE_TIMEOUT_MS = 15_000;

const DB = 'mnemo-parts-cache';
const STORE = 'models';

/** The hex SHA-256 of the bytes. Run before the bytes are handed to a worker: a transfer empties them. */
export async function hashBytes(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(buf));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Which entries to drop so the newest fit in the budget: the least recently
 * used go first. `keep` (the model being written) is never dropped.
 */
export function evictions(entries: readonly CacheMeta[], budget: number, keep: string): string[] {
  const order = [...entries].sort((a, b) => b.usedAt - a.usedAt);
  let total = 0;
  const drop: string[] = [];
  for (const e of order) {
    if (e.hash !== keep && total + e.size > budget) { drop.push(e.hash); continue; }
    total += e.size;
  }
  return drop;
}

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: no answer`)), CACHE_TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= withTimeout(new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, {keyPath: 'hash'}); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB unavailable'));
    r.onblocked = () => reject(new Error('IndexedDB blocked'));
  }), 'cache open').catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

/** The cached GLB for these bytes, or null. Marks it as just used. */
export async function readCached(hash: string): Promise<ArrayBuffer | null> {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const hit = await withTimeout(request(store.get(hash) as IDBRequest<CacheEntry | undefined>), 'cache read');
  if (!hit) return null;
  store.put({...hit, usedAt: Date.now()});
  return hit.glb;
}

/** Keep a model's GLB, then drop the least recently used beyond the budget. */
export async function writeCached(hash: string, name: string, glb: ArrayBuffer): Promise<void> {
  const db = await open();
  const now = Date.now();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  await withTimeout(request(store.put({hash, glb, name, savedAt: now, usedAt: now} satisfies CacheEntry)), 'cache write');
  const all = await withTimeout(request(store.getAll() as IDBRequest<CacheEntry[]>), 'cache list');
  for (const h of evictions(all.map(e => ({hash: e.hash, size: e.glb.byteLength, usedAt: e.usedAt})), CACHE_BUDGET_BYTES, hash)) {
    store.delete(h);
  }
}
