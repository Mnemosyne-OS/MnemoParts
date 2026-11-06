/**
 * partsAgent.ts — what an agent may do in Parts (doc 149), as plain functions over the app's own
 * state and its own moves. Declared in `mnemo-plugin.json` › agentActions, served by
 * `PartsAgentActions` while the main window is open (a detached window serves nothing: one
 * window answers, so an agent never drives two copies of the same model).
 *
 * 🚨 Every move is the one the person's own control makes: a part is selected as a row of the
 * list is, hidden and isolated as the Hide and Isolate buttons do (on the selected part), the
 * explosion through the slider's and the mode's setters, a name and a note through the same
 * record change as the editor (`withName`, `withNote`), a model through its tab or its library
 * row, the sheet through the « keep » button. So the person sees the 3D model move.
 *
 * 🚨 A name or a note answers only once the store has written it: an unread store refuses
 * (`STORE_NOT_READY`), never a write that would erase the names of every other model.
 *
 * 🚨 A part or a model is named the way a person says it (`agentFind`): the orb plans a spoken
 * sentence without reading Parts first. Several matches are refused with their names
 * (AMBIGUOUS), never the first one taken; no match lists the names that exist.
 *
 * Refusals throw `CODE: reason`, and an unknown name says how to list the right ones.
 */
import type { LibraryEntry } from './model/library';
import type { ModelRecord } from './model/note';
import type { ExplodeMode } from './viewer/Viewer';
import { ambiguous, findNamed, fold, listed, matchNamed, notFound, type Named } from './agentFind';

/** One row of the parts list, as the app draws it. */
export interface AgentPart { raw: string; name: string; own: boolean; decoded: boolean; note: string }

/** The memory sheet's last outcome, as the « keep » button shows it. */
export type KeepOutcome =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; vault: string; unlocked: boolean }
  | { kind: 'error'; text: string };

/** The app's state and its own moves, read fresh at every call. */
export interface PartsAgentContext {
  tabs: { id: string; name: string; path: string | null; parts: number }[];
  activeTab: string | null;
  /** The file being read right now, or null. */
  reading: string | null;
  /** The last failure the status line shows, or null. */
  failure: string | null;
  parts: AgentPart[];
  record: ModelRecord;
  selected: number;
  hidden: ReadonlySet<number>;
  explode: number;
  mode: ExplodeMode;
  store: 'none' | 'ok' | 'error';
  memory: KeepOutcome['kind'];
  library: readonly LibraryEntry[];
  select: (i: number) => void;
  setHidden: (s: Set<number>) => void;
  setExplode: (v: number) => void;
  setMode: (m: ExplodeMode) => void;
  /** Writes the record to the store; rejects when the store refuses. */
  writeRecord: (next: ModelRecord) => Promise<void>;
  switchTo: (tabId: string) => void;
  openEntry: (e: LibraryEntry) => void;
  keep: () => Promise<KeepOutcome>;
  /** Closes a tab, as its × does. */
  closeTab: (tabId: string) => void;
  /** The screen on show: the model, or the library, the sources or Sketchfab over it. */
  view: PartsView;
  setView: (v: PartsView) => void;
  /** The parts list's filter field. */
  setFilter: (text: string) => void;
}

/** The screens a person switches between with the side buttons. */
export const VIEWS = ['model', 'library', 'sources', 'sketchfab'] as const;
export type PartsView = (typeof VIEWS)[number];
/** The longest filter: what the manifest declares as `text`'s maxLength. */
export const FILTER_MAX = 200;

/** How many parts `parts` answers at most: what the manifest declares as `limit`'s maximum. */
export const PARTS_LIMIT = { min: 1, max: 500, default: 100 } as const;
/** The longest note: what the manifest declares as `note`'s maxLength. */
export const NOTE_MAX = 4000;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The record with a part's own name set; null when nothing changes (the editor's rule). */
export function withName(record: ModelRecord, raw: string, value: string): ModelRecord | null {
  if ((record.names[raw] ?? '') === value.trim()) return null;
  return { ...record, names: { ...record.names, [raw]: value.trim() } };
}

/** The record with a part's note set; null when nothing changes. */
export function withNote(record: ModelRecord, raw: string, value: string): ModelRecord | null {
  if ((record.notes[raw] ?? '') === value) return null;
  return { ...record, notes: { ...record.notes, [raw]: value } };
}

/** A whole number of rows inside the declared limits; anything else is refused, never clamped. */
export function readLimit(v: unknown): number {
  if (v === undefined || v === null) return PARTS_LIMIT.default;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < PARTS_LIMIT.min || v > PARTS_LIMIT.max) {
    throw new Error(`BAD_ARG: limit must be a whole number from ${PARTS_LIMIT.min} to ${PARTS_LIMIT.max}`);
  }
  return v;
}

