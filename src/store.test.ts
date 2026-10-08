import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  unwrapState, decodeDataUrl, detachWindow, keepSheet, PermissionError, pickFile, readHostFile, readLibrary, readModel, setStoreInvoker, SHEET_SPINE,
  StoreFullError, STORE_BUDGET_CHARS, takeHandoff, writeHandoff, writeLibrary, writeModel,
} from './store';

let disk: Record<string, unknown>;
let calls: Array<{ action: string; payload?: Record<string, unknown> }>;

function host(overrides: Partial<Record<string, (p?: Record<string, unknown>) => unknown>> = {}) {
  setStoreInvoker(async <T,>(action: string, payload?: Record<string, unknown>) => {
    calls.push({ action, payload });
    if (overrides[action]) return overrides[action]!(payload) as T;
    // The real host answers an envelope, never the bare blob.
    if (action === 'state.get') return { state: disk, updatedAt: '2026-10-03T00:00:00.000Z' } as T;
    if (action === 'state.set') { disk = payload!.state as Record<string, unknown>; return undefined as T; }
    throw new Error(`unexpected ${action}`);
  });
}

beforeEach(() => {
  disk = {};
  calls = [];
  host();
});

describe('names and notes store', () => {
  it('keeps every other model when one is written', async () => {
    disk = { models: { other: { names: { a: 'A' }, notes: {} } }, unrelated: 1 };
    await writeModel('mine', { names: { b: 'B' }, notes: {} });
    expect(disk).toEqual({ unrelated: 1, models: { other: { names: { a: 'A' }, notes: {} }, mine: { names: { b: 'B' }, notes: {} } } });
    expect(await readModel('mine')).toEqual({ names: { b: 'B' }, notes: {} });
  });

  it('refuses to write when the store cannot be read, instead of writing over it', async () => {
    host({ 'state.get': () => { throw new Error('host down'); } });
    await expect(writeModel('mine', { names: { b: 'B' }, notes: {} })).rejects.toThrow('host down');
    expect(calls.some(c => c.action === 'state.set')).toBe(false);
  });

  it('removes a model whose names and notes were all cleared', async () => {
    disk = { models: { mine: { names: { b: 'B' }, notes: {} } } };
    await writeModel('mine', { names: { b: '' }, notes: {} });
    expect(disk).toEqual({ models: {} });
  });

  it('refuses a write that would pass the host cap, and says so', async () => {
    const big = 'x'.repeat(STORE_BUDGET_CHARS);
    await expect(writeModel('mine', { names: {}, notes: { a: big } })).rejects.toBeInstanceOf(StoreFullError);
    expect(calls.some(c => c.action === 'state.set')).toBe(false);
  });

  it('runs writes one after the other, so two quick saves both land', async () => {
    await Promise.all([
      writeModel('one', { names: { a: 'A' }, notes: {} }),
      writeModel('two', { names: { b: 'B' }, notes: {} }),
    ]);
    expect(Object.keys((disk.models as Record<string, unknown>))).toEqual(['one', 'two']);
  });
});

describe('keepSheet', () => {
  it('re-reads the permission, opens the sandbox, then writes ONE chronicle', async () => {
    host({
      'permissions.refresh': () => ({ granted: { 'vault:write': true } }),
      'vault.sandbox.ensure': () => ({ vault: 'APP-parts', created: false, unlocked: false }),
      'social.ingest': () => ({ ok: true }),
    });
    const done = await keepSheet('# sheet');
    expect(done).toEqual({ vault: 'APP-parts', unlocked: false });
    expect(calls.map(c => c.action)).toEqual(['permissions.refresh', 'vault.sandbox.ensure', 'social.ingest']);
    expect(calls[2].payload).toEqual({ vault: 'APP-parts', content: '# sheet', spineType: SHEET_SPINE });
  });

  it('writes nothing when the permission is not granted', async () => {
    host({ 'permissions.refresh': () => ({ granted: { 'vault:write': false } }) });
    await expect(keepSheet('# sheet')).rejects.toBeInstanceOf(PermissionError);
    expect(calls.map(c => c.action)).toEqual(['permissions.refresh']);
  });

  it('gives up on a host that never answers', async () => {
    vi.useFakeTimers();
    host({ 'permissions.refresh': () => new Promise(() => undefined) });
    const run = keepSheet('# sheet');
    const caught = run.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(String(await caught)).toContain('no answer');
    vi.useRealTimers();
  });
});

