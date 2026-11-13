import React, { useMemo, useRef, useState } from 'react';
import { X, Upload, CheckCircle2, BookX } from 'lucide-react';
import { parseClippings, groupClippings, matchBook, newQuotes } from './kindle.js';
import { today } from './reading.js';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

// "Import Kindle highlights": read My Clippings.txt and add the highlights to "My quotes".
export default function KindleImport({ books, onUpdateBook, onClose }) {
  const [groups, setGroups] = useState(null);
  const [chosen, setChosen] = useState({}); // group index → book id ('' = skip)
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const sorted = useMemo(() => [...books].sort((a, b) => collator.compare(a.workTitle, b.workTitle)), [books]);

  const read = async (file) => {
    setError('');
    if (!file) return;
    const text = await file.text();
    const found = groupClippings(parseClippings(text));
    if (!found.length) { setError("That file has no Kindle highlights in it. Look for \"My Clippings.txt\" in the Kindle's documents folder."); return; }
    setGroups(found);
    const pre = {};
    found.forEach((g, i) => { pre[i] = matchBook(g, books)?.id || ''; });
    setChosen(pre);
  };

  const plan = (groups || []).map((g, i) => {
    const book = books.find(b => b.id === chosen[i]);
    return { g, i, book, fresh: book ? newQuotes(g, book) : [] };
  });
  const total = plan.reduce((n, p) => n + p.fresh.length, 0);

  const save = async () => {
    setBusy(true);
    let added = 0;
    // Several Kindle titles may point at the same book: add them together.
    const byBook = new Map();
    for (const p of plan) if (p.book && p.fresh.length) byBook.set(p.book.id, [...(byBook.get(p.book.id) || []), ...p.fresh]);
    for (const [id, fresh] of byBook) {
      const book = books.find(b => b.id === id);
      const quotes = [...(book.quotes || []), ...fresh.map(q => ({ text: q.text, page: q.page, addedOn: q.addedOn || today(), ...(q.note ? { note: q.note } : {}) }))];
      const saved = await onUpdateBook(id, { quotes });
      if (saved) added += fresh.length;
    }
    setBusy(false);
    setDone(added);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white sm:rounded-3xl shadow-2xl max-w-lg w-full flex flex-col h-full sm:h-auto sm:max-h-[90vh]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import Kindle highlights">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Import Kindle highlights</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {done !== null ? (
            <p className="text-sm text-emerald-700 font-semibold flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Added {done} highlight{done === 1 ? '' : 's'} to My Quotes.</p>
          ) : !groups ? (
            <>
              <ol className="text-xs text-slate-600 space-y-1.5 list-decimal pl-4">
                <li>Plug your Kindle into the computer with its USB cable.</li>
                <li>Open the Kindle drive, then the <b>documents</b> folder.</li>
                <li>Choose the file called <b>My Clippings.txt</b> below.</li>
              </ol>
              <p className="text-[11px] text-slate-500">Highlights already in My Quotes are skipped, so you can import again any time.</p>
              <input ref={fileRef} type="file" accept=".txt,text/plain" onChange={(e) => read(e.target.files?.[0])} className="hidden" aria-label="My Clippings file" />
              <button onClick={() => fileRef.current?.click()} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> Choose My Clippings.txt</button>
              {error && <p className="text-xs text-rose-700">{error}</p>}
            </>
          ) : (
            <>
              <p className="text-xs text-slate-600">Found highlights from {groups.length} book{groups.length === 1 ? '' : 's'}. Check which book each belongs to:</p>
              <ul className="space-y-2">
                {plan.map(({ g, i, book, fresh }) => (
                  <li key={i} className="p-3 bg-slate-50 rounded-xl space-y-1.5" data-kindle-book={g.title}>
                    <p className="text-xs font-bold text-slate-900">{g.title}</p>
                    <p className="text-[11px] text-slate-500">{g.author} · {g.quotes.length} highlight{g.quotes.length === 1 ? '' : 's'}{book ? ` · ${fresh.length} new` : ''}</p>
                    <select value={chosen[i] || ''} onChange={(e) => setChosen(prev => ({ ...prev, [i]: e.target.value }))} aria-label={`Book for ${g.title}`} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white">
                      <option value="">Skip (not in my library)</option>
                      {sorted.map(b => <option key={b.id} value={b.id}>{b.workTitle} — {b.author}</option>)}
                    </select>
                    {!book && <p className="text-[11px] text-amber-700 flex items-center gap-1"><BookX className="w-3.5 h-3.5" /> Not matched. Pick the book above, or add it to your library first.</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {groups && done === null && (
          <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">Cancel</button>
            <button onClick={save} disabled={!total || busy} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold">
              {busy ? 'Adding…' : `Add ${total} highlight${total === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