/** The parts as `agentFind` reads them: a part answers to its name and to its factory code. */
function partEntries(parts: readonly AgentPart[]): Named<number>[] {
  return parts.map((p, i) => ({ item: i, id: p.raw, names: [p.name, p.raw], label: `${i + 1} (${p.name})` }));
}

/**
 * A part by its number in the list (from 1, as an agent counts), its factory code, or the
 * words a person says for its name (« le roulement », « boulon 2 »). A fragment of a code
 * (« B-10 ») is the last try. Several candidates are AMBIGUOUS with their numbers, never the
 * first one.
 */
export function resolvePart(parts: readonly AgentPart[], ref: unknown): number {
  if (!parts.length) throw new Error('NO_MODEL: no model is open. Use openModel, or ask the person to open a file');
  if (typeof ref === 'number') {
    if (!Number.isInteger(ref) || ref < 1 || ref > parts.length) throw new Error(`BAD_ARG: part numbers run from 1 to ${parts.length}`);
    return ref - 1;
  }
  const said = str(ref);
  const r = fold(said);
  if (!r) throw new Error('BAD_ARG: name a part by its number, code or name');
  const entries = partEntries(parts);
  const byCode = entries.filter((e) => fold(parts[e.item]!.raw) === r);
  if (byCode.length === 1) return byCode[0]!.item;
  if (byCode.length > 1) throw ambiguous(said, 'part', byCode.map((e) => e.label));
  const m = matchNamed(entries, said);
  if (m.kind === 'one') return m.item;
  if (m.kind === 'many') throw ambiguous(said, 'part', m.labels);
  const pool = entries.filter((e) => fold(parts[e.item]!.raw).includes(r) || fold(parts[e.item]!.name).includes(r));
  if (pool.length === 1) return pool[0]!.item;
  if (pool.length > 1) throw ambiguous(said, 'part', pool.map((e) => e.label));
  throw notFound(said, { code: 'NO_PART', noun: 'part' }, entries.map((e) => e.label));
}

/** A model the person can open: a tab already open, or a library row to read again. */
type ModelRef = { tab: PartsAgentContext['tabs'][number] } | { entry: LibraryEntry };

/** The open tabs, then the library rows that are not open, as `agentFind` reads them. */
function modelEntries(c: PartsAgentContext): Named<ModelRef>[] {
  const tabs: Named<ModelRef>[] = c.tabs.map((t) => ({ item: { tab: t }, id: t.id, names: [t.name], label: t.name }));
  const closed: Named<ModelRef>[] = c.library
    .filter((e) => !c.tabs.some((t) => (e.path !== undefined ? t.path === e.path : t.name === e.name)))
    .map((e) => ({ item: { entry: e }, id: e.key, names: [e.name], label: e.name }));
  return [...tabs, ...closed];
}

/**
 * A model by its tab id, its library key, its path, or the words a person says for it
 * (« le moteur » for `moteur_v2.step`). An open tab and its library row are one model.
 */
function resolveModel(c: PartsAgentContext, ref: string): ModelRef {
  const r = fold(ref);
  if (!r) throw new Error('BAD_ARG: name the model');
  const tabByPath = c.tabs.filter((t) => t.path !== null && fold(t.path) === r);
  if (tabByPath.length === 1) return { tab: tabByPath[0]! };
  const entryByPath = c.library.filter((e) => e.path !== undefined && fold(e.path) === r);
  if (entryByPath.length === 1) return { entry: entryByPath[0]! };
  const entries = modelEntries(c);
  // The same file name opened from two folders: refused with the paths, which tell them apart.
  const sameName = entries.filter((e) => fold(e.label) === r);
  if (sameName.length > 1) {
    throw ambiguous(ref, 'model', sameName.map((e) => ('tab' in e.item ? (e.item.tab.path ?? e.item.tab.id) : (e.item.entry.path ?? e.item.entry.key))));
  }
  return findNamed(entries, ref, { code: 'NO_MODEL', noun: 'model' });
}

/** An OPEN model (a tab), by the same rules; a model only in the library is not open. */
function resolveTab(c: PartsAgentContext, ref: string): PartsAgentContext['tabs'][number] {
  if (!c.tabs.length) throw new Error('NO_MODEL: no model is open');
  const found = resolveModel(c, ref);
  if ('tab' in found) return found.tab;
  throw new Error(`NOT_OPEN: "${found.entry.name}" is not open; open models: ${listed(c.tabs.map((t) => t.name))}`);
}

