/**
 * LibraryView — the catalogue of every model opened: search it, sort it by any
 * column, click a row to open the model again.
 *
 * A model opened by dropping a file has no path the host can read again: its
 * row stays (its names and notes are still there) and says how to reopen it.
 * Removing a row takes the model out of the catalogue only: the file and what
 * was written on it are left alone.
 */
import { useMemo, useState } from 'react';
import type { Key, Lang } from './i18n/strings';
import { filterEntries, folderOf, sortEntries, type LibraryEntry, type SortBy, type SortDir } from './model/library';

type T = (key: Key, vars?: Record<string, string | number>) => string;

/** The order a column starts in when first clicked: newest, biggest and most written first. */
const FIRST_DIR: Record<SortBy, SortDir> = { opened: 'desc', name: 'asc', parts: 'desc', notes: 'desc', folder: 'asc' };

const COLUMNS: { by: SortBy; label: Key }[] = [
  { by: 'name', label: 'library.col.name' },
  { by: 'parts', label: 'library.col.parts' },
  { by: 'notes', label: 'library.col.notes' },
  { by: 'folder', label: 'library.col.folder' },
  { by: 'opened', label: 'library.col.opened' },
];

/** « 3 minutes ago », « yesterday », in the reading language. */
function ago(ms: number, now: number, lang: Lang): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const s = Math.round((ms - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['second', 60], ['minute', 60], ['hour', 24], ['day', 30], ['month', 12]];
  let v = s;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return rtf.format(v, unit);
    v = Math.round(v / size);
  }
  return rtf.format(v, 'year');
}

export function LibraryView({ entries, written, lang, t, onOpen, onRemove }: {
  entries: LibraryEntry[];
  written: Record<string, number>;
  lang: Lang;
  t: T;
  onOpen: (e: LibraryEntry) => void;
  onRemove: (key: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [by, setBy] = useState<SortBy>('opened');
  const [dir, setDir] = useState<SortDir>('desc');
  const now = Date.now();

  const rows = useMemo(
    () => sortEntries(filterEntries(entries, query), by, dir, k => written[k] ?? 0),
    [entries, query, by, dir, written],
  );

  const sortBy = (col: SortBy) => {
    if (col === by) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setBy(col); setDir(FIRST_DIR[col]); }
  };

  return (
    <section className="library" aria-label={t('library.title')}>
      <header className="library-head">
        <h2>{t('library.title')}</h2>
        <input type="search" placeholder={t('library.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </header>

      {!entries.length ? (
        <div className="muted library-empty">{t('library.empty')}</div>
      ) : !rows.length ? (
        <div className="muted library-empty">{t('library.noMatch')}</div>
      ) : (
        <table className="library-table">
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <th key={c.by} aria-sort={by === c.by ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => sortBy(c.by)}>
                    {t(c.label)}{by === c.by ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              <th aria-label={t('library.remove')} />
            </tr>
          </thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.key} className={e.path ? 'openable' : 'dropped'}
                title={e.path ?? t('library.dropAgain')}
                onClick={() => onOpen(e)}>
                <td className="name">{e.name}</td>
                <td className="num">{e.parts}</td>
                <td className="num">{written[e.key] ?? 0}</td>
                <td className="folder">{e.path ? folderOf(e.path) : t('library.dropped')}</td>
                <td className="when">{ago(e.openedAt, now, lang)}</td>
                <td>
                  <button type="button" className="remove" aria-label={t('library.remove')} title={t('library.remove')}
                    onClick={(ev) => { ev.stopPropagation(); onRemove(e.key); }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
