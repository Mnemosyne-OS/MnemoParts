import { describe, expect, it } from 'vitest';
import { buildSheet, cleanRecord, modelKey, parseRecord } from './note';

const L = { title: 'Model sheet', file: 'File', parts: 'Parts', named: 'Parts you named', notes: 'Your names and notes', code: 'Code' };

describe('buildSheet', () => {
  it('lists only the parts a person named or wrote a note on', () => {
    const sheet = buildSheet('fw13.stp', [
      { raw: 'HINGE_PLATE_R', name: 'Right hinge plate', ownName: false, note: 'T5 screws, 2 of them' },
      { raw: 'FRAME_1', name: 'Frame', ownName: false },
      { raw: 'BEZEL_1', name: 'Magnetic bezel', ownName: true },
    ], L);
    expect(sheet).toContain('# Model sheet: fw13.stp');
    expect(sheet).toContain('- Parts: 3');
    expect(sheet).toContain('- Parts you named: 1');
    expect(sheet).toContain('### Right hinge plate');
    expect(sheet).toContain('T5 screws, 2 of them');
    expect(sheet).toContain('### Magnetic bezel');
    expect(sheet).not.toContain('Frame');
  });

  it('has no notes section when nothing was written', () => {
    const sheet = buildSheet('a.glb', [{ raw: 'x', name: 'X', ownName: false }], L);
    expect(sheet).not.toContain('##');
  });

  it('ignores a note made only of spaces', () => {
    const sheet = buildSheet('a.glb', [{ raw: 'x', name: 'X', ownName: false, note: '   ' }], L);
    expect(sheet).not.toContain('### X');
  });
});

describe('records', () => {
  it('recognises a model by its name and its size', () => {
    expect(modelKey('a.stp', 10)).not.toBe(modelKey('a.stp', 11));
  });

  it('drops emptied fields so a cleared name leaves no trace', () => {
    expect(cleanRecord({ names: { a: ' ', b: 'Bolt ' }, notes: { c: '' } })).toEqual({ names: { b: 'Bolt' }, notes: {} });
  });

  it('reads what it can from a damaged record, field by field', () => {
    expect(parseRecord({ names: { a: 'A', b: 3 }, notes: 'nope' })).toEqual({ names: { a: 'A' }, notes: {} });
    expect(parseRecord(null)).toEqual({ names: {}, notes: {} });
  });
});

