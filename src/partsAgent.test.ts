/**
 * partsAgent — the agent's moves are the app's own, a write answers only once it is written,
 * and every refusal is named.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LibraryEntry } from './model/library';
import { partsAgentHandlers, readLimit, resolvePart, withName, withNote, type AgentPart, type PartsAgentContext } from './partsAgent';

const part = (raw: string, name: string): AgentPart => ({ raw, name, own: false, decoded: true, note: '' });
const parts = [part('B-101', 'Bolt'), part('B-102', 'Bolt (2)'), part('H-7', 'Housing'), part('1234', 'Gear')];
const entry = (name: string, path?: string): LibraryEntry => ({
  key: `${name}:1`, name, ...(path ? { path } : {}), bytes: 1, parts: 1, named: 1, layers: 1, firstOpenedAt: 0, openedAt: 0, opens: 1,
});

function ctx(over: Partial<PartsAgentContext> = {}): PartsAgentContext {
  return {
    tabs: [{ id: 't1', name: 'pump.step', path: 'C:/m/pump.step', parts: 4 }],
    activeTab: 't1', reading: null, failure: null, parts, record: { names: {}, notes: {} },
    selected: -1, hidden: new Set(), explode: 0, mode: 'layers', store: 'ok', memory: 'idle',
    library: [entry('pump.step', 'C:/m/pump.step'), entry('valve.step', 'C:/m/valve.step'), entry('dropped.glb')],
    select: vi.fn(), setHidden: vi.fn(), setExplode: vi.fn(), setMode: vi.fn(),
    writeRecord: vi.fn(async () => undefined), switchTo: vi.fn(), openEntry: vi.fn(),
    keep: vi.fn(async () => ({ kind: 'done' as const, vault: 'PARTS', unlocked: true })),
    closeTab: vi.fn(), view: 'model', setView: vi.fn(), setFilter: vi.fn(),
    ...over,
  };
}

describe('the record changes are the editor\'s', () => {
  it('a name is trimmed, and an unchanged one changes nothing', () => {
    expect(withName({ names: {}, notes: {} }, 'B-101', '  Hex bolt ')!.names['B-101']).toBe('Hex bolt');
    expect(withName({ names: { 'B-101': 'Hex bolt' }, notes: {} }, 'B-101', 'Hex bolt')).toBeNull();
    expect(withNote({ names: {}, notes: { 'B-101': 'x' } }, 'B-101', 'x')).toBeNull();
  });
});

describe('resolvePart', () => {
  it('takes a number from 1, a factory code, then a name, exact first', () => {
    expect(resolvePart(parts, 3)).toBe(2);
    expect(resolvePart(parts, '1234')).toBe(3);
    expect(resolvePart(parts, 'housing')).toBe(2);
    expect(resolvePart(parts, 'Bolt')).toBe(0);
  });
  it('refuses a number out of the list', () => {
    expect(() => resolvePart(parts, 0)).toThrow(/^BAD_ARG/);
    expect(() => resolvePart(parts, 5)).toThrow(/^BAD_ARG/);
  });
  it('refuses a partial name that matches several parts, with their numbers', () => {
    expect(() => resolvePart(parts, 'B-10')).toThrow(/^AMBIGUOUS: .*1 \(Bolt\).*2 \(Bolt \(2\)\)/);
  });
  it('says there is no model, or how to list', () => {
    expect(() => resolvePart([], 'Bolt')).toThrow(/^NO_MODEL/);
    expect(() => resolvePart(parts, 'Spring')).toThrow('NO_PART: no part named "Spring"; parts: 1 (Bolt), 2 (Bolt (2)), 3 (Housing), 4 (Gear)');
  });
});

describe('readLimit', () => {
  it('refuses a negative or broken limit', () => {
    expect(readLimit(undefined)).toBe(100);
    expect(() => readLimit(-1)).toThrow(/^BAD_ARG/);
    expect(() => readLimit(501)).toThrow(/^BAD_ARG/);
  });
});

describe('the handlers', () => {
  it('parts answers the total and at most limit rows, numbered from 1', () => {
    const r = partsAgentHandlers(() => ctx()).parts({ text: 'bolt', limit: 1 });
    expect(r.total).toBe(2);
    expect(r.parts).toEqual([expect.objectContaining({ number: 1, code: 'B-101' })]);
  });

  it('number and part are never both', () => {
    expect(() => partsAgentHandlers(() => ctx()).selectPart({ number: 1, part: 'Bolt' })).toThrow(/^BAD_ARG/);
    expect(() => partsAgentHandlers(() => ctx()).selectPart({})).toThrow(/^MISSING_ARG/);
  });

  it('isolate selects the part, then hides every other one, as the buttons do', () => {
    const c = ctx();
    partsAgentHandlers(() => c).showParts({ how: 'isolate', part: 'Housing' });
    expect(c.select).toHaveBeenCalledWith(2);
    expect(c.setHidden).toHaveBeenCalledWith(new Set([0, 1, 3]));
  });

  it('hide without a part acts on the selected one, and refuses when none is', () => {
    const none = ctx();
    expect(() => partsAgentHandlers(() => none).showParts({ how: 'hide' })).toThrow(/^NOTHING_SELECTED/);
    const c = ctx({ selected: 1, hidden: new Set([3]) });
    partsAgentHandlers(() => c).showParts({ how: 'hide' });
    expect(c.setHidden).toHaveBeenCalledWith(new Set([3, 1]));
  });

  it('explode refuses an amount outside 0..1', () => {
    const c = ctx();
    expect(() => partsAgentHandlers(() => c).explode({ amount: 1.5 })).toThrow(/^BAD_ARG/);
    expect(() => partsAgentHandlers(() => c).explode({ amount: -0.1 })).toThrow(/^BAD_ARG/);
    expect(() => partsAgentHandlers(() => c).explode({})).toThrow(/^MISSING_ARG/);
    partsAgentHandlers(() => c).explode({ amount: 0.5, mode: 'radial' });
    expect(c.setExplode).toHaveBeenCalledWith(0.5);
    expect(c.setMode).toHaveBeenCalledWith('radial');
  });

  it('a rename answers only once the store has written it', async () => {
    let finish: () => void = () => undefined;
    const c = ctx({ writeRecord: vi.fn(() => new Promise<void>((r) => { finish = r; })) });
    let done = false;
    const p = partsAgentHandlers(() => c).renamePart({ number: 3, name: 'Pump housing' }).then((r) => { done = true; return r; });
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    expect(await p).toMatchObject({ name: 'Pump housing', changed: true });
    expect(c.writeRecord).toHaveBeenCalledWith({ names: { 'H-7': 'Pump housing' }, notes: {} });
  });

  it('a rename refused by the store is an error, never ok', async () => {
    const c = ctx({ writeRecord: vi.fn(async () => { throw new Error('store full'); }) });
    await expect(partsAgentHandlers(() => c).notePart({ number: 1, note: 'loose' })).rejects.toThrow('store full');
  });

  it('nothing is written while the model\'s names are unread', async () => {
    const c = ctx({ store: 'none' });
    await expect(partsAgentHandlers(() => c).renamePart({ number: 1, name: 'x' })).rejects.toThrow(/^STORE_NOT_READY/);
    await expect(partsAgentHandlers(() => c).notePart({ number: 1, note: 'x' })).rejects.toThrow(/^STORE_NOT_READY/);
    expect(c.writeRecord).not.toHaveBeenCalled();
  });

  it('openModel brings a tab forward, reopens a library file, and refuses a dropped one', () => {
    const c = ctx();
    const h = partsAgentHandlers(() => c);
    expect(h.openModel({ model: 'pump.step' })).toMatchObject({ started: false });
    expect(c.switchTo).toHaveBeenCalledWith('t1');
    expect(h.openModel({ model: 'valve.step' })).toMatchObject({ started: true });
    expect(c.openEntry).toHaveBeenCalledWith(expect.objectContaining({ name: 'valve.step' }));
    expect(() => h.openModel({ model: 'dropped.glb' })).toThrow(/^NO_PATH/);
    expect(() => h.openModel({ model: 'nothing.step' })).toThrow('NO_MODEL: no model named "nothing.step"; models: pump.step, valve.step, dropped.glb');
  });

  it('openModel waits while a file is being read', () => {
    const c = ctx({ reading: 'big.step' });
    expect(() => partsAgentHandlers(() => c).openModel({ model: 'valve.step' })).toThrow(/^BUSY/);
    expect(c.openEntry).not.toHaveBeenCalled();
  });

  it('keepSheet answers the vault, refuses while saving, and says a failure', async () => {
    expect(await partsAgentHandlers(() => ctx()).keepSheet()).toEqual({ vault: 'PARTS', unlocked: true });
    await expect(partsAgentHandlers(() => ctx({ memory: 'saving' })).keepSheet()).rejects.toThrow(/^BUSY/);
    const failing = ctx({ keep: vi.fn(async () => ({ kind: 'error' as const, text: 'no permission' })) });
    await expect(partsAgentHandlers(() => failing).keepSheet()).rejects.toThrow(/^NOT_KEPT: no permission/);
  });
  it('openModel takes the words a person says, and refuses two models with their names', () => {
    const c = ctx({ library: [entry('valve.step', 'C:/m/valve.step'), entry('valve_v2.step', 'C:/m/valve_v2.step'), entry('moteur_avant.step', 'C:/m/moteur_avant.step')] });
    const h = partsAgentHandlers(() => c);
    expect(h.openModel({ model: 'le moteur' })).toMatchObject({ opening: 'moteur_avant.step', started: true });
    expect(h.openModel({ model: 'pump' })).toMatchObject({ shown: 'pump.step', started: false });
    // « valve » is the whole name of one: it wins over valve_v2.
    expect(h.openModel({ model: 'valve' })).toMatchObject({ opening: 'valve.step' });
    expect(() => h.openModel({ model: 'step' })).toThrow(/^NO_MODEL/);
  });

  it('two files of one name are refused with their paths', () => {
    const c = ctx({ tabs: [], library: [entry('pump.step', 'C:/a/pump.step'), entry('pump.step', 'C:/b/pump.step')] });
    expect(() => partsAgentHandlers(() => c).openModel({ model: 'pump.step' })).toThrow('AMBIGUOUS: "pump.step" names several models: C:/a/pump.step, C:/b/pump.step; say which');
    expect(() => partsAgentHandlers(() => c).openModel({ model: 'pump' })).toThrow(/^AMBIGUOUS: "pump" names several models/);
  });
});

describe('a part named the way a person says it', () => {
  const said = [part('BRG-6204', 'Roulement'), part('BRG-6205', 'Roulement (2)'), part('SC-M6', 'Vis de fixation'), part('HSG', 'Carter avant')];

  it('finds it by its words, folded and with its articles off', () => {
    const c = ctx({ parts: said });
    const h = partsAgentHandlers(() => c);
    expect(h.selectPart({ part: 'la vis' })).toMatchObject({ selected: { number: 3 } });
    expect(h.selectPart({ part: 'le carter' })).toMatchObject({ selected: { number: 4 } });
    // The whole name wins over the numbered repeat.
    expect(h.selectPart({ part: 'le roulement' })).toMatchObject({ selected: { number: 1 } });
    expect(h.selectPart({ part: 'roulement 2' })).toMatchObject({ selected: { number: 2 } });
  });

  it('every name-taking action refuses several matches with their numbers', async () => {
    const c = ctx({ parts: said });
    const h = partsAgentHandlers(() => c);
    const amb = /^AMBIGUOUS: "BRG" names several parts: 1 \(Roulement\), 2 \(Roulement \(2\)\); say which/;
    expect(() => h.selectPart({ part: 'BRG' })).toThrow(amb);
    expect(() => h.showParts({ how: 'isolate', part: 'BRG' })).toThrow(amb);
    await expect(h.renamePart({ part: 'BRG', name: 'x' })).rejects.toThrow(amb);
    await expect(h.notePart({ part: 'BRG', note: 'x' })).rejects.toThrow(amb);
    expect(c.select).not.toHaveBeenCalled();
    expect(c.writeRecord).not.toHaveBeenCalled();
  });

  it('a rename by the words a person says writes the right part', async () => {
    const c = ctx({ parts: said });
    await partsAgentHandlers(() => c).renamePart({ part: 'la vis', name: 'Vis M6' });
    expect(c.writeRecord).toHaveBeenCalledWith({ names: { 'SC-M6': 'Vis M6' }, notes: {} });
  });
});

describe('the screens and the list, as the side buttons do', () => {
  it('show brings one hidden part back, and an unknown how is refused', () => {
    const c = ctx({ hidden: new Set([0, 2]) });
    partsAgentHandlers(() => c).showParts({ how: 'show', part: 'housing' });
    expect(c.setHidden).toHaveBeenCalledWith(new Set([0]));
    expect(() => partsAgentHandlers(() => c).showParts({ how: 'explode' })).toThrow(/^BAD_ARG/);
  });

  it('a move on the model brings it back in front of the library, a refused one does not', () => {
    const c = ctx({ view: 'library' });
    expect(() => partsAgentHandlers(() => c).selectPart({ part: 'Spring' })).toThrow(/^NO_PART/);
    expect(c.setView).not.toHaveBeenCalled();
    partsAgentHandlers(() => c).selectPart({ part: 'gear' });
    expect(c.setView).toHaveBeenCalledWith('model');
  });

  it('showView and closeView switch the screen; the model needs a model', () => {
    const c = ctx();
    expect(partsAgentHandlers(() => c).showView({ view: 'sketchfab' })).toEqual({ view: 'sketchfab' });
    expect(c.setView).toHaveBeenCalledWith('sketchfab');
    expect(() => partsAgentHandlers(() => c).showView({ view: 'settings' })).toThrow(/^BAD_ARG/);
    expect(() => partsAgentHandlers(() => ctx({ tabs: [] })).showView({ view: 'model' })).toThrow(/^NO_MODEL/);
    const open = ctx({ view: 'sources' });
    expect(partsAgentHandlers(() => open).closeView()).toEqual({ closed: 'sources', view: 'model' });
    expect(open.setView).toHaveBeenCalledWith('model');
    expect(partsAgentHandlers(() => ctx()).closeView()).toEqual({ closed: null, view: 'model' });
  });

  it('filterParts types in the filter and says what the list shows; no text clears it', () => {
    const c = ctx();
    expect(partsAgentHandlers(() => c).filterParts({ text: 'bolt' })).toMatchObject({ filter: 'bolt', shown: 2, of: 4 });
    expect(c.setFilter).toHaveBeenCalledWith('bolt');
    expect(partsAgentHandlers(() => c).filterParts({})).toMatchObject({ filter: null, shown: 4 });
    expect(c.setFilter).toHaveBeenLastCalledWith('');
  });

  it('closeModel closes a tab by its words, and refuses a dropped one or a model not open', () => {
    const c = ctx();
    expect(partsAgentHandlers(() => c).closeModel({ model: 'the pump' })).toEqual({ closed: 'pump.step', open: [] });
    expect(c.closeTab).toHaveBeenCalledWith('t1');
    const dropped = ctx({ tabs: [{ id: 't2', name: 'dropped.glb', path: null, parts: 1 }] });
    expect(() => partsAgentHandlers(() => dropped).closeModel({ model: 'dropped' })).toThrow(/^NO_PATH/);
    expect(dropped.closeTab).not.toHaveBeenCalled();
    expect(() => partsAgentHandlers(() => c).closeModel({ model: 'valve' })).toThrow(/^NOT_OPEN: "valve.step" is not open; open models: pump.step/);
  });
});
