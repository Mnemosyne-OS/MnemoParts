/**
 * App — open a file, explode it, name the parts, keep the sheet.
 *
 * The 3D stage is imperative (`viewer/Viewer.ts`); this component owns what a
 * person decides: names, notes, which part is selected or hidden, how far the
 * model is open. Names and notes are written to the host-side store as they
 * are typed (on Enter or when the field is left), and into memory only on the
 * « keep » gesture, as one sheet per model.
 *
 * Every state is said on screen: reading (with a clock, a STEP takes seconds),
 * failed (with the reason), and outside Mnemosyne OS (names are not kept).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n/useI18n';
import type { Key } from './i18n/strings';
import { loadModel, LoadError, FORMATS, isSlowFormat } from './model/load';
import { hashBytes, readCached, writeCached } from './model/cache';
import { readableName, type NameLang } from './model/names';
import { buildSheet, modelKey, type ModelRecord } from './model/note';
import { baseName, folderOf, forgetPath, recordOpen, removeEntry, type LibraryEntry } from './model/library';
import { LibraryView } from './LibraryView';
import { SourcesView } from './SourcesView';
import { SketchfabView } from './SketchfabView';
import {
  detachWindow, keepSheet, openExternal, PermissionError, pickFile, readHostFile, readLibrary, readModel, StoreFullError, takeHandoff,
  writeHandoff, writeLibrary, writeModel,
} from './store';
import { Viewer, type ExplodeMode } from './viewer/Viewer';

type Status =
  | { kind: 'idle' }
  | { kind: 'reading'; file: string; seconds: number; phase: Phase; startedAt: number }
  | { kind: 'ready'; parts: number; named: number; seconds: number; layers: number; cached: boolean }
  | { kind: 'error'; key: Key; vars: Record<string, string | number> };

/** What the loader is doing right now: each phase is a different wait, and the screen names it. */
type Phase = 'read' | 'cache' | 'parse' | 'build';

type Store = { kind: 'none' } | { kind: 'ok' } | { kind: 'error'; text: string };
type FileInfo = { name: string; key: string; path?: string; hash?: string };
type Memory = { kind: 'idle' } | { kind: 'saving' } | { kind: 'done'; vault: string; unlocked: boolean } | { kind: 'error'; text: string };

/**
 * One open model. The active tab's fields live in the component's state; the
 * others wait here, as they were left, and come back on a click.
 */
type Tab = {
  id: string;
  file: FileInfo;
  raws: string[];
  record: ModelRecord;
  store: Store;
  memory: Memory;
  selected: number;
  hidden: Set<number>;
  explode: number;
  mode: ExplodeMode;
  status: Status;
};

let tabSeq = 0;
const newTabId = () => `t${++tabSeq}`;

/**
 * A file to open: dropped or picked in the frame (bytes only), picked by the
 * host (with its path), or handed over to a detached window already read
 * (`prepared`: the model's GLB and the key its names and notes live under).
 */
type Source = { name: string; bytes: () => Promise<ArrayBuffer>; path?: string; prepared?: { key: string } };

/** This window's instance token when it was opened by « detach »; null for the main window. */
const INSTANCE = (() => {
  try { return new URLSearchParams(window.location.search).get('instance'); }
  catch (e) { console.warn('[parts] no location to read the instance from', e); return null; }
})();
// Electron gives a dropped or picked File its path; outside Electron it has none.
const fromFile = (f: File): Source => {
  const path = (f as File & { path?: unknown }).path;
  return { name: f.name, bytes: () => f.arrayBuffer(), ...(typeof path === 'string' && path ? { path } : {}) };
};

const IN_HOST = typeof window !== 'undefined' && window.parent !== window;
const EMPTY: ModelRecord = { names: {}, notes: {} };

function nameLangOf(lang: string): NameLang {
  return lang === 'fr' || lang === 'es' ? lang : 'en';
}