describe('host files', () => {
  it('keeps the catalogue beside the models, and counts what was written on each', async () => {
    disk = { models: { m: { names: { a: 'A' }, notes: { a: 'n', b: 'm' } } }, recent: [{ path: '/old', name: 'old' }] };
    const entry = { key: 'm', name: 'a.stp', path: '/x/a.stp', bytes: 10, parts: 3, named: 2, layers: 1, firstOpenedAt: 1, openedAt: 2, opens: 1 };
    await writeLibrary([entry]);
    expect(await readLibrary()).toEqual({ library: [entry], written: { m: 3 } });
    expect(disk.models).toEqual({ m: { names: { a: 'A' }, notes: { a: 'n', b: 'm' } } });
    expect(disk).not.toHaveProperty('recent');
  });

  it('opens the picker in the folder it is given, with the 3D formats', async () => {
    host({
      'permissions.refresh': () => ({ granted: { 'dialog:open': true } }),
      'dialog.selectFile': () => '/x/b.stp',
    });
    expect(await pickFile('/x', '3D')).toBe('/x/b.stp');
    const pick = calls.find(c => c.action === 'dialog.selectFile')!;
    expect(pick.payload).toEqual({ filters: [{ name: '3D', extensions: ['step', 'stp', 'glb', 'gltf', 'obj', 'stl'] }], startIn: '/x' });
  });

  it('answers null when the person cancels', async () => {
    host({ 'permissions.refresh': () => ({ granted: {} }), 'dialog.selectFile': () => null });
    expect(await pickFile('', '3D')).toBeNull();
    expect(calls.find(c => c.action === 'dialog.selectFile')!.payload).not.toHaveProperty('startIn');
  });

  it('reads a picked file as bytes, and says why when the host refuses', async () => {
    host({ 'dialog.readFile': () => ({ success: true, isBinary: true, content: 'data:application/octet-stream;base64,' + btoa('ISO') }) });
    expect(new TextDecoder().decode(await readHostFile('/x/a.stp'))).toBe('ISO');
    host({ 'dialog.readFile': () => ({ success: false, error: 'File is too large (limit: 50MB).' }) });
    await expect(readHostFile('/x/big.stp')).rejects.toThrow('too large');
  });

  it('decodes a data URL to its bytes', () => {
    expect(Array.from(new Uint8Array(decodeDataUrl(`data:;base64,${btoa(String.fromCharCode(0, 1, 255))}`)))).toEqual([0, 1, 255]);
  });
});

describe('detached windows', () => {
  it('hands a model to the new window once: read, then gone', async () => {
    disk = { models: { m: { names: { a: 'A' }, notes: {} } } };
    await writeHandoff('w1', { key: 'k', name: 'fw13.stp', path: '/x/fw13.stp' });
    expect(await takeHandoff('w1')).toEqual({ key: 'k', name: 'fw13.stp', path: '/x/fw13.stp' });
    expect(await takeHandoff('w1')).toBeNull();
    expect(disk.models).toEqual({ m: { names: { a: 'A' }, notes: {} } });
  });

  it("keeps the other windows' handoffs when one is taken", async () => {
    await writeHandoff('w1', { key: 'a', name: 'a.glb', cache: 'detach:w1' });
    await writeHandoff('w2', { key: 'b', name: 'b.glb', cache: 'detach:w2' });
    expect(await takeHandoff('w1')).toEqual({ key: 'a', name: 'a.glb', cache: 'detach:w1' });
    expect(await takeHandoff('w2')).toEqual({ key: 'b', name: 'b.glb', cache: 'detach:w2' });
  });

  it('asks the host for a window of this cartridge, by instance', async () => {
    host({ 'plugins.detach': () => ({ opened: true }) });
    await detachWindow('w9');
    expect(calls.at(-1)).toEqual({ action: 'plugins.detach', payload: { instance: 'w9' } });
  });
});

describe('unwrapState', () => {
  it('takes the blob out of the envelope the host answers', () => {
    expect(unwrapState({ state: { library: [1] }, updatedAt: 'x' })).toEqual({ library: [1] });
    expect(unwrapState({ state: null, updatedAt: null })).toEqual({});
    expect(unwrapState(null)).toEqual({});
  });

  it('recovers the newest data from a blob earlier writes wrapped again and again', () => {
    // What the disk held on 2026-10-03: each write had wrapped the previous answer.
    const nested = {
      state: {
        state: { state: { state: null, updatedAt: null, recent: [] }, updatedAt: 't1', library: ['old'] },
        updatedAt: 't2',
        library: ['new'],
      },
      updatedAt: 't3',
    };
    expect(unwrapState(nested)).toEqual({ library: ['new'] });
  });

  it('never writes the envelope back into the store', async () => {
    disk = { library: [] };
    await writeModel('m', { names: { a: 'A' }, notes: {} });
    expect(Object.keys(disk).sort()).toEqual(['library', 'models']);
  });
});
