import { describe, expect, it } from 'vitest';
import { findNamed, nameWords, type Named } from './agentFind';

const part = (id: string, name: string): Named<string> => ({ item: id, id, names: [name, id], label: name });
const PARTS = [part('BRG-1', 'Roulement'), part('BRG-2', 'Roulement à billes'), part('SC-M6', 'Vis de fixation'), part('HSG', 'Carter avant')];
const kind = { code: 'NO_PART', noun: 'part' };

describe('a part or a model named the way a person says it', () => {
  it('folds case, accents, fillers, extensions and a plural', () => {
    expect(nameWords('les Roulements à BILLES')).toEqual(['roulement', 'bille']);
    expect(nameWords('le moteur_v2.step')).toEqual(['moteur', 'v2']);
    expect(nameWords('la pièce carter')).toEqual(['carter']);
  });

  it('an id, the whole name, or every word of it', () => {
    expect(findNamed(PARTS, 'SC-M6', kind)).toBe('SC-M6');
    expect(findNamed(PARTS, 'la vis', kind)).toBe('SC-M6');
    // « Roulement » is a whole name: it wins over the part that holds the word.
    expect(findNamed(PARTS, 'le roulement', kind)).toBe('BRG-1');
    expect(findNamed(PARTS, 'roulements à billes', kind)).toBe('BRG-2');
  });

  it('several matches are refused with their names, never the first taken', () => {
    const two = [part('a', 'Carter avant'), part('b', 'Carter arrière')];
    expect(() => findNamed(two, 'carter', kind)).toThrow('AMBIGUOUS: "carter" names several parts: Carter avant, Carter arrière; say which');
  });

  it('no match is refused with the names that exist, capped', () => {
    expect(() => findNamed(PARTS, 'ressort', kind)).toThrow('NO_PART: no part named "ressort"; parts: Roulement, Roulement à billes, Vis de fixation, Carter avant');
    expect(() => findNamed(PARTS, '  ', kind)).toThrow(/^BAD_ARG/);
    expect(() => findNamed([], 'vis', kind)).toThrow('parts: none');
    const many = Array.from({ length: 20 }, (_, i) => part(`p${i}`, `Part ${i}`));
    expect(() => findNamed(many, 'ressort', kind)).toThrow(/Part 11 \(\+8\)$/);
  });
});