/**
 * The part an action names: `number` or `part`, never both. Neither falls back to the selected
 * part only where the button itself acts on the selection (`orSelected`).
 */
export function partOf(c: PartsAgentContext, args: Record<string, unknown>, orSelected = false): number {
  const hasNumber = args.number !== undefined && args.number !== null;
  const hasPart = str(args.part) !== '';
  if (hasNumber && hasPart) throw new Error('BAD_ARG: give number or part, not both');
  if (hasNumber) {
    if (typeof args.number !== 'number') throw new Error('BAD_ARG: number must be a whole number');
    return resolvePart(c.parts, args.number);
  }
  if (hasPart) return resolvePart(c.parts, args.part);
  if (!orSelected) throw new Error('MISSING_ARG: give number or part');
  if (c.selected < 0 || c.selected >= c.parts.length) throw new Error('NOTHING_SELECTED: no part is selected. Give number or part');
  return c.selected;
}

function storeReady(c: PartsAgentContext): void {
  if (c.store !== 'ok') throw new Error(`STORE_NOT_READY: ${c.store === 'error' ? 'the names of this model could not be read, so nothing is written over them' : 'the names of this model are not read yet'}; ask again in a moment`);
}

/** A move on the 3D model brings it back in front of the library or the sources, so it is seen. */
function onModel(c: PartsAgentContext): void {
  if (c.view !== 'model') c.setView('model');
}

function notReading(c: PartsAgentContext): void {
  if (c.reading) throw new Error(`BUSY: "${c.reading}" is being read; ask again when models says it is open`);
}

