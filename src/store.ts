/**
 * store.ts — names and notes per model, kept between sessions.
 *
 * They live in the host-side state mirror (doc 73): the cartridge's own blob,
 * capped at 256 KB, which `state.set` REPLACES whole. Every write therefore
 * reads, changes one model, and writes back, one write at a time.
 *
 * A write whose read failed is REFUSED, never sent with only its own model:
 * an unreadable store is not an empty one, and writing over it would erase
 * the names of every other model.
 */
import { MnemoCartridgeSDK } from '@mnemosyne_os/cartridge-sdk';
import { cleanRecord, parseRecord, type ModelRecord } from './model/note';
import { parseLibrary, type LibraryEntry } from './model/library';

export const APP_ID = '@mnemosyne-plugins/mnemo-parts';
/** Under the host's 256 KB cap, with room for the JSON around it. */
export const STORE_BUDGET_CHARS = 240_000;
/** Host calls that have not answered in this long are given up. */
export const HOST_TIMEOUT_MS = 15_000;

export type Invoke = <T = unknown>(action: string, payload?: Record<string, unknown>) => Promise<T>;

const sdk = new MnemoCartridgeSDK(APP_ID);
let invoke: Invoke = (action, payload) => sdk.invoke(action, payload);
/** Tests swap the host for a fake. */
export function setStoreInvoker(next: Invoke): void { invoke = next; }

