import { describe, expect, it } from 'vitest';
import {
  baseName, filterEntries, folderOf, forgetPath, LIBRARY_MAX, parseLibrary, recordOpen, removeEntry, sortEntries,
  type LibraryEntry, type Opened,
} from './library';

const opened = (over: Partial<Opened> = {}): Opened => ({
  key: 'fw13.stp::100', name: 'fw13.stp', path: 'C:/m/fw13.stp', bytes: 100, parts: 107, named: 107, layers: 8, ...over,
});

describe('paths', () => {
  it('finds the folder and the name whatever the separators', () => {
    expect(folderOf(String.raw`C:\Users\me\models\a.stp`)).toBe(String.raw`C:\Users\me\models`);
    expect(folderOf('/home/me/a.glb')).toBe('/home/me');
    expect(folderOf('a.glb')).toBe('');
    expect(baseName(String.raw`C:\x\fw13.stp`)).toBe('fw13.stp');
  });
});

describe('recordOpen', () => {
  it('adds a model the first time, with what was measured', () => {
    const list = recordOpen([], opened(), 1000);
    expect(list).toEqual([{ key: 'fw13.stp::100', name: 'fw13.stp', path: 'C:/m/fw13.stp', bytes: 100, parts: 107, named: 107, layers: 8, firstOpenedAt: 1000, openedAt: 1000, opens: 1 }]);
  });

  it('counts a second opening of the same model instead of listing it twice', () => {
    let list = recordOpen([], opened(), 1000);
    list = recordOpen(list, opened(), 2000);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ firstOpenedAt: 1000, openedAt: 2000, opens: 2 });
  });

  it('gives a dropped model its path when it is later picked, and keeps that path when it is dropped again', () => {
    let list = recordOpen([], opened({ path: undefined }), 1000);
    expect(list[0].path).toBeUndefined();
    list = recordOpen(list, opened(), 2000);
    expect(list).toHaveLength(1);
    expect(list[0].path).toBe('C:/m/fw13.stp');
    list = recordOpen(list, opened({ path: undefined }), 3000);
    expect(list[0].path).toBe('C:/m/fw13.stp');
  });

  it('keeps the most recently opened first, and drops the oldest beyond the cap', () => {
    let list: LibraryEntry[] = [];
    for (let i = 0; i < LIBRARY_MAX + 5; i++) list = recordOpen(list, opened({ key: `k${i}`, name: `m${i}`, path: `/m/${i}` }), i);
    expect(list).toHaveLength(LIBRARY_MAX);
    expect(list[0].name).toBe(`m${LIBRARY_MAX + 4}`);
    expect(list.some(e => e.name === 'm0')).toBe(false);
  });
});

describe('removing and forgetting', () => {
  it('removes one entry by its key', () => {
    const list = recordOpen(recordOpen([], opened(), 1), opened({ key: 'b', name: 'b', path: '/b' }), 2);
    expect(removeEntry(list, 'b').map(e => e.key)).toEqual(['fw13.stp::100']);
  });

  it('keeps a model whose file no longer opens, without its path', () => {
    const list = forgetPath(recordOpen([], opened(), 1), 'C:/m/fw13.stp');
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('path');
  });
});

describe('filter and sort', () => {
  const a = recordOpen([], opened({ key: 'a', name: 'Charnière.stp', path: '/atelier/Charnière.stp', parts: 7 }), 3)[0];
  const b = recordOpen([], opened({ key: 'b', name: 'buggy.glb', path: '/jouets/buggy.glb', parts: 236 }), 1)[0];
  const c = recordOpen([], opened({ key: 'c', name: 'Engine.glb', path: undefined, parts: 115 }), 2)[0];
  const all = [a, b, c];
  const notes = (k: string) => ({ a: 0, b: 5, c: 2 })[k] ?? 0;

  it('finds by name or folder, ignoring case and accents', () => {
    expect(filterEntries(all, 'charniere').map(e => e.key)).toEqual(['a']);
    expect(filterEntries(all, 'JOUETS').map(e => e.key)).toEqual(['b']);
    expect(filterEntries(all, '  ').map(e => e.key)).toEqual(['a', 'b', 'c']);
  });

  it.each([
    ['opened', 'desc', ['a', 'c', 'b']],
    ['name', 'asc', ['b', 'a', 'c']],
    ['parts', 'desc', ['b', 'c', 'a']],
    ['notes', 'desc', ['b', 'c', 'a']],
    ['folder', 'asc', ['c', 'a', 'b']],
  ] as const)('sorts by %s %s', (by, dir, keys) => {
    expect(sortEntries(all, by, dir, notes).map(e => e.key)).toEqual(keys);
  });

  it('breaks ties by the most recently opened', () => {
    const same = [b, a, c].map(e => ({ ...e, parts: 1 }));
    expect(sortEntries(same, 'parts', 'asc', notes).map(e => e.key)).toEqual(['a', 'c', 'b']);
  });

  it('never reorders the list it was given', () => {
    const copy = [...all];
    sortEntries(all, 'name', 'asc', notes);
    expect(all).toEqual(copy);
  });
});

describe('parseLibrary', () => {
  it('keeps good entries and drops malformed ones, one by one', () => {
    const good = { key: 'k', name: 'n', bytes: 1, parts: 2, openedAt: 5 };
    expect(parseLibrary([good, { key: 'x' }, null, { ...good, parts: 'many' }])).toEqual([
      { key: 'k', name: 'n', bytes: 1, parts: 2, named: 0, layers: 0, firstOpenedAt: 5, openedAt: 5, opens: 1 },
    ]);
    expect(parseLibrary('nope')).toEqual([]);
  });
});