export default function App() {
  const { lang, t } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [file, setFile] = useState<FileInfo | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [raws, setRaws] = useState<string[]>([]);
  const [record, setRecord] = useState<ModelRecord>(EMPTY);
  const [store, setStore] = useState<Store>({ kind: 'none' });
  const [memory, setMemory] = useState<Memory>({ kind: 'idle' });
  const [selected, setSelected] = useState(-1);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState('');
  const [explode, setExplode] = useState(0);
  const [mode, setMode] = useState<ExplodeMode>('layers');
  const [over, setOver] = useState(false);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [written, setWritten] = useState<Record<string, number>>({});
  const [view, setView] = useState<'model' | 'library' | 'sources' | 'sketchfab'>('model');
  const libraryRead = useRef(false);

  // The active tab as it is right now, for the async open and the tab switch:
  // a closure taken when a slow STEP began reading would hand back a stale one.
  const tabsRef = useRef<Tab[]>([]);
  tabsRef.current = tabs;
  const live = useRef<Tab | null>(null);
  // « Reading » belongs to the file being opened, not to the tab on screen:
  // the tab keeps the summary it had.
  const tabStatus = status.kind === 'reading' ? (tabs.find(x => x.id === activeTab)?.status ?? status) : status;
  live.current = activeTab && file
    ? { id: activeTab, file, raws, record, store, memory, selected, hidden, explode, mode, status: tabStatus }
    : null;
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeTab;

  const restore = (tab: Tab) => {
    setFile(tab.file); setRaws(tab.raws); setRecord(tab.record); setStore(tab.store); setMemory(tab.memory);
    setSelected(tab.selected); setHidden(tab.hidden); setExplode(tab.explode); setMode(tab.mode); setStatus(tab.status);
  };

  /** The tab list with the active tab's current fields written back into it. */
  const tabsWithLive = (): Tab[] => {
    const cur = live.current;
    return tabsRef.current.map(tab => (cur && tab.id === cur.id ? cur : tab));
  };

  const switchTo = (id: string) => {
    setView('model');
    if (id === activeRef.current) return;
    const all = tabsWithLive();
    const target = all.find(tab => tab.id === id);
    if (!target) return;
    viewerRef.current?.show(id);
    setTabs(all);
    restore(target);
    setActiveTab(id);
  };

  const closeTab = (id: string) => {
    viewerRef.current?.removeModel(id);
    const rest = tabsWithLive().filter(tab => tab.id !== id);
    setTabs(rest);
    if (id !== activeRef.current) return;
    const next = rest[rest.length - 1];
    if (next) {
      viewerRef.current?.show(next.id);
      restore(next);
      setActiveTab(next.id);
    } else {
      setActiveTab(null); setFile(null); setRaws([]); setRecord(EMPTY); setStore({ kind: 'none' });
      setMemory({ kind: 'idle' }); setSelected(-1); setHidden(new Set()); setExplode(0); setStatus({ kind: 'idle' });
      if (library.length) setView('library');
    }
  };

  useEffect(() => {
    alive.current = true;
    const host = stageRef.current;
    if (!host) return undefined;
    const viewer = new Viewer(host, (i) => setSelected(i));
    viewer.canvas.setAttribute('aria-label', t('a11y.scene'));
    viewerRef.current = viewer;
    return () => { alive.current = false; viewer.dispose(); viewerRef.current = null; };
    // The viewer lives as long as the page; its label follows the language below.
  }, []);

  useEffect(() => { viewerRef.current?.canvas.setAttribute('aria-label', t('a11y.scene')); }, [lang, t]);

  // Display names: the person's own name wins, then the decoded code, then the
  // raw code. Repeats of one decoded name are numbered so no two rows read alike.
  const parts = useMemo(() => {
    const nl = nameLangOf(lang);
    const seen = new Map<string, number>();
    return raws.map((raw, i) => {
      const own = record.names[raw];
      const decoded = readableName(raw, nl);
      let name = own || decoded || raw || t('part.unnamed', { n: i + 1 });
      if (!own) {
        const n = (seen.get(name) ?? 0) + 1;
        seen.set(name, n);
        if (n > 1) name = `${name} (${n})`;
      }
      return { raw, name, own: !!own, decoded: !own && !!decoded, note: record.notes[raw] ?? '' };
    });
  }, [raws, record, lang, t]);

  useEffect(() => { viewerRef.current?.select(selected); }, [selected, raws]);
  useEffect(() => { viewerRef.current?.setVisible(raws.map((_, i) => !hidden.has(i))); }, [hidden, raws]);
  useEffect(() => { viewerRef.current?.setExplode(explode, mode); }, [explode, mode, raws]);

  // The catalogue of every model opened. Each change is written whole; a write
  // that fails is said in the console and the list on screen stays right for
  // this session.
  const changeLibrary = useCallback((change: (l: LibraryEntry[]) => LibraryEntry[]) => {
    setLibrary(prev => {
      const next = change(prev);
      if (IN_HOST && libraryRead.current) writeLibrary(next).catch(e => console.warn('[parts] library not saved', e));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!IN_HOST) return;
    readLibrary()
      .then(({ library: l, written: w }) => {
        if (!alive.current) return;
        libraryRead.current = true;
        setLibrary(l);
        setWritten(w);
        // With models to come back to, the catalogue is the first screen.
        if (l.length && !INSTANCE) setView(v => (v === 'model' && !raws.length ? 'library' : v));
      })
      // Unread is not empty: the catalogue is never written over a store nobody could read.
      .catch(e => console.warn('[parts] library unreadable', e));
    // Read once, at mount.
  }, []);

  // What the person wrote on the open model, kept current for the catalogue's « notes » column.
  useEffect(() => {
    if (!file) return;
    const n = Object.values(record.names).filter(v => v.trim()).length + Object.values(record.notes).filter(v => v.trim()).length;
    setWritten(w => (w[file.key] === n ? w : { ...w, [file.key]: n }));
  }, [file, record]);

  const fromHost = (path: string): Source => ({ name: baseName(path), path, bytes: () => readHostFile(path) });

  const choose = async () => {
    if (!IN_HOST) { fileInput.current?.click(); return; }
    try {
      const last = library.find(e => e.path)?.path;
      const path = await pickFile(last ? folderOf(last) : '', t('drop.formats'));
      if (path) void open(fromHost(path));
    } catch (e) {
      console.warn('[parts] picker refused', e);
      setStatus({ kind: 'error', key: e instanceof PermissionError ? 'err.pickPermission' : 'err.read', vars: { why: (e as Error).message } });
    }
  };

  // Opens run one after the other: a second file dropped while the first is
  // still reading waits its turn, instead of two loaders writing the same
  // status and the same tab list at once.
  const openQueue = useRef<Promise<void>>(Promise.resolve());
  const open = (f: Source): Promise<void> => {
    const run = openQueue.current.then(() => openNow(f));
    openQueue.current = run.catch(() => undefined);
    return run;
  };

  const openNow = async (f: Source) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    // A model already open in a tab comes to the front instead of opening twice.
    const openTab = (match: (tab: Tab) => boolean) => {
      const tab = tabsWithLive().find(match);
      if (tab) switchTo(tab.id);
      return !!tab;
    };
    if (f.path && openTab(tab => tab.file.path === f.path)) return;
    const started = performance.now();
    setStatus({ kind: 'reading', file: f.name, seconds: 0, phase: 'read', startedAt: started });
    setMemory({ kind: 'idle' });
    try {
      const buf = await f.bytes();
      // Measured before the reader takes the bytes: a transfer to the worker empties them.
      const bytes = buf.byteLength;
      const key = f.prepared?.key ?? modelKey(f.name, bytes);
      if (openTab(tab => tab.file.key === key)) return;
      const slow = !f.prepared && isSlowFormat(f.name);
      const hash = slow ? await hashBytes(buf).catch((e) => { console.warn('[parts] no hash, no cache', e); return null; }) : null;
      let glb: ArrayBuffer | null = null;
      if (hash) {
        setStatus({ kind: 'reading', file: f.name, seconds: 0, phase: 'cache', startedAt: started });
        glb = await readCached(hash).catch((e) => { console.warn('[parts] cache unreadable', e); return null; });
      }
      if (f.prepared) glb = buf;
      const object = glb
        ? await loadModel(glb, 'cached.glb', () => undefined)
        : await loadModel(buf, f.name, (seconds) => {
          if (alive.current) setStatus({ kind: 'reading', file: f.name, seconds, phase: 'parse', startedAt: started });
        });
      if (!alive.current) return;
      // Placing a hundred parts blocks the page for a moment: let « placing » paint first.
      // A timer, never requestAnimationFrame: a hidden or minimised window draws
      // no frame, and the open would wait for one forever.
      setStatus({ kind: 'reading', file: f.name, seconds: 0, phase: 'build', startedAt: started });
      await new Promise(r => setTimeout(r, 30));
      if (!alive.current) return;
      const id = newTabId();
      const before = tabsWithLive();
      const vp = viewer.addModel(id, object);
      const rawNames = vp.map(p => p.rawName);
      const nl = nameLangOf(lang);
      const fileInfo: FileInfo = { name: f.name, key, ...(f.path ? { path: f.path } : {}), ...(hash ? { hash } : {}) };
      const ready: Status = {
        kind: 'ready',
        parts: rawNames.length,
        named: rawNames.filter(r => readableName(r, nl)).length,
        seconds: Math.round((performance.now() - started) / 100) / 10,
        layers: viewer.layerCount,
        cached: !!glb,
      };
      const tab: Tab = {
        id, file: fileInfo, raws: rawNames, record: EMPTY, store: { kind: 'none' }, memory: { kind: 'idle' },
        selected: -1, hidden: new Set(), explode: 0, mode: 'layers', status: ready,
      };
      setTabs([...before, tab]);
      setActiveTab(id);
      restore(tab);
      // Read the long way: keep the parts so the same bytes open from the cache next time.
      if (hash && !glb) {
        viewer.exportGlb()
          .then(out => writeCached(hash, f.name, out))
          .catch(e => console.warn('[parts] not cached', e));
      }
      // A detached window shows the model; the main window already counted it.
      if (!f.prepared) changeLibrary(l => recordOpen(l, {
        key, name: f.name, path: f.path, bytes, parts: rawNames.length,
        named: rawNames.filter(r => readableName(r, nl)).length, layers: viewer.layerCount,
      }, Date.now()));
      setView('model');
      if (!IN_HOST) return;
      // The names and notes land in whichever tab is the model's by then.
      const land = (patch: Partial<Tab>) => {
        if (!alive.current) return;
        if (activeRef.current === id) {
          if (patch.record) setRecord(patch.record);
          if (patch.store) setStore(patch.store);
        } else {
          setTabs(ts => ts.map(x => (x.id === id ? { ...x, ...patch } : x)));
        }
      };
      try {
        land({ record: await readModel(key), store: { kind: 'ok' } });
      } catch (e) {
        // Unread is not empty: writes stay refused until a read succeeds.
        land({ store: { kind: 'error', text: t('store.failed', { why: (e as Error).message }) } });
      }
    } catch (e) {
      console.error('[parts] could not open', f.name, e);
      if (f.path) { const gone = f.path; changeLibrary(l => forgetPath(l, gone)); }
      if (!alive.current) return;
      setStatus(e instanceof LoadError
        ? { kind: 'error', key: e.key, vars: e.vars }
        : { kind: 'error', key: 'err.read', vars: { why: (e as Error).message } });
    }
  };

  /**
   * Move a tab into its own window. The model travels by path when it has one
   * (the new window reads it, from the cache when it is a STEP), otherwise as
   * a GLB through the cache, so a dropped file detaches too. The tab closes
   * here once the window is open.
   */
  const detach = async (tab: Tab) => {
    const instance = `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    try {
      let cache: string | undefined;
      if (!tab.file.path) {
        cache = `detach:${instance}`;
        await writeCached(cache, tab.file.name, await viewerRef.current!.exportGlb(tab.id));
      }
      await writeHandoff(instance, { key: tab.file.key, name: tab.file.name, ...(tab.file.path ? { path: tab.file.path } : {}), ...(cache ? { cache } : {}) });
      await detachWindow(instance);
      closeTab(tab.id);
    } catch (e) {
      console.warn('[parts] detach failed', e);
      if (alive.current) setStatus({ kind: 'error', key: 'err.detach', vars: { why: (e as Error).message } });
    }
  };

  // A detached window opens the model it was made for, once, at mount.
  useEffect(() => {
    if (!INSTANCE || !IN_HOST) return;
    takeHandoff(INSTANCE)
      .then(async (h) => {
        if (!h) { if (alive.current) setStatus({ kind: 'error', key: 'err.handoff', vars: {} }); return; }
        if (h.path) { await open(fromHost(h.path)); return; }
        const glb = h.cache ? await readCached(h.cache) : null;
        if (!glb) { if (alive.current) setStatus({ kind: 'error', key: 'err.handoff', vars: {} }); return; }
        await open({ name: h.name, bytes: async () => glb, prepared: { key: h.key } });
      })
      .catch((e) => {
        console.warn('[parts] handoff unreadable', e);
        if (alive.current) setStatus({ kind: 'error', key: 'err.read', vars: { why: (e as Error).message } });
      });
    // Once, at mount: the token in the URL never changes.
  }, []);

  const save = useCallback((next: ModelRecord) => {
    setRecord(next);
    if (!file || store.kind !== 'ok') return;
    writeModel(file.key, next).catch((e) => {
      console.warn('[parts] names not saved', e);
      if (alive.current) setStore({ kind: 'error', text: e instanceof StoreFullError ? t('store.full') : t('store.failed', { why: (e as Error).message }) });
    });
  }, [file, store.kind, t]);

  const rename = (raw: string, value: string) => {
    if ((record.names[raw] ?? '') === value.trim()) return;
    save({ ...record, names: { ...record.names, [raw]: value.trim() } });
  };
  const writeNote = (raw: string, value: string) => {
    if ((record.notes[raw] ?? '') === value) return;
    save({ ...record, notes: { ...record.notes, [raw]: value } });
  };

  const keep = async () => {
    if (!file) return;
    setMemory({ kind: 'saving' });
    const sheet = buildSheet(file.name, parts.map(p => ({ raw: p.raw, name: p.name, note: p.note, ownName: p.own })), {
      title: t('sheet.title'), file: t('sheet.file'), parts: t('sheet.parts'), named: t('sheet.named'),
      notes: t('sheet.notes'), code: t('sheet.code'),
    });
    try {
      const done = await keepSheet(sheet);
      if (alive.current) setMemory({ kind: 'done', ...done });
    } catch (e) {
      console.warn('[parts] sheet not written', e);
      if (alive.current) setMemory({ kind: 'error', text: e instanceof PermissionError ? t('memory.noPermission') : t('memory.failed', { why: (e as Error).message }) });
    }
  };

  // A site opens in the person's browser. A cartridge frame cannot open a
  // window of its own, so inside Mnemosyne OS the host opens it.
  const visit = (url: string) => {
    if (!IN_HOST) { window.open(url, '_blank', 'noopener'); return; }
    openExternal(url).catch(e => console.warn('[parts] site not opened', url, e));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void open(fromFile(f));
  };

  const q = filter.trim().toLowerCase();
  const rows = parts.map((p, i) => ({ ...p, i })).filter(p => !q || p.name.toLowerCase().includes(q) || p.raw.toLowerCase().includes(q));
  const sel = parts[selected];
  const accept = FORMATS.map(f => `.${f}`).join(',');

  return (
    <div className="app" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <aside className="side">
        <div className={`drop${over ? ' over' : ''}`}>
          <div className="drop-title">{t('drop.title')}</div>
          <button type="button" onClick={() => void choose()}>{t('drop.choose')}</button>
          <div className="muted">{t('drop.formats')}</div>
          <input ref={fileInput} type="file" hidden accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(fromFile(f)); e.target.value = ''; }} />
        </div>

        {IN_HOST && (
          <button type="button" className={`library-toggle${view === 'library' ? ' on' : ''}`}
            onClick={() => setView(v => (v === 'library' ? 'model' : 'library'))}>
            {view === 'library' && raws.length ? t('library.back') : t('library.button', { count: library.length })}
          </button>
        )}
        <button type="button" className={`library-toggle${view === 'sources' ? ' on' : ''}`}
          onClick={() => setView(v => (v === 'sources' ? 'model' : 'sources'))}>
          {view === 'sources' && raws.length ? t('library.back') : t('sources.button')}
        </button>
        <button type="button" className={`library-toggle${view === 'sketchfab' ? ' on' : ''}`}
          onClick={() => setView(v => (v === 'sketchfab' ? 'model' : 'sketchfab'))}>
          {view === 'sketchfab' && raws.length ? t('library.back') : t('sketchfab.button')}
        </button>

        <StatusLine status={status} t={t} />
        {!IN_HOST && <div className="note muted">{t('memory.noHost')}</div>}
        {store.kind === 'error' && <div className="note error">{store.text}</div>}

        {raws.length > 0 && (
          <>
            <div className="row">
              <label className="grow">{t('explode.label')}
                <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
              </label>
              <div className="segmented" role="radiogroup" aria-label={t('explode.label')}>
                {(['layers', 'radial'] as const).map(m => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m}
                    className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                    {t(m === 'layers' ? 'mode.layers' : 'mode.radial')}
                  </button>
                ))}
              </div>
            </div>

            <div className="part">
              {sel ? (
                <PartEditor key={`${file?.key}:${sel.raw}`} part={sel} t={t} onRename={rename} onNote={writeNote} />
              ) : <div className="muted">{t('part.none')}</div>}
              <div className="row">
                <button type="button" disabled={!sel} onClick={() => setHidden(new Set([...hidden, selected]))}>{t('part.hide')}</button>
                <button type="button" disabled={!sel} onClick={() => setHidden(new Set(parts.map((_, i) => i).filter(i => i !== selected)))}>{t('part.isolate')}</button>
                <button type="button" disabled={!hidden.size} onClick={() => setHidden(new Set())}>{t('part.showAll')}</button>
              </div>
            </div>

            <input className="filter" type="search" placeholder={t('list.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <ul className="list">
              {rows.map(p => (
                <li key={p.i} title={p.raw}
                  className={[p.i === selected && 'on', hidden.has(p.i) && 'hidden', p.decoded && 'decoded'].filter(Boolean).join(' ')}
                  onClick={() => setSelected(p.i)}>{p.name}</li>
              ))}
            </ul>

            {IN_HOST && (
              <div className="keep">
                <button type="button" disabled={memory.kind === 'saving'} onClick={() => void keep()}>
                  {memory.kind === 'saving' ? t('memory.saving') : t('memory.keep')}
                </button>
                {memory.kind === 'done' && <div className="note">{t('memory.saved', { vault: memory.vault })}{!memory.unlocked && <> {t('memory.locked')}</>}</div>}
                {memory.kind === 'error' && <div className="note error">{memory.text}</div>}
              </div>
            )}
            <div className="muted small">{t('drop.reopen')}</div>
          </>
        )}
      </aside>
      <main className="stage">
        <div className="canvas-host" ref={stageRef} />
        {tabs.length > 0 && view === 'model' && (
          <div className="tabs" role="tablist">
            {tabs.map(tab => (
              <div key={tab.id} className={`tab${tab.id === activeTab ? ' on' : ''}`}>
                <button type="button" role="tab" aria-selected={tab.id === activeTab} title={tab.file.path ?? tab.file.name}
                  onClick={() => switchTo(tab.id)}>{tab.file.name}</button>
                {IN_HOST && (
                  <button type="button" className="tab-detach" aria-label={t('tab.detach')} title={t('tab.detach')}
                    onClick={() => void detach(tab)}>⧉</button>
                )}
                <button type="button" className="tab-close" aria-label={t('tab.close')} title={t('tab.close')}
                  onClick={() => closeTab(tab.id)}>×</button>
              </div>
            ))}
          </div>
        )}
        {status.kind === 'reading' && <Loading status={status} t={t} />}
        {view === 'sources' && status.kind !== 'reading' && <SourcesView lang={lang} t={t} onVisit={visit} />}
        {/* Kept mounted while hidden, so a search and its results survive a look at the model. */}
        <div hidden={view !== 'sketchfab' || status.kind === 'reading'}>
          <SketchfabView lang={lang} t={t} onVisit={visit} />
        </div>
        {view === 'library' && status.kind !== 'reading' && (
          <LibraryView entries={library} written={written} lang={lang} t={t}
            onOpen={(e) => {
              const tab = tabsWithLive().find(x => x.file.key === e.key);
              if (tab) switchTo(tab.id);
              else if (e.path) void open(fromHost(e.path));
            }}
            onRemove={(key) => changeLibrary(l => removeEntry(l, key))} />
        )}
      </main>
    </div>
  );
}

type T = ReturnType<typeof useI18n>['t'];

function StatusLine({ status, t }: { status: Status; t: T }) {
  if (status.kind === 'idle') return null;
  if (status.kind === 'reading') return null;
  if (status.kind === 'error') return <div className="status error">{t(status.key, status.vars)}</div>;
  return (
    <div className="status">
      <div>{t('status.loaded', { parts: status.parts, named: status.named })}</div>
      <div className="muted">{t(status.cached ? 'status.cached' : 'status.time', { seconds: status.seconds })} · {t('layers.count', { count: status.layers })}</div>
      {status.parts < 2 && <div>{t('status.single')}</div>}
    </div>
  );
}

const PHASE_KEY: Record<Phase, Key> = { read: 'loading.read', cache: 'loading.cache', parse: 'loading.parse', build: 'loading.build' };

/**
 * The wait, drawn: a cube that comes apart and back together, the file name,
 * what is happening, and a clock. There is no percentage because nothing
 * measures one: the STEP reader does not report progress, and a bar creeping
 * toward an invented 100 % reads as stuck. The clock is measured, so it moves.
 */
function Loading({ status, t }: { status: Extract<Status, { kind: 'reading' }>; t: T }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - status.startedAt) / 1000));
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="cube" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <span key={i} className={`c c${i}`} />)}
      </div>
      <div className="loading-file">{status.file}</div>
      <div className="loading-phase">{t(PHASE_KEY[status.phase])}</div>
      <div className="loading-clock">{t('loading.clock', { seconds })}</div>
    </div>
  );
}

function PartEditor({ part, t, onRename, onNote }: {
  part: { raw: string; name: string; decoded: boolean; note: string };
  t: T;
  onRename: (raw: string, v: string) => void;
  onNote: (raw: string, v: string) => void;
}) {
  const [name, setName] = useState(part.name);
  const [note, setNote] = useState(part.note);
  // Leaving the field unchanged writes nothing: the decoded name must never be
  // saved as if the person had typed it. An emptied field brings it back.
  const commit = () => { if (name.trim() !== part.name) onRename(part.raw, name); };
  return (
    <div className="editor">
      <label>{t('part.name')}
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          onBlur={commit} />
      </label>
      <div className="muted small">{part.decoded && <>{t('part.decoded')} · </>}{t('part.code', { code: part.raw })}</div>
      <label>{t('part.note')}
        <textarea rows={3} value={note} placeholder={t('part.notePlaceholder')}
          onChange={(e) => setNote(e.target.value)} onBlur={() => onNote(part.raw, note)} />
      </label>
    </div>
  );
}
