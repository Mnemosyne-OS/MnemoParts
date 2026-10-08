/**
 * SketchfabView — search Sketchfab's downloadable models from inside Parts.
 *
 * Each result shows its thumbnail, name, author, licence, face count and GLB
 * size, and opens its page in the person's browser, where they download it.
 * The model then comes into Parts by drop or by « choose a file ». Nothing is
 * asked of Sketchfab until the person presses Enter.
 */
import { useEffect, useRef, useState } from 'react';
import type { Key } from './i18n/strings';
import { fetchPage, formatBytes, searchUrl, type SketchfabModel } from './model/sketchfab';

type T = (key: Key, vars?: Record<string, string | number>) => string;

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; models: SketchfabModel[] }
  | { kind: 'ready'; models: SketchfabModel[]; next: string | null; query: string }
  | { kind: 'error'; models: SketchfabModel[]; why: string };

export function SketchfabView({ lang, t, onVisit }: { lang: string; t: T; onVisit: (url: string) => void }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);

  // A search still in flight when the view closes is cancelled.
  useEffect(() => () => abort.current?.abort(), []);

  const run = async (url: string, keep: SketchfabModel[], q: string) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setState({ kind: 'loading', models: keep });
    try {
      const page = await fetchPage(url, ctl.signal);
      if (ctl.signal.aborted) return;
      setState({ kind: 'ready', models: [...keep, ...page.models], next: page.next, query: q });
    } catch (e) {
      if (ctl.signal.aborted) return;
      console.warn('[parts] Sketchfab search failed', e);
      setState({ kind: 'error', models: keep, why: (e as Error).message });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) void run(searchUrl(q), [], q);
  };

  const models = state.kind === 'idle' ? [] : state.models;
  const nf = new Intl.NumberFormat(lang);

  return (
    <section className="sketchfab" aria-label={t('sketchfab.title')}>
      <header className="sources-head">
        <h2>{t('sketchfab.title')}</h2>
        <p className="muted">{t('sketchfab.intro')}</p>
        <form className="sketchfab-form" onSubmit={submit} role="search">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sketchfab.placeholder')} aria-label={t('sketchfab.placeholder')} />
          <button type="submit" disabled={!query.trim() || state.kind === 'loading'}>{t('sketchfab.search')}</button>
        </form>
      </header>

      {state.kind === 'ready' && !models.length && <div className="muted library-empty">{t('sketchfab.none', { query: state.query })}</div>}
      {state.kind === 'error' && <div className="note error">{t('sketchfab.failed', { why: state.why })}</div>}

      {models.length > 0 && (
        <div className="sketchfab-grid">
          {models.map(m => (
            <article key={m.uid} className="sketchfab-card">
              <button type="button" className="sketchfab-thumb" onClick={() => onVisit(m.pageUrl)} title={t('sketchfab.open')}>
                {m.thumb ? <img src={m.thumb} alt="" loading="lazy" /> : <span className="muted">{t('sketchfab.noThumb')}</span>}
              </button>
              <div className="source-name" title={m.name}>{m.name}</div>
              <div className="muted small">
                {t('sketchfab.by')}{' '}
                {m.authorUrl
                  ? <button type="button" className="link" onClick={() => onVisit(m.authorUrl!)}>{m.author}</button>
                  : m.author}
              </div>
              <dl className="source-facts">
                <dt>{t('sources.licence')}</dt><dd>{m.licence}</dd>
                {m.faces !== undefined && <><dt>{t('sketchfab.faces')}</dt><dd>{nf.format(m.faces)}</dd></>}
                {m.glbBytes !== undefined && <><dt>GLB</dt><dd>{formatBytes(m.glbBytes, lang)}</dd></>}
              </dl>
              <button type="button" onClick={() => onVisit(m.pageUrl)}>{t('sketchfab.open')}</button>
            </article>
          ))}
        </div>
      )}

      {state.kind === 'loading' && <div className="muted library-empty">{t('sketchfab.loading')}</div>}
      {state.kind === 'ready' && state.next && (
        <button type="button" className="sketchfab-more" onClick={() => void run(state.next!, models, state.query)}>{t('sketchfab.more')}</button>
      )}

      <p className="muted small">
        {t('sketchfab.credit')}{' '}
        <button type="button" className="link" onClick={() => onVisit('https://sketchfab.com')}>sketchfab.com</button>
      </p>
    </section>
  );
}
