import React, { useEffect, useMemo, useState } from 'react';
import {
  Compass, Search, RefreshCw, AlertTriangle, ArrowLeft, Heart, Library, EyeOff, Eye, X, CheckCircle2, Users
} from 'lucide-react';
import { api } from './api.js';
import { toIsbn13 } from '../shared/isbn.js';

const normalize = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');
// Main part of a title, so "Fall of Giants: Book One…" matches "Fall of Giants"
const mainTitle = (t) => normalize(String(t || '').split(/\s*[:([]\s*|\s+[-–—]\s+/)[0]);
const surname = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s.,]+/).filter(Boolean).pop() || '';

// Pick the right author from search results: the exact name with the most books.
function bestMatch(candidates, name) {
  const exact = candidates.filter(c => c.name.toLowerCase() === name.trim().toLowerCase());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1 && exact[0].workCount >= 5 * (exact[1].workCount || 1)) return exact[0];
  if (exact.length === 0 && candidates.length === 1) return candidates[0];
  return null;
}

function Cover({ url, title, author, muted }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <div className={`relative aspect-[2/3] rounded-xl overflow-hidden border border-black/10 shadow-sm bg-slate-800 transition-all ${muted ? 'grayscale opacity-45 group-hover:opacity-80' : 'group-hover:shadow-lg'}`}>
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
          onLoad={(e) => { if (e.currentTarget.naturalWidth < 10) setFailed(true); }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900 p-2 flex flex-col justify-end">
          <p className="text-[9px] uppercase tracking-wider text-white/60 line-clamp-1">{author}</p>
          <p className="text-[11px] font-bold text-white leading-tight line-clamp-3">{title}</p>
        </div>
      )}
    </div>
  );
}

