/**
 * layers.ts — where each part goes when the model opens.
 *
 * Two rules, both pure (numbers in, numbers out) so they are tested without a
 * GPU:
 *
 * LAYERS. An assembly like a laptop is a stack. A radial explode leaves the big
 * shells in place, because their centre IS the model's centre, and those are
 * the parts a person wants to lift off first. The stacking axis is the thinnest
 * side of the whole model. Parts whose centres sit within a tolerance of each
 * other along it form one layer, and layers are spread EVENLY: a thin stack
 * opens as far as a tall one, and a layer's offset depends on its rank, never
 * on how thick the model happens to be.
 *
 * RADIAL. Each part moves away from the model's centre along the line joining
 * them. Kept for objects that are not stacks (an engine, a buggy).
 */
export type Vec3 = readonly [number, number, number];
export type Axis = 0 | 1 | 2;

/** Fraction of the model's thickness within which two centres share a layer. */
export const LAYER_TOLERANCE = 0.08;
/** How far the outermost layers travel at full explode, in model radii. */
export const LAYER_SPREAD = 1.6;
/** How far a part travels at full radial explode, in multiples of its distance to the centre. */
export const RADIAL_SPREAD = 1.5;

/** The thinnest side of the model's bounding box: the axis a stack is piled along. */
export function stackAxis(size: Vec3): Axis {
  if (size[0] <= size[1] && size[0] <= size[2]) return 0;
  return size[1] <= size[2] ? 1 : 2;
}

export type Layers = {
  axis: Axis;
  /** Number of distinct layers found. */
  count: number;
  /** Layer rank of each part, 0 = lowest along the axis, in input order. */
  rank: number[];
  /** Offset of each part along the axis at full explode, in input order. */
  offset: number[];
};

/**
 * Sort the centres along the axis and open a new layer whenever a centre sits
 * more than the tolerance above the FIRST centre of the current layer. Measuring
 * from the layer's start, not from the previous part, matters: eighty keys at
 * slightly rising heights would otherwise chain into one layer, or into eighty.
 */
export function computeLayers(centers: readonly Vec3[], size: Vec3, radius: number): Layers {
  const axis = stackAxis(size);
  const tol = Math.max(size[axis] * LAYER_TOLERANCE, 1e-9);
  const order = centers.map((c, i) => ({i, v: c[axis]})).sort((a, b) => a.v - b.v);
  const rank = new Array<number>(centers.length).fill(0);
  let layer = -1;
  let start = -Infinity;
  for (const {i, v} of order) {
    if (v - start > tol) { layer++; start = v; }
    rank[i] = layer;
  }
  const count = layer + 1;
  const step = count > 1 ? (radius * LAYER_SPREAD) / (count - 1) : 0;
  const offset = rank.map(r => (r - (count - 1) / 2) * step);
  return {axis, count, rank, offset};
}

/** Where a part sits at explode `f` (0 = assembled, 1 = fully open). */
export function explodedPosition(
  rest: Vec3, mode: 'layers' | 'radial', f: number,
  layer: {axis: Axis; offset: number}, fromCenter: Vec3,
): Vec3 {
  if (mode === 'radial') {
    const k = f * RADIAL_SPREAD;
    return [rest[0] + fromCenter[0] * k, rest[1] + fromCenter[1] * k, rest[2] + fromCenter[2] * k];
  }
  const out: [number, number, number] = [rest[0], rest[1], rest[2]];
  out[layer.axis] += layer.offset * f;
  return out;
}