export class StoreFullError extends Error {
  constructor() { super('store full'); }
}

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: no answer after ${HOST_TIMEOUT_MS / 1000} s`)), HOST_TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
}

async function readAll(): Promise<Record<string, unknown>> {
  const data = await withTimeout(invoke<unknown>('state.get'), 'state.get');
  return unwrapState(data);
}

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * The blob inside what `state.get` answers.
 *
 * The host answers `{ state, updatedAt }`, not the blob. Read as if it were
 * the blob, every write wrapped the previous answer one level deeper: the
 * library and the names were written, at a depth no read looked at, so
 * nothing came back after a reload. This takes the blob out of the envelope,
 * and drops the `state` / `updatedAt` pair those writes left inside it: the
 * newest data sits at the first level, beside the older copies nested below.
 */
export function unwrapState(data: unknown): Record<string, unknown> {
  if (!isObject(data)) return {};
  const blob = 'state' in data && 'updatedAt' in data ? data.state : data;
  if (!isObject(blob)) return {};
  const clean = { ...blob };
  if ('updatedAt' in clean && (clean.state === null || isObject(clean.state))) {
    delete clean.state;
    delete clean.updatedAt;
  }
  return clean;
}

function modelsOf(all: Record<string, unknown>): Record<string, unknown> {
  const m = all.models;
  return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

/** The record for one model; empty when it was never written. Rejects when the store cannot be read. */
export async function readModel(key: string): Promise<ModelRecord> {
  return parseRecord(modelsOf(await readAll())[key]);
}

let queue: Promise<unknown> = Promise.resolve();

/** Read the whole blob, change it, write it back: one change at a time, never over an unread store. */
function update(change: (all: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  const run = queue.then(async () => {
    const next = change(await readAll());
    if (JSON.stringify(next).length > STORE_BUDGET_CHARS) throw new StoreFullError();
    await withTimeout(invoke('state.set', { state: next }), 'state.set');
  });
  // The chain continues after a failure; the caller still sees it.
  queue = run.catch(() => undefined);
  return run;
}

/** Store one model's record, keeping every other model as it is on disk. */
export function writeModel(key: string, record: ModelRecord): Promise<void> {
  return update((all) => {
    const models = { ...modelsOf(all) };
    const clean = cleanRecord(record);
    if (Object.keys(clean.names).length || Object.keys(clean.notes).length) models[key] = clean;
    else delete models[key];
    return { ...all, models };
  });
}

/** The catalogue, and how many names and notes the person wrote on each model, in one read. */
export async function readLibrary(): Promise<{ library: LibraryEntry[]; written: Record<string, number> }> {
  const all = await readAll();
  const written: Record<string, number> = {};
  for (const [key, rec] of Object.entries(modelsOf(all))) {
    const r = parseRecord(rec);
    written[key] = Object.keys(r.names).length + Object.keys(r.notes).length;
  }
  return { library: parseLibrary(all.library), written };
}

/** Replace the catalogue. The short-lived `recent` list it replaces is dropped. */
export function writeLibrary(list: readonly LibraryEntry[]): Promise<void> {
  return update((all) => {
    const next: Record<string, unknown> = { ...all, library: list };
    delete next.recent;
    return next;
  });
}

/**
 * What a detached window opens. The window gets only a short instance token
 * in its URL; the model it is for waits here, under that token, and the new
 * window takes it (read, then removed) on its first read.
 */
export type Handoff = { key: string; name: string; path?: string; cache?: string };

function handoffsOf(all: Record<string, unknown>): Record<string, unknown> {
  const h = all.handoff;
  return h && typeof h === 'object' && !Array.isArray(h) ? (h as Record<string, unknown>) : {};
}

export function writeHandoff(instance: string, h: Handoff): Promise<void> {
  return update((all) => ({ ...all, handoff: { ...handoffsOf(all), [instance]: h } }));
}

/** The model a detached window was opened for, removed from the store as it is read; null when none. */
export async function takeHandoff(instance: string): Promise<Handoff | null> {
  // A box, not a let: TypeScript cannot see the assignment inside the callback.
  const found: { h: Handoff | null } = { h: null };
  await update((all) => {
    const map = { ...handoffsOf(all) };
    const h = map[instance] as Record<string, unknown> | undefined;
    if (h && typeof h.key === 'string' && typeof h.name === 'string') {
      found.h = {
        key: h.key, name: h.name,
        ...(typeof h.path === 'string' ? { path: h.path } : {}),
        ...(typeof h.cache === 'string' ? { cache: h.cache } : {}),
      };
    }
    delete map[instance];
    return { ...all, handoff: map };
  });
  return found.h;
}

/** Open a web page in the person's browser, through the host. */
export async function openExternal(url: string): Promise<void> {
  await withTimeout(invoke('shell.openExternal', { url }), 'shell.openExternal');
}

/** Open one more window of this cartridge. Main refuses past its ceiling, by name. */
export async function detachWindow(instance: string): Promise<void> {
  await withTimeout(invoke('plugins.detach', { instance }), 'plugins.detach');
}

/** The 3D formats the host picker offers, and reads as bytes. */
export const PICK_EXTENSIONS = ['step', 'stp', 'glb', 'gltf', 'obj', 'stl'];

let dialogChecked = false;

/**
 * The host's own file picker, opened in `startIn` (the folder of the last file
 * picked). The permission is re-read once: a manifest that gained
 * `dialog:open` is only enforced from the next start.
 */
export async function pickFile(startIn: string, filterName: string): Promise<string | null> {
  if (!dialogChecked) {
    const refreshed = await withTimeout(
      invoke<{ granted?: Record<string, boolean> }>('permissions.refresh', { permissions: ['dialog:open'] }),
      'permissions.refresh',
    );
    if (refreshed?.granted?.['dialog:open'] === false) throw new PermissionError();
    dialogChecked = true;
  }
  // No timeout here: the picker stays open as long as the person is choosing.
  const path = await invoke<string | null>('dialog.selectFile', {
    filters: [{ name: filterName, extensions: PICK_EXTENSIONS }],
    ...(startIn ? { startIn } : {}),
  });
  return typeof path === 'string' && path ? path : null;
}

/** Read a file the host picker returned, as bytes. Rejects with the host's own reason. */
export async function readHostFile(path: string): Promise<ArrayBuffer> {
  const res = await withTimeout(
    invoke<{ success: boolean; isBinary?: boolean; content?: string; error?: string }>('dialog.readFile', { filePath: path }),
    'dialog.readFile',
  );
  if (!res?.success || !res.content) throw new Error(res?.error || 'no content');
  return decodeDataUrl(res.content);
}

/** The bytes of a base64 data URL. */
export function decodeDataUrl(url: string): ArrayBuffer {
  const comma = url.indexOf(',');
  const bin = atob(comma >= 0 ? url.slice(comma + 1) : url);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Write the model sheet into this app's own sandbox vault, the house way
 * (Atlas `ReviewPanel`): the permission is re-read first, because a manifest
 * that gained `vault:write` is only enforced from the next start.
 */
export async function keepSheet(sheet: string): Promise<{ vault: string; unlocked: boolean }> {
  const refreshed = await withTimeout(
    invoke<{ granted?: Record<string, boolean> }>('permissions.refresh', { permissions: ['vault:write'] }),
    'permissions.refresh',
  );
  if (refreshed?.granted?.['vault:write'] === false) throw new PermissionError();
  const { vault, unlocked } = await withTimeout(invoke<{ vault: string; unlocked: boolean }>('vault.sandbox.ensure', {}), 'vault.sandbox.ensure');
  await withTimeout(invoke('social.ingest', { vault, content: sheet, spineType: SHEET_SPINE }), 'social.ingest');
  return { vault, unlocked };
}

/** The spine a model sheet is filed under. */
export const SHEET_SPINE = 'OBJECT_PARTS';

export class PermissionError extends Error {
  constructor() { super('vault:write not granted'); }
}
