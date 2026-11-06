/**
 * agentFind — a part or a model named the way a person says it (doc 149). The orb plans a
 * spoken sentence in ONE model call and never reads Parts first, so « isole le roulement »
 * reaches an action with the words « roulement », never a number. An id, a number or a code
 * still works (other agents read `parts` and `models` first).
 *
 * 🚨 Several matches are REFUSED with their names (AMBIGUOUS), never the first one taken: the
 *    refusal is what the orb's second planner call reads to pick the right one. No match is
 *    refused with the names that exist.
 *
 * Copied from Vitrine Studio's `data/agentFind.ts` (cartridges never import each other), with
 * the fillers of this domain: parts, models, files and their extensions.
 *
 * @module agentFind
 */

/** Lower case, accents off, œ/æ spelled out. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

/**
 * Words that carry no name: articles, the words a sentence wraps a name in, and the file
 * extensions a spoken model name never carries (« le moteur » for `moteur.step`).
 * 🪤 Matched BEFORE the accents come off: folded, « thé » is « the ».
 */
const FILLER = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'ce', 'cette', 'ces', 'et', 'en', 'au', 'aux', 'à',
  'the', 'a', 'an', 'of', 'my', 'and', 'el', 'los', 'las', 'del', 'mi', 'y',
  'pièce', 'pièces', 'piece', 'pieces', 'part', 'parts', 'pieza', 'piezas',
  'modèle', 'modèles', 'model', 'models', 'modelo', 'modelos', 'fichier', 'fichiers', 'file', 'files', 'archivo',
  'step', 'stp', 'glb', 'gltf', 'obj', 'stl',
]);

/** The words of a name, folded, fillers out, a plural « s »/« x » off so « vis » and « roulements » still match. */
export function nameWords(s: string): string[] {
  return s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER.has(w))
    .map((w) => fold(w))
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w));
}

export interface Named<T> { item: T; id: string; names: string[]; label: string }

const LIST_MAX = 12;
/** Labels for a refusal, deduplicated and capped so a model of 900 parts does not flood it. */
export const listed = (labels: string[]): string => {
  const unique = [...new Set(labels)];
  return unique.length > LIST_MAX ? `${unique.slice(0, LIST_MAX).join(', ')} (+${unique.length - LIST_MAX})` : unique.join(', ');
};

export type Match<T> = { kind: 'one'; item: T } | { kind: 'many'; labels: string[] } | { kind: 'none' };

/**
 * What `ref` names among `entries`: its id; else the entry whose whole name it is; else the
 * entries whose words hold every word of `ref`. Never throws, so a caller can try a weaker
 * rule (a factory code's fragment) before refusing.
 */
export function matchNamed<T>(entries: ReadonlyArray<Named<T>>, ref: string): Match<T> {
  const raw = ref.trim();
  const byId = entries.find((e) => e.id === raw);
  if (byId) return { kind: 'one', item: byId.item };
  const asked = nameWords(raw);
  if (!asked.length) return { kind: 'none' };
  // The whole name said as written wins over a partial match (« Bolt » against « Bolt » and « Bolt (2) »).
  const whole = entries.filter((e) => e.names.some((n) => nameWords(n).join(' ') === asked.join(' ')));
  if (whole.length === 1) return { kind: 'one', item: whole[0]!.item };
  const hits = entries.filter((e) => {
    const have = new Set(e.names.flatMap(nameWords));
    return asked.every((w) => have.has(w));
  });
  if (hits.length === 1) return { kind: 'one', item: hits[0]!.item };
  if (hits.length > 1) return { kind: 'many', labels: hits.map((e) => e.label) };
  return { kind: 'none' };
}

/** The refusal for several matches, in the one shape the orb's repair call reads. */
export function ambiguous(ref: string, noun: string, labels: string[]): Error {
  return new Error(`AMBIGUOUS: "${ref.trim()}" names several ${noun}s: ${listed(labels)}; say which`);
}

/** The refusal for no match, with the names that exist. */
export function notFound(ref: string, kind: { code: string; noun: string }, labels: string[]): Error {
  return new Error(`${kind.code}: no ${kind.noun} named "${ref.trim()}"; ${kind.noun}s: ${listed(labels) || 'none'}`);
}

/**
 * The one item `ref` names, or a refusal. `kind` names the error (NO_PART, NO_MODEL…) and the
 * noun said.
 */
export function findNamed<T>(entries: ReadonlyArray<Named<T>>, ref: string, kind: { code: string; noun: string }): T {
  if (!ref.trim()) throw new Error(`BAD_ARG: name the ${kind.noun}`);
  const m = matchNamed(entries, ref);
  if (m.kind === 'one') return m.item;
  if (m.kind === 'many') throw ambiguous(ref, kind.noun, m.labels);
  throw notFound(ref, kind, entries.map((e) => e.label));
}
