import { describe, expect, it } from 'vitest';
import { BLOCKS, KEYS, translate } from './strings';

describe('strings', () => {
  it.each(Object.entries(BLOCKS))('%s fills every key', (_, block) => {
    expect(KEYS.filter(k => !(k in block))).toEqual([]);
  });

  it.each(Object.entries(BLOCKS))('%s keeps every placeholder of the English line', (_, block) => {
    for (const k of KEYS) {
      const want = (translate('en', k).match(/\{\w+\}/g) ?? []).sort();
      const got = ((block as Record<string, string>)[k]?.match(/\{\w+\}/g) ?? []).sort();
      expect([k, got]).toEqual([k, want]);
    }
  });

  it('falls back to English for a language with no block', () => {
    expect(translate('de', 'part.hide')).toBe('Hide');
  });

  it('leaves an unknown placeholder visible instead of blanking it', () => {
    expect(translate('en', 'memory.saved')).toBe('Written to your {vault} vault.');
  });
});
