import { describe, expect, it } from 'vitest';
import { evictions, hashBytes } from './cache';

describe('evictions', () => {
  const e = (hash: string, size: number, usedAt: number) => ({ hash, size, usedAt });

  it('drops the least recently used beyond the budget', () => {
    expect(evictions([e('old', 60, 1), e('mid', 30, 2), e('new', 30, 3)], 100, 'new')).toEqual(['old']);
  });

  it('never drops the model being written, even when it alone is over budget', () => {
    expect(evictions([e('big', 500, 1), e('other', 10, 2)], 100, 'big')).toEqual([]);
  });

  it('drops nothing under the budget', () => {
    expect(evictions([e('a', 10, 1), e('b', 10, 2)], 100, 'b')).toEqual([]);
  });
});

describe('hashBytes', () => {
  it('names the bytes, so one changed byte is another model', async () => {
    const a = await hashBytes(new Uint8Array([1, 2, 3]).buffer);
    const b = await hashBytes(new Uint8Array([1, 2, 4]).buffer);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(await hashBytes(new Uint8Array([1, 2, 3]).buffer)).toBe(a);
  });
});
