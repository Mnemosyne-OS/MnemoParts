import { describe, expect, it } from 'vitest';
import { computeLayers, explodedPosition, LAYER_SPREAD, RADIAL_SPREAD, stackAxis, type Vec3 } from './layers';

describe('stackAxis', () => {
  it('is the thinnest side of the model', () => {
    expect(stackAxis([30, 2, 20])).toBe(1);
    expect(stackAxis([1, 5, 5])).toBe(0);
    expect(stackAxis([5, 5, 1])).toBe(2);
  });
});

describe('computeLayers', () => {
  // A laptop lying flat: 30 wide, 2 thick (Y), 20 deep.
  const size: Vec3 = [30, 2, 20];

  it('groups centres that sit together along the stacking axis into one layer', () => {
    const centers: Vec3[] = [[0, 0, 0], [5, 0.05, 2], [0, 1, 0], [-3, 1.1, 4], [0, 2, 0]];
    const l = computeLayers(centers, size, 10);
    expect(l.axis).toBe(1);
    expect(l.count).toBe(3);
    expect(l.rank).toEqual([0, 0, 1, 1, 2]);
  });

  it('measures a layer from its first centre, so a slow rise does not chain into one layer', () => {
    // Tolerance is 0.08 * 2 = 0.16. Each step is 0.1, under the tolerance,
    // but the fourth centre is 0.3 above the first.
    const centers: Vec3[] = [[0, 0, 0], [0, 0.1, 0], [0, 0.2, 0], [0, 0.3, 0]];
    const l = computeLayers(centers, size, 10);
    expect(l.rank).toEqual([0, 0, 1, 1]);
  });

  it('spreads layers evenly and symmetrically, by rank, whatever the gaps between them', () => {
    const centers: Vec3[] = [[0, 0, 0], [0, 0.5, 0], [0, 2, 0]];
    const l = computeLayers(centers, size, 10);
    const step = (10 * LAYER_SPREAD) / 2;
    expect(l.offset).toEqual([-step, 0, step]);
  });

  it('does not move a model that has one layer', () => {
    const l = computeLayers([[0, 0, 0], [3, 0, 1]], size, 10);
    expect(l.count).toBe(1);
    expect(l.offset).toEqual([0, 0]);
  });

  it('keeps the input order in its answers', () => {
    const l = computeLayers([[0, 2, 0], [0, 0, 0]], size, 10);
    expect(l.rank).toEqual([1, 0]);
  });
});

describe('explodedPosition', () => {
  it('moves a part along the stacking axis only, by its offset times the explode', () => {
    expect(explodedPosition([1, 2, 3], 'layers', 0.5, { axis: 1, offset: 4 }, [9, 9, 9])).toEqual([1, 4, 3]);
  });

  it('moves a part away from the centre in radial mode', () => {
    expect(explodedPosition([0, 0, 0], 'radial', 1, { axis: 1, offset: 4 }, [1, 0, -2])).toEqual([RADIAL_SPREAD, 0, -2 * RADIAL_SPREAD]);
  });

  it('leaves every part at rest when closed', () => {
    expect(explodedPosition([1, 2, 3], 'layers', 0, { axis: 0, offset: 7 }, [1, 1, 1])).toEqual([1, 2, 3]);
    expect(explodedPosition([1, 2, 3], 'radial', 0, { axis: 0, offset: 7 }, [1, 1, 1])).toEqual([1, 2, 3]);
  });
});
