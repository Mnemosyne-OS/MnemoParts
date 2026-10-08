/**
 * SourcesView — the sites that offer 3D models Parts can open, as a grid.
 *
 * Each card says what the site offers, the licence its models usually carry,
 * its formats (the ones Parts reads are marked), and whether parts tend to
 * arrive named. The button opens the site in the person's browser; the file
 * they download there comes back by drop or by « choose a file ».
 */
import type { Key } from './i18n/strings';
import { GROUPS, opensHere, READABLE, SOURCES, type Naming, type Source, type SourceGroup, type SourceLang } from './model/sources';

type T = (key: Key, vars?: Record<string, string | number>) => string;

const GROUP_KEY: Record<SourceGroup, Key> = {
  makers: 'sources.group.makers', open: 'sources.group.open', public: 'sources.group.public',
  community: 'sources.group.community', test: 'sources.group.test',
};
const NAMING_KEY: Record<Naming, Key> = {
  named: 'sources.naming.named', 'per-file': 'sources.naming.perFile',
  mixed: 'sources.naming.mixed', 'one-surface': 'sources.naming.oneSurface',
};

export function SourcesView({ lang, t, onVisit }: { lang: string; t: T; onVisit: (url: string) => void }) {
  const l: SourceLang = lang === 'fr' || lang === 'es' ? lang : 'en';
  return (
    <section className="sources" aria-label={t('sources.title')}>
      <header className="sources-head">
        <h2>{t('sources.title')}</h2>
        <p className="muted">{t('sources.intro')}</p>
      </header>
      {GROUPS.map(g => {
        const list = SOURCES.filter(s => s.group === g);
        if (!list.length) return null;
        return (
          <div key={g} className="sources-group">
            <h3>{t(GROUP_KEY[g])}</h3>
            <div className="sources-grid">
              {list.map(s => <SourceCard key={s.id} s={s} l={l} t={t} onVisit={onVisit} />)}
            </div>
          </div>
        );
      })}
      <p className="muted small">{t('sources.footnote')}</p>
    </section>
  );
}

function SourceCard({ s, l, t, onVisit }: { s: Source; l: SourceLang; t: T; onVisit: (url: string) => void }) {
  return (
    <article className="source-card">
      <div className="source-top">
        <span className="source-mark" style={{ background: s.color }} aria-hidden="true">{s.name.charAt(0)}</span>
        <div>
          <div className="source-name">{s.name}</div>
          <div className="muted small">{new URL(s.url).hostname.replace(/^www\./, '')}</div>
        </div>
      </div>
      <p className="source-about">{s.about[l]}</p>
      <dl className="source-facts">
        <dt>{t('sources.licence')}</dt><dd>{s.licence[l]}</dd>
        <dt>{t('sources.formats')}</dt>
        <dd>{s.formats.map(f => (
          <span key={f} className={`fmt${READABLE.includes(f.toLowerCase()) ? ' ok' : ''}`}>{f}</span>
        ))}</dd>
        <dt>{t('sources.names')}</dt><dd>{t(NAMING_KEY[s.naming])}</dd>
      </dl>
      {!opensHere(s) && <div className="note error small">{t('sources.noFormat')}</div>}
      <button type="button" onClick={() => onVisit(s.url)}>{t('sources.visit')}</button>
    </article>
  );
}