/** The handlers, keyed by the action ids `mnemo-plugin.json` declares. */
export function partsAgentHandlers(ctx: () => PartsAgentContext) {
  // agent-actions:begin
  return {
    models: () => {
      const c = ctx();
      return {
        open: c.tabs.map((t) => ({ ...t, active: t.id === c.activeTab })),
        reading: c.reading,
        failure: c.failure,
        library: c.library.map((e) => ({ name: e.name, path: e.path ?? null, key: e.key, parts: e.parts, reopens: !!e.path })),
      };
    },
    parts: (args: Record<string, unknown>) => {
      const c = ctx();
      const limit = readLimit(args.limit);
      const q = fold(str(args.text));
      const rows = c.parts
        .map((p, i) => ({ number: i + 1, name: p.name, code: p.raw, ownName: p.own, note: p.note || null, hidden: c.hidden.has(i), selected: i === c.selected }))
        .filter((p) => !q || fold(p.name).includes(q) || fold(p.code).includes(q));
      return {
        model: c.tabs.find((t) => t.id === c.activeTab)?.name ?? null,
        total: rows.length,
        explode: c.explode,
        mode: c.mode,
        namesKept: c.store === 'ok',
        parts: rows.slice(0, limit),
      };
    },
    selectPart: (args: Record<string, unknown>) => {
      const c = ctx();
      const i = partOf(c, args);
      onModel(c);
      c.select(i);
      return { selected: { number: i + 1, name: c.parts[i]!.name } };
    },
    showParts: (args: Record<string, unknown>) => {
      const c = ctx();
      const how = str(args.how);
      if (!['hide', 'isolate', 'show', 'all'].includes(how)) throw new Error('BAD_ARG: how is hide, isolate, show or all');
      if (how === 'all') {
        if (!c.parts.length) throw new Error('NO_MODEL: no model is open');
        onModel(c);
        c.setHidden(new Set());
        return { hidden: 0 };
      }
      // Hide and Isolate act on the SELECTED part, as their buttons do: the part is selected first.
      const i = partOf(c, args, true);
      onModel(c);
      c.select(i);
      // « show » brings back one hidden part: the list's own set, minus that part.
      const next = how === 'isolate'
        ? new Set(c.parts.map((_, k) => k).filter((k) => k !== i))
        : how === 'show'
          ? new Set([...c.hidden].filter((k) => k !== i))
          : new Set([...c.hidden, i]);
      c.setHidden(next);
      return { hidden: next.size, part: { number: i + 1, name: c.parts[i]!.name } };
    },
    explode: (args: Record<string, unknown>) => {
      const c = ctx();
      if (!c.parts.length) throw new Error('NO_MODEL: no model is open');
      const amount = args.amount;
      if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1)) throw new Error('BAD_ARG: amount runs from 0 (assembled) to 1 (fully open)');
      const mode = str(args.mode);
      if (mode && mode !== 'layers' && mode !== 'radial') throw new Error('BAD_ARG: mode is layers or radial');
      if (amount === undefined && !mode) throw new Error('MISSING_ARG: explode needs amount or mode');
      onModel(c);
      if (mode) c.setMode(mode as ExplodeMode);
      if (typeof amount === 'number') c.setExplode(amount);
      return { explode: typeof amount === 'number' ? amount : c.explode, mode: mode || c.mode };
    },
    renamePart: async (args: Record<string, unknown>) => {
      const c = ctx();
      const i = partOf(c, args);
      storeReady(c);
      const raw = c.parts[i]!.raw;
      const next = withName(c.record, raw, typeof args.name === 'string' ? args.name : '');
      onModel(c);
      c.select(i);
      if (next) await c.writeRecord(next);
      return { number: i + 1, code: raw, name: next ? next.names[raw] || null : c.record.names[raw] || null, changed: !!next };
    },
    notePart: async (args: Record<string, unknown>) => {
      const c = ctx();
      const i = partOf(c, args);
      storeReady(c);
      const note = typeof args.note === 'string' ? args.note : '';
      if (note.length > NOTE_MAX) throw new Error(`BAD_ARG: a note holds at most ${NOTE_MAX} characters`);
      const raw = c.parts[i]!.raw;
      const next = withNote(c.record, raw, note);
      onModel(c);
      c.select(i);
      if (next) await c.writeRecord(next);
      return { number: i + 1, code: raw, changed: !!next };
    },
    openModel: (args: Record<string, unknown>) => {
      const c = ctx();
      notReading(c);
      const ref = str(args.model);
      const found = resolveModel(c, ref);
      if ('tab' in found) {
        c.switchTo(found.tab.id);
        return { shown: found.tab.name, started: false };
      }
      const { entry } = found;
      const open = c.tabs.find((t) => t.path !== null && t.path === entry.path);
      if (open) {
        c.switchTo(open.id);
        return { shown: open.name, started: false };
      }
      // A dropped file kept no path: only dropping it again can reopen it.
      if (!entry.path) throw new Error(`NO_PATH: "${entry.name}" was dropped, not picked, so its file is not known; the person must drop it again`);
      c.openEntry(entry);
      return { opening: entry.name, started: true, note: 'A large file takes seconds; models says when it is open' };
    },
    closeModel: (args: Record<string, unknown>) => {
      const c = ctx();
      const tab = resolveTab(c, str(args.model));
      // A dropped file has no path: closed, it comes back only if the person drops it again.
      if (tab.path === null) throw new Error(`NO_PATH: "${tab.name}" was dropped, not picked, so closing it would lose it until the person drops it again; the person closes it with the × of its tab`);
      c.closeTab(tab.id);
      return { closed: tab.name, open: c.tabs.filter((t) => t.id !== tab.id).map((t) => t.name) };
    },
    showView: (args: Record<string, unknown>) => {
      const c = ctx();
      const view = str(args.view);
      if (!(VIEWS as readonly string[]).includes(view)) throw new Error(`BAD_ARG: view is ${VIEWS.join(', ')}`);
      if (view === 'model' && !c.tabs.length) throw new Error('NO_MODEL: no model is open. Use openModel, or show the library');
      c.setView(view as PartsView);
      return { view };
    },
    closeView: () => {
      const c = ctx();
      // The library, the sources and Sketchfab cover the model: closing them is the « back » button.
      if (c.view === 'model') return { closed: null, view: 'model' };
      const was = c.view;
      c.setView('model');
      return { closed: was, view: 'model' };
    },
    filterParts: (args: Record<string, unknown>) => {
      const c = ctx();
      if (!c.parts.length) throw new Error('NO_MODEL: no model is open');
      const text = str(args.text);
      if (text.length > FILTER_MAX) throw new Error(`BAD_ARG: the filter holds at most ${FILTER_MAX} characters`);
      c.setFilter(text);
      c.setView('model');
      // What the list's own filter keeps: its name or its code holds the text, case aside.
      const q = text.toLowerCase();
      const shown = c.parts.filter((p) => !q || p.name.toLowerCase().includes(q) || p.raw.toLowerCase().includes(q));
      return { filter: text || null, shown: shown.length, of: c.parts.length, first: shown.slice(0, 12).map((p) => p.name) };
    },
    keepSheet: async () => {
      const c = ctx();
      if (!c.parts.length) throw new Error('NO_MODEL: no model is open');
      if (c.memory === 'saving') throw new Error('BUSY: the sheet is already being kept');
      const out = await c.keep();
      if (out.kind === 'error') throw new Error(`NOT_KEPT: ${out.text}`);
      if (out.kind !== 'done') throw new Error('NOT_KEPT: the sheet was not written');
      return { vault: out.vault, unlocked: out.unlocked };
    },
  };
  // agent-actions:end
}