// "Authors" section: search any author and see everything they wrote — books you own in colour first,
// the rest greyed out — plus the authors already on your shelves.
export default function AuthorPage({ books, libraryAuthors, request, onOpenBook, onAddOwned, onAddWishlist }) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null); // { author, books }
  const [isLoadingWorks, setIsLoadingWorks] = useState(false);
  const [filter, setFilter] = useState('all');
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState(null);

  const openAuthor = async (candidate) => {
    setCandidates(null);
    setError('');
    setSelected(null);
    setFilter('all');
    setShowHidden(false);
    setIsLoadingWorks(true);
    setCurrent({ author: { key: candidate.key, name: candidate.name }, books: [] });
    try {
      setCurrent(await api.authorWorks(candidate.key));
    } catch (err) {
      setCurrent(null);
      setError(err.message);
    } finally {
      setIsLoadingWorks(false);
    }
  };

  const search = async (name, { autoOpen = false } = {}) => {
    if (!name.trim()) return;
    setIsSearching(true);
    setError('');
    setCandidates(null);
    try {
      const found = await api.searchAuthors(name.trim());
      if (found.length === 0) {
        setError(`No author found called "${name.trim()}". Check the spelling, or try just the last name.`);
        return;
      }
      const best = bestMatch(found, name) || (autoOpen ? found.find(c => c.name.toLowerCase() === name.trim().toLowerCase()) : null);
      if (best) openAuthor(best);
      else setCandidates(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  // Opened from an author's name elsewhere in the app
  useEffect(() => {
    if (!request?.name) return;
    // A book can list several authors ("A, B"); look up the first.
    const name = request.name.split(',')[0].trim();
    setQuery(name);
    setCurrent(null);
    search(name, { autoOpen: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Match the bibliography against the library: owned, on the wishlist, or missing.
  const view = useMemo(() => {
    if (!current) return null;
    const authorSurname = surname(current.author.name);
    const mine = books.filter(b => String(b.author || '').toLowerCase().split(/,\s*/).some(a => surname(a) === authorSurname));
    const used = new Set();
    const findMine = (w) => mine.find(b =>
      (w.workKey && b.workKey === w.workKey) ||
      (w.isbn13 && (b.editions || []).some(e => toIsbn13(e.isbn) === w.isbn13)) ||
      mainTitle(b.workTitle) === mainTitle(w.title)
    );
    const entries = current.books.map(w => {
      const lib = findMine(w);
      if (lib) used.add(lib.id);
      return {
        ...w,
        lib,
        status: lib ? (lib.owned === false ? 'wishlist' : 'owned') : 'missing',
        displayCover: lib?.customCoverUrl || w.cover
      };
    });
    // Books you own by this author that the catalogs don't list (e.g. a translation) still count.
    for (const lib of mine) {
      if (used.has(lib.id)) continue;
      entries.push({
        id: `lib-${lib.id}`,
        title: lib.workTitle,
        year: (String(lib.editions?.[0]?.published || '').match(/\d{4}/) || [null])[0],
        lib,
        status: lib.owned === false ? 'wishlist' : 'owned',
        displayCover: lib.customCoverUrl,
        hidden: false
      });
    }
    const byYear = (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0);
    const visible = entries.filter(e => showHidden || !e.hidden || e.status === 'owned');
    const owned = visible.filter(e => e.status === 'owned').sort(byYear);
    const wishlist = visible.filter(e => e.status === 'wishlist').sort(byYear);
    const missing = visible.filter(e => e.status === 'missing').sort(byYear);
    return {
      owned, wishlist, missing,
      total: entries.filter(e => !e.hidden || e.status === 'owned').length,
      hiddenCount: entries.filter(e => e.hidden && e.status !== 'owned').length
    };
  }, [current, books, showHidden]);

  const toggleHidden = async (entry) => {
    const hidden = !entry.hidden;
    setCurrent(prev => ({ ...prev, books: prev.books.map(b => (b.id === entry.id ? { ...b, hidden } : b)) }));
    setSelected(null);
    try {
      await api.setAuthorBookHidden(current.author.key, entry.id, hidden);
    } catch (err) {
      setError(err.message);
    }
  };

  const shown = view && (
    filter === 'owned' ? view.owned
      : filter === 'missing' ? view.missing
        : filter === 'wishlist' ? view.wishlist
          : [...view.owned, ...view.wishlist, ...view.missing]
  );

  const years = (a) => [a.birthDate, a.deathDate].filter(Boolean).map(d => (String(d).match(/\d{4}/) || [d])[0]).join('–');

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent border border-orange-200/80 p-4 sm:p-6 rounded-3xl space-y-3">
        <div className="flex items-center gap-2 text-slate-900">
          <Compass className="w-5 h-5 text-orange-600" />
          <h2 className="text-base font-bold">Author Search</h2>
        </div>
        <p className="text-xs text-slate-600">See everything an author has written — books you own in colour, the rest greyed out.</p>
        <form onSubmit={(e) => { e.preventDefault(); search(query); }} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Author's name, e.g. Ken Follett"
            className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-500"
          />
          <button type="submit" disabled={isSearching || !query.trim()} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5">
            {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Search
          </button>
        </form>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}
        {candidates && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Which author did you mean?</p>
            {candidates.map(c => (
              <button
                key={c.key}
                onClick={() => openAuthor(c)}
                className="w-full text-left p-3 bg-white border border-slate-200 hover:border-orange-400 rounded-xl text-xs flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="font-bold text-slate-900">{c.name}</span>
                  {years(c) && <span className="text-slate-400"> ({years(c)})</span>}
                  {c.topWork && <span className="block text-slate-500 truncate">Best known for: {c.topWork}</span>}
                </span>
                <span className="text-[11px] text-slate-400 flex-shrink-0">{c.workCount} books</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* An author's bibliography */}
      {current && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button onClick={() => setCurrent(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-1">
                <ArrowLeft className="w-3.5 h-3.5" /> All authors
              </button>
              <h3 className="text-xl font-bold text-slate-900">{current.author.name}</h3>
              {years(current.author) && <p className="text-xs text-slate-400">{years(current.author)}</p>}
            </div>
          </div>

          {isLoadingWorks && (
            <div className="py-12 flex flex-col items-center gap-2 text-xs text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin" /> Gathering every book by {current.author.name}…
            </div>
          )}

          {!isLoadingWorks && view && (
            <>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700">You own {view.owned.length} of {view.total}</span>
                  {view.wishlist.length > 0 && <span className="text-rose-600">{view.wishlist.length} on your wishlist</span>}
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${view.total ? (100 * view.owned.length) / view.total : 0}%` }} />
                </div>
              </div>

              <div className="flex gap-1.5 flex-wrap items-center">
                {[
                  ['all', `All (${view.owned.length + view.wishlist.length + view.missing.length})`],
                  ['owned', `I own (${view.owned.length})`],
                  ['missing', `Missing (${view.missing.length})`],
                  ['wishlist', `Wishlist (${view.wishlist.length})`]
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setFilter(id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${filter === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
                {view.hiddenCount > 0 && (
                  <button onClick={() => setShowHidden(v => !v)} className="ml-auto text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                    {showHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showHidden ? 'Hide' : 'Show'} {view.hiddenCount} hidden
                  </button>
                )}
              </div>

              {shown.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Nothing here.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3 sm:gap-4">
                  {shown.map(entry => (
                    <button
                      key={entry.id}
                      onClick={() => (entry.status === 'owned' ? onOpenBook(entry.lib) : setSelected(entry))}
                      className={`group text-left ${entry.hidden ? 'opacity-50' : ''}`}
                    >
                      <div className="relative">
                        <Cover url={entry.displayCover} title={entry.title} author={current.author.name} muted={entry.status !== 'owned'} />
                        {entry.status === 'owned' && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow" title="You own this">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {entry.status === 'wishlist' && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center shadow" title="On your wishlist">
                            <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                          </span>
                        )}
                      </div>
                      <p className={`mt-1.5 text-[11px] font-bold leading-tight line-clamp-2 ${entry.status === 'owned' ? 'text-slate-900' : 'text-slate-400'}`}>{entry.title}</p>
                      <p className="text-[10px] text-slate-400">{entry.year || ''}</p>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-400 text-center">
                From Open Library and Google Books. Spot something that isn't really a book by {current.author.name}? Tap it and choose "Hide from this list".
              </p>
            </>
          )}
        </div>
      )}

      {/* Authors already on your shelves */}
      {!current && !candidates && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4" /> Authors on your shelves ({libraryAuthors.length})
          </h3>
          {libraryAuthors.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
              No authors yet. Add a book, or search for an author above.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {libraryAuthors.map(a => (
                <button
                  key={a.name}
                  onClick={() => { setQuery(a.name.split(',')[0]); search(a.name.split(',')[0], { autoOpen: true }); }}
                  className="p-3 rounded-2xl border bg-white border-slate-200/80 hover:border-orange-300 text-left flex flex-col justify-between h-20"
                >
                  <span className="text-[10px] font-bold text-slate-500">{a.count} {a.count === 1 ? 'book' : 'books'}</span>
                  <span className="text-xs font-bold text-slate-900 line-clamp-2">{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Details of a book you don't own yet */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-3">
              <div className="w-24 flex-shrink-0">
                <Cover url={selected.displayCover} title={selected.title} author={current?.author.name} />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <h4 className="text-base font-bold text-slate-900 leading-tight">{selected.title}</h4>
                {selected.subtitle && <p className="text-xs text-slate-600">{selected.subtitle}</p>}
                <p className="text-xs text-slate-600">
                  {current?.author.name}{selected.coAuthors?.length ? ` with ${selected.coAuthors.join(', ')}` : ''}
                </p>
                <p className="text-[11px] text-slate-400">
                  {[selected.year && `First published ${selected.year}`, selected.editionCount > 1 && `${selected.editionCount} editions`].filter(Boolean).join(' · ')}
                </p>
                {selected.status === 'wishlist' && (
                  <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1"><Heart className="w-3 h-3 fill-rose-500" /> On your wishlist</p>
                )}
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { const e = selected; setSelected(null); e.lib ? onOpenBook(e.lib) : onAddOwned(e, current.author); }}
                className="py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5"
              >
                <Library className="w-3.5 h-3.5" /> {selected.lib ? 'Open in my library' : 'I own this'}
              </button>
              {selected.status === 'missing' ? (
                <button
                  onClick={() => { onAddWishlist(selected, current.author); setSelected(null); }}
                  className="py-2.5 rounded-xl text-xs font-semibold bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center gap-1.5"
                >
                  <Heart className="w-3.5 h-3.5" /> Add to Wishlist
                </button>
              ) : (
                <div />
              )}
            </div>
            {!selected.id.startsWith('lib-') && (
              <button onClick={() => toggleHidden(selected)} className="w-full text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1.5">
                {selected.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {selected.hidden ? 'Show in this list again' : "Hide from this list (not a real book, duplicate…)"}
              </button>
            )}
            {selected.status === 'wishlist' && selected.lib && (
              <p className="text-[10px] text-slate-400 text-center">"Open in my library" lets you move it to your shelf when you get it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
