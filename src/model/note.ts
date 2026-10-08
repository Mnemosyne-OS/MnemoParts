/**
 * note.ts — the model sheet that goes into memory, and the per-model record
 * kept between sessions.
 *
 * ONE CHRONICLE PER MODEL, written on a gesture. An ingest is permanent and
 * shared with every future agent, so it is never automatic and never one row
 * per part or per rename: a hundred rows « renamed X » would bury the one fact
 * a person comes back for (« which screw holds the hinge »).
 *
 * The sheet lists only what a person would want back: the model, how many
 * parts, the names they wrote, and their notes. Decoded names that nobody
 * corrected are left out of the list: they come from a table, the file still
 * carries them, and a sheet of 107 machine names reads as noise.
 */

/** What is kept for one model between sessions (host-side state mirror, doc 73). */
export type ModelRecord = {
  /** Names the person wrote, by raw part code. */
  names: Record<string, string>;
  /** Notes the person wrote, by raw part code. */
  notes: Record<string, string>;
};

export type SheetPart = {raw: string; name: string; note?: string; ownName: boolean};

export type SheetLabels = {
  title: string;
  file: string;
  parts: string;
  named: string;
  notes: string;
  code: string;
};

/** A model is recognised by its file name and its byte size: the file itself is never stored. */
export function modelKey(fileName: string, bytes: number): string {
  return `${fileName}::${bytes}`;
}

/** Drop empty strings, so a cleared field leaves no trace in the record. */
export function cleanRecord(r: ModelRecord): ModelRecord {
  const keep = (m: Record<string, string>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  return {names: keep(r.names), notes: keep(r.notes)};
}

/** Read a record from whatever the store returned; anything unreadable is dropped field by field. */
export function parseRecord(x: unknown): ModelRecord {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const strings = (m: unknown): Record<string, string> => {
    if (!m || typeof m !== 'object') return {};
    return Object.fromEntries(Object.entries(m as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
  };
  return {names: strings(o.names), notes: strings(o.notes)};
}

export function buildSheet(fileName: string, parts: readonly SheetPart[], l: SheetLabels): string {
  const own = parts.filter(p => p.ownName || p.note?.trim());
  const lines = [
    `# ${l.title}: ${fileName}`,
    '',
    `- ${l.file}: ${fileName}`,
    `- ${l.parts}: ${parts.length}`,
  ];
  if (own.length) {
    lines.push('', `## ${l.notes}`, '');
    for (const p of own) {
      lines.push(`### ${p.name}`, `${l.code}: \`${p.raw}\``);
      if (p.note?.trim()) lines.push('', p.note.trim());
      lines.push('');
    }
  }
  const named = parts.filter(p => p.ownName).length;
  lines.splice(4, 0, `- ${l.named}: ${named}`);
  return lines.join('\n').trimEnd() + '\n';
}
