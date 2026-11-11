import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Heart, Library, X, CheckCircle2, Sparkles, Settings, AlertTriangle } from 'lucide-react';
import { api } from './api.js';
import { Cover } from './AuthorPage.jsx';
import { toIsbn13 } from '../shared/isbn.js';

const normalize = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');
const mainTitle = (t) => normalize(String(t || '').split(/\s*[:([]\s*|\s+[-–—]\s+/)[0].replace(/our\b/gi, 'or'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// The Series page: every series you have books in, in reading order, with the books you
// don't have shown greyed out in their place.
export default function SeriesPage({ books, hardcoverConnected, onOpenSettings, onOpenBook, onUpdateBook, onAddOwned, onAddWishlist }) {
  const [hcSeries, setHcSeries] = useState({}); // hardcover series id -> { loading, error, data }
  const [selected, setSelected] = useState(null);
  const [backfill, setBackfill] = useState(null); // { done, total, found, running }
  const cancelRef = useRef(false);

  // Group the library's books by series.
  const groups = useMemo(() => {
    const map = new Map();
    for (const b of books) {
      if (!b.series) continue;
      const key = b.hardcoverSeriesId ? `hc-${b.hardcoverSeriesId}` : `name-${normalize(b.series)}`;
      if (!map.has(key)) map.set(key, { key, name: b.series, hardcoverSeriesId: b.hardcoverSeriesId || null, books: [] });
      const g = map.get(key);
      g.books.push(b);
      g.hardcoverSeriesId = g.hardcoverSeriesId || b.hardcoverSeriesId || null;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [books]);

  // Load each series' full book list from Hardcover, one at a time (Hardcover allows 60 requests a minute).
  useEffect(() => {
    if (!hardcoverConnected) return;
    let cancelled = false;
    (async () => {
      for (const g of groups) {
        if (cancelled) return;
        const id = g.hardcoverSeriesId;
        if (!id || hcSeries[id]) continue;
        setHcSeries(prev => ({ ...prev, [id]: { loading: true } }));
        try {
          const data = await api.seriesBooks(id);
          setHcSeries(prev => ({ ...prev, [id]: { data } }));
        } catch (err) {
          setHcSeries(prev => ({ ...prev, [id]: { error: err.message } }));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, hardcoverConnected]);

  const withoutSeries = books.filter(b => !b.series && !b.seriesChecked);

  const findMissingSeries = async () => {
    cancelRef.current = false;
    const todo = withoutSeries;
    setBackfill({ done: 0, total: todo.length, found: 0, running: true });
    let found = 0;
    for (let i = 0; i < todo.length; i++) {
      if (cancelRef.current) break;
      const b = todo[i];
      try {
        const { series } = await api.findSeries({
          isbn: toIsbn13(b.editions?.[0]?.isbn) || '',
          title: b.workTitle,
          author: b.author
        });
        if (series) {
          found++;
          await onUpdateBook(b.id, { series: series.name, seriesNumber: series.position, hardcoverSeriesId: series.id });
        } else {
          await onUpdateBook(b.id, { seriesChecked: true }); // don't ask again for standalone books
        }
      } catch (err) {
        setBackfill(prev => ({ ...prev, error: err.message }));
        if (/busy|too many/i.test(err.message)) await sleep(30000);
        else break;
      }
      setBackfill(prev => ({ ...prev, done: i + 1, found }));
      await sleep(1100); // stay under Hardcover's limit
    }
    setBackfill(prev => ({ ...prev, running: false }));
  };

  // Build the list of positions for one series: owned/wishlist books in colour, missing ones greyed.
  const slotsFor = (g) => {
    const hc = g.hardcoverSeriesId ? hcSeries[g.hardcoverSeriesId]?.data : null;
    const used = new Set();
    const slots = [];
    if (hc) {
      for (const hb of hc.books) {
        const lib = g.books.find(b => !used.has(b.id) && (Number(b.seriesNumber) === hb.position || mainTitle(b.workTitle) === mainTitle(hb.title)));
        if (lib) used.add(lib.id);
        slots.push({ position: hb.position, title: lib?.workTitle || hb.title, year: hb.year, cover: lib?.customCoverUrl || hb.cover, lib, hc: hb });
      }
    }
    for (const lib of g.books) {
      if (!used.has(lib.id)) slots.push({ position: Number(lib.seriesNumber) || null, title: lib.workTitle, cover: lib.customCoverUrl, lib });
    }
    slots.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
    // Without Hardcover, show gaps in the numbering (you have #1 and #3 → #2 is missing).
    if (!hc) {
      const numbers = new Set(slots.map(s => s.position).filter(n => Number.isInteger(n)));
      const max = Math.max(0, ...numbers);
      for (let n = 1; n < max; n++) if (!numbers.has(n)) slots.push({ position: n, title: null, gap: true });
      slots.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
    }
    return { slots, hc };
  };

  const statusOf = (slot) => (!slot.lib ? 'missing' : slot.lib.owned === false ? 'wishlist' : 'owned');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Layers className="w-5 h-5 text-orange-500" /> Series</h2>
          <p className="text-xs text-slate-500">Your series in reading order. Greyed-out books are the ones you don't have yet.</p>
        </div>
        {hardcoverConnected && withoutSeries.length > 0 && !backfill?.running && (
          <button onClick={findMissingSeries} className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 self-start">
            <Sparkles className="w-3.5 h-3.5" /> Find series for {withoutSeries.length} {withoutSeries.length === 1 ? 'book' : 'books'}
          </button>
        )}
      </div>

      {!hardcoverConnected && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="flex-1">Connect <b>Hardcover</b> to fill in series automatically and see every book in each series.</span>
          <button onClick={onOpenSettings} className="px-3 py-2 bg-white border border-amber-300 rounded-xl font-semibold flex items-center gap-1.5 self-start">
            <Settings className="w-3.5 h-3.5" /> Open Settings
          </button>
        </div>
      )}

      {backfill && (
        <div className="p-3 bg-white border border-slate-200 rounded-2xl text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span>
              {backfill.running ? `Checking ${backfill.done + 1 > backfill.total ? backfill.total : backfill.done + 1} of ${backfill.total}…` : `Checked ${backfill.done} of ${backfill.total}.`}
              {' '}Found a series for {backfill.found}.
            </span>
            {backfill.running
              ? <button onClick={() => { cancelRef.current = true; }} className="font-semibold underline">Stop</button>
              : <button onClick={() => setBackfill(null)} className="font-semibold underline">Done</button>}
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 transition-all" style={{ width: `${backfill.total ? (100 * backfill.done) / backfill.total : 0}%` }} />
          </div>
          {backfill.error && <p className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {backfill.error}</p>}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-500">
          No series yet. {hardcoverConnected
            ? 'Tap "Find series" above, or add a book that belongs to one.'
            : 'Set a series on a book with its Edit button, or connect Hardcover to fill them in automatically.'}
        </div>
      ) : (
        groups.map(g => {
          const { slots, hc } = slotsFor(g);
          const state = g.hardcoverSeriesId ? hcSeries[g.hardcoverSeriesId] : null;
          const owned = slots.filter(s => statusOf(s) === 'owned' && !s.gap).length;
          const total = slots.length;
          return (
            <section key={g.key} className="p-4 bg-white border border-slate-200/80 rounded-3xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900">{hc?.name || g.name}</h3>
                  <p className="text-[11px] text-slate-500">
                    {g.books[0]?.author} · You own {owned} of {total}
                    {state?.loading && ' · loading the full series…'}
                  </p>
                  {state?.error && <p className="text-[11px] text-red-600">{state.error}</p>}
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {slots.map((slot, i) => {
                  const status = statusOf(slot);
                  return (
                    <button
                      key={`${slot.position}-${i}`}
                      onClick={() => (slot.gap ? null : status === 'owned' ? onOpenBook(slot.lib) : setSelected({ slot, group: g, hc }))}
                      className={`w-24 sm:w-28 flex-shrink-0 text-left group ${slot.gap ? 'cursor-default' : ''}`}
                    >
                      {slot.gap ? (
                        <div className="aspect-[2/3] rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-[11px] text-slate-400 text-center p-2">
                          Book #{slot.position}<br />not in your library
                        </div>
                      ) : (
                        <div className="relative">
                          <Cover url={slot.cover} title={slot.title} author={g.books[0]?.author} muted={status !== 'owned'} />
                          {status === 'wishlist' && (
                            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center shadow">
                              <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                            </span>
                          )}
                          {status === 'owned' && (
                            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      )}
                      <p className="mt-1 text-[10px] font-bold text-orange-600">{slot.position ? `#${slot.position}` : '—'}</p>
                      {!slot.gap && <p className={`text-[11px] font-bold leading-tight line-clamp-2 ${status === 'owned' ? 'text-slate-900' : 'text-slate-400'}`}>{slot.title}</p>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {/* A book in a series that you don't own */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-3">
              <div className="w-24 flex-shrink-0">
                <Cover url={selected.slot.cover} title={selected.slot.title} author={selected.group.books[0]?.author} />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] font-bold text-orange-600">{selected.hc?.name || selected.group.name} #{selected.slot.position}</p>
                <h4 className="text-base font-bold text-slate-900 leading-tight">{selected.slot.title}</h4>
                <p className="text-xs text-slate-600">{selected.group.books[0]?.author}</p>
                {selected.slot.year && <p className="text-[11px] text-slate-400">Published {selected.slot.year}</p>}
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            {(() => {
              const { slot, group, hc } = selected;
              const seriesInfo = { series: hc?.name || group.name, seriesNumber: slot.position, hardcoverSeriesId: group.hardcoverSeriesId };
              const entry = { title: slot.title, year: slot.year, cover: slot.cover, coAuthors: [], isbn13: null, workKey: null, ...seriesInfo };
              const author = { name: group.books[0]?.author || '' };
              return slot.lib ? (
                <button onClick={() => { setSelected(null); onOpenBook(slot.lib); }} className="w-full py-2.5 rounded-xl text-xs font-semibold bg-slate-900 text-white">
                  Open in my library
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setSelected(null); onAddOwned(entry, author); }} className="py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5">
                    <Library className="w-3.5 h-3.5" /> I own this
                  </button>
                  <button onClick={() => { setSelected(null); onAddWishlist(entry, author); }} className="py-2.5 rounded-xl text-xs font-semibold bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center gap-1.5">
                    <Heart className="w-3.5 h-3.5" /> Add to Wishlist
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
