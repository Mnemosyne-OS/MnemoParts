import { describe, expect, it } from 'vitest';
import { GROUPS, opensHere, SOURCES } from './sources';

describe('sources', () => {
  it('says each site in the three languages', () => {
    for (const s of SOURCES) {
      for (const l of ['en', 'fr', 'es'] as const) {
        expect([s.id, l, s.about[l].trim().length > 0, s.licence[l].trim().length > 0]).toEqual([s.id, l, true, true]);
      }
    }
  });

  it('links every site over https, once', () => {
    expect(SOURCES.every(s => new URL(s.url).protocol === 'https:')).toBe(true);
    expect(new Set(SOURCES.map(s => s.id)).size).toBe(SOURCES.length);
  });

  it('files every site under a group the page shows', () => {
    expect(SOURCES.every(s => GROUPS.includes(s.group))).toBe(true);
  });

  it('knows which sites serve a format Parts reads', () => {
    expect(opensHere({ ...SOURCES[0], formats: ['STEP'] })).toBe(true);
    expect(opensHere({ ...SOURCES[0], formats: ['3MF', 'Fusion 360'] })).toBe(false);
  });
});
