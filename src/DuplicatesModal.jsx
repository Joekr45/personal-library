import React, { useMemo, useState } from 'react';
import { X, Copy, Check, Merge } from 'lucide-react';
import { api } from './api.js';
import { findDuplicates, richness } from './duplicates.js';

const DISMISS_KEY = 'pl_not_duplicates';
const readDismissed = () => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch { return []; } };

// "Find duplicates": books in the library more than once. Merge keeps everything from every copy
// (editions, notes, dates, quotes, shelves…); the extra copies go to Recently deleted, so it can be undone.
export default function DuplicatesModal({ books, onClose, onMerged, renderCover }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const groups = useMemo(() => findDuplicates(books, dismissed), [books, dismissed]);
  const [keepChoice, setKeepChoice] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const dismiss = (key) => {
    const next = [...dismissed, key];
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-500))); } catch { /* not important */ }
  };
  const merge = async (group) => {
    const keepId = keepChoice[group.key] || [...group.books].sort((a, b) => richness(b) - richness(a))[0].id;
    setBusy(group.key); setError('');
    try {
      const res = await api.mergeBooks(keepId, group.books.filter(b => b.id !== keepId).map(b => b.id));
      onMerged(res.book, res.trashed);
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Copy className="w-4 h-4 text-orange-500" /> Possible duplicates ({groups.length})</h3>
          <button onClick={onClose} aria-label="Close duplicates" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <p className="text-xs text-slate-500">Choose which copy to keep, then <b>Merge</b>: everything from the other copies (editions, notes, dates, quotes, shelves) is added to it, and the extras go to <b>Recently deleted</b> in case you change your mind.</p>
          {error && <p className="text-xs text-red-700">{error}</p>}
          {groups.length === 0 && <p className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl">No duplicates found. 🎉</p>}
          {groups.map(g => {
            const suggested = [...g.books].sort((a, b) => richness(b) - richness(a))[0].id;
            const keepId = keepChoice[g.key] || suggested;
            return (
              <div key={g.key} className="p-3 border border-slate-200 rounded-2xl space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {g.books.map(b => (
                    <button key={b.id} onClick={() => setKeepChoice(prev => ({ ...prev, [g.key]: b.id }))} aria-pressed={keepId === b.id}
                      className={`p-2 rounded-xl border text-left flex gap-2 ${keepId === b.id ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <div className="w-10 flex-shrink-0">{renderCover(b)}</div>
                      <div className="min-w-0 text-[11px]">
                        <p className="font-bold text-slate-900 line-clamp-2">{b.workTitle}</p>
                        <p className="text-slate-500 truncate">{b.author}</p>
                        <p className="text-slate-400">{b.owned === false ? 'Wishlist' : (b.readingStatus === 'DNF' ? 'Did not finish' : b.readingStatus || 'Unread')}{b.rating ? ` · ${b.rating}★` : ''}</p>
                        <p className="text-slate-400 truncate">{(b.editions || []).map(e => e.isbn).filter(i => i && i !== 'Pending Scan').join(', ') || 'no ISBN'}</p>
                        {keepId === b.id && <p className="text-orange-600 font-semibold flex items-center gap-0.5"><Check className="w-3 h-3" /> Keep this one</p>}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => dismiss(g.key)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Not duplicates</button>
                  <button onClick={() => merge(g)} disabled={busy === g.key} className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1">
                    <Merge className="w-3.5 h-3.5" /> {busy === g.key ? 'Merging…' : `Merge ${g.books.length} copies`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
