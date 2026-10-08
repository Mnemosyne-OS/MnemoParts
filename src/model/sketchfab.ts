/**
 * sketchfab.ts — searching Sketchfab's public catalogue from Parts.
 *
 * The search needs no account and returns, per model, its name, author,
 * licence, thumbnails and page. Downloading needs the person's own Sketchfab
 * login through an app registered with Sketchfab, which Mnemosyne OS is not
 * yet: so each result opens its page in the browser, the person downloads the
 * GLB there, and drops it into Parts.
 *
 * Sketchfab's integration rules ask an app to show each model's licence and
 * author with a link to the model, and to say the models come from Sketchfab.
 * The page does all three.
 *
 * Nothing is sent before the person searches: the catalogue is asked only
 * when they press Enter, and only for what they typed.
 */
export const API_ORIGIN = 'https://api.sketchfab.com';
export const PAGE_SIZE = 24;
export const SEARCH_TIMEOUT_MS = 15_000;

export type SketchfabModel = {
  uid: string;
  name: string;
  author: string;
  authorUrl?: string;
  licence: string;
  pageUrl: string;
  thumb?: string;
  faces?: number;
  /** Size of the GLB download, when Sketchfab says it. */
  glbBytes?: number;
};

export type SearchPage = { models: SketchfabModel[]; next: string | null };

/** The search URL for a query: downloadable models only, since only those can come into Parts. */
export function searchUrl(query: string): string {
  const u = new URL('/v3/search', API_ORIGIN);
  u.searchParams.set('type', 'models');
  u.searchParams.set('downloadable', 'true');
  u.searchParams.set('count', String(PAGE_SIZE));
  u.searchParams.set('q', query.trim());
  return u.toString();
}

/** A « next page » URL is followed only when it stays on Sketchfab's API. */
export function safeNext(next: unknown): string | null {
  if (typeof next !== 'string') return null;
  try {
    const u = new URL(next);
    return u.origin === API_ORIGIN && u.pathname === '/v3/search' ? u.toString() : null;
  } catch (e) {
    // An unreadable link is no next page: the list ends there, and the console says why.
    console.warn('[parts] Sketchfab next link unreadable', next, e);
    return null;
  }
}

/** The smallest thumbnail at least `min` pixels wide, or the largest there is. */
export function pickThumb(images: unknown, min = 320): string | undefined {
  if (!Array.isArray(images)) return undefined;
  const ok = images
    .filter((i): i is { url: string; width: number } => !!i && typeof i.url === 'string' && typeof i.width === 'number' && i.url.startsWith('https://'))
    .sort((a, b) => a.width - b.width);
  return (ok.find(i => i.width >= min) ?? ok[ok.length - 1])?.url;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Read one page of results. A result without a name, a page or a licence is left out. */
export function parsePage(json: unknown): SearchPage {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const results = Array.isArray(o.results) ? o.results : [];
  const models: SketchfabModel[] = [];
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    const m = r as Record<string, unknown>;
    const uid = str(m.uid);
    const name = str(m.name);
    const pageUrl = str(m.viewerUrl);
    const licence = str((m.license as Record<string, unknown> | undefined)?.label);
    if (!uid || !name || !pageUrl || !pageUrl.startsWith('https://sketchfab.com/') || !licence) continue;
    const user = (m.user && typeof m.user === 'object' ? m.user : {}) as Record<string, unknown>;
    const archives = (m.archives && typeof m.archives === 'object' ? m.archives : {}) as Record<string, unknown>;
    const glb = archives.glb && typeof archives.glb === 'object' ? (archives.glb as Record<string, unknown>) : {};
    const profile = str(user.profileUrl);
    const thumb = pickThumb((m.thumbnails as Record<string, unknown> | undefined)?.images);
    const faces = num(m.faceCount);
    const glbBytes = num(glb.size);
    models.push({
      uid, name, licence, pageUrl,
      author: str(user.displayName) ?? str(user.username) ?? '—',
      ...(profile && profile.startsWith('https://sketchfab.com/') ? { authorUrl: profile } : {}),
      ...(thumb ? { thumb } : {}),
      ...(faces !== undefined ? { faces } : {}),
      ...(glbBytes !== undefined ? { glbBytes } : {}),
    });
  }
  return { models, next: safeNext(o.next) };
}

/** Fetch one page: the first for a query, or a « next » link from a previous page. */
export async function fetchPage(url: string, signal?: AbortSignal): Promise<SearchPage> {
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new Error(`Sketchfab ${res.status}`);
  return parsePage(await res.json());
}

/** 20 425 132 bytes → « 19.5 MB », in the reader's own number format. */
export function formatBytes(bytes: number, lang: string): string {
  const mb = bytes / (1024 * 1024);
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB`;
}
