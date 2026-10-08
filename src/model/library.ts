/**
 * library.ts — every model a person opened, as a catalogue they can sort,
 * search and reopen from.
 *
 * An entry is written each time a model opens, from what was MEASURED then:
 * its part count, how many parts carry a readable name, its layers. Names and
 * notes are not copied here: they stay in the per-model record, and the page
 * counts them when it draws the list, so the catalogue never disagrees with
 * the model.
 *
 * A file opened through the host picker carries its path and reopens in one
 * click. A dropped file may have no path: it stays in the catalogue with its
 * names and notes, and reopens by dropping it again. The two are the same
 * model when their name and size match (`modelKey`), so a dropped file opened
 * later through the picker gains its path instead of appearing twice.
 */
export type LibraryEntry = {
  /** `modelKey(name, bytes)`: the per-model record lives under it. */
  key: string;
  name: string;
  /** Absent for a file that was only ever dropped. */
  path?: string;
  bytes: number;
  parts: number;
  /** Parts whose code decoded to a readable name, when opened. */
  named: number;
  layers: number;
  firstOpenedAt: number;
  openedAt: number;
  opens: number;
};

export type SortBy = 'opened' | 'name' | 'parts' | 'notes' | 'folder';
export type SortDir = 'asc' | 'desc';

/** Beyond this many models, the ones opened longest ago leave the catalogue. */
export const LIBRARY_MAX = 300;

/** The folder holding a path, whatever its separators; '' when it has none. */
export function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut > 0 ? path.slice(0, cut) : '';
}

/** The file name at the end of a path. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export type Opened = {key: string; name: string; path?: string; bytes: number; parts: number; named: number; layers: number};

/** Record one opening: a new entry, or the same model opened again. */
export function recordOpen(list: readonly LibraryEntry[], o: Opened, now: number): LibraryEntry[] {
  const i = list.findIndex(e => (o.path && e.path === o.path) || e.key === o.key);
  const prev = i >= 0 ? list[i] : undefined;
  const entry: LibraryEntry = {
    key: o.key,
    name: o.name,
    // A path learned once is kept when the same model is later dropped.
    ...((o.path ?? prev?.path) ? {path: o.path ?? prev?.path} : {}),
    bytes: o.bytes,
    parts: o.parts,
    named: o.named,
    layers: o.layers,
    firstOpenedAt: prev?.firstOpenedAt ?? now,
    openedAt: now,
    opens: (prev?.opens ?? 0) + 1,
  };
  const rest = list.filter((_, j) => j !== i);
  return [entry, ...rest].sort((a, b) => b.openedAt - a.openedAt).slice(0, LIBRARY_MAX);
}

/** Take an entry out of the catalogue. The file and its names and notes are left alone. */
export function removeEntry(list: readonly LibraryEntry[], key: string): LibraryEntry[] {
  return list.filter(e => e.key !== key);
}

/** A file that no longer opens loses its path: it stays listed with its notes, and the click stops promising. */
export function forgetPath(list: readonly LibraryEntry[], path: string): LibraryEntry[] {
  return list.map(e => (e.path === path ? withoutPath(e) : e));
}

function withoutPath(e: LibraryEntry): LibraryEntry {
  const copy = {...e};
  delete copy.path;
  return copy;
}

/** Entries whose name or folder contains the query, ignoring case and accents. */
export function filterEntries(list: readonly LibraryEntry[], query: string): LibraryEntry[] {
  const q = fold(query.trim());
  if (!q) return [...list];
  return list.filter(e => fold(e.name).includes(q) || fold(e.path ? folderOf(e.path) : '').includes(q));
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Sort a copy. `notes` counts what the person wrote on a model (names and
 * notes), read from the per-model records by the caller. Ties fall back to
 * the most recently opened, so the order never depends on how the list was
 * stored.
 */
export function sortEntries(list: readonly LibraryEntry[], by: SortBy, dir: SortDir, notesOf: (key: string) => number): LibraryEntry[] {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (e: LibraryEntry): number | string => {
    switch (by) {
      case 'opened': return e.openedAt;
      case 'name': return e.name.toLowerCase();
      case 'parts': return e.parts;
      case 'notes': return notesOf(e.key);
      case 'folder': return (e.path ? folderOf(e.path) : '').toLowerCase();
    }
  };
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return c !== 0 ? sign * c : b.openedAt - a.openedAt;
  });
}

/** Read the catalogue from whatever the store returned. Anything malformed is dropped entry by entry. */
export function parseLibrary(x: unknown): LibraryEntry[] {
  if (!Array.isArray(x)) return [];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const out: LibraryEntry[] = [];
  for (const r of x) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.key !== 'string' || typeof o.name !== 'string') continue;
    const bytes = num(o.bytes); const parts = num(o.parts); const openedAt = num(o.openedAt);
    if (bytes === null || parts === null || openedAt === null) continue;
    out.push({
      key: o.key,
      name: o.name,
      ...(typeof o.path === 'string' && o.path ? {path: o.path} : {}),
      bytes,
      parts,
      named: num(o.named) ?? 0,
      layers: num(o.layers) ?? 0,
      firstOpenedAt: num(o.firstOpenedAt) ?? openedAt,
      openedAt,
      opens: num(o.opens) ?? 1,
    });
  }
  return out.slice(0, LIBRARY_MAX);
}
