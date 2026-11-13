import React, { useMemo, useState } from 'react';
import { Quote, Search, Copy, Upload } from 'lucide-react';
import KindleImport from './KindleImport.jsx';
import { formatDate } from './reading.js';
import { shareOrCopy } from './lending.js';

// "My Quotes": every quote saved on any book, newest first, with a search box.
export default function QuotesPage({ books, onOpenBook, onUpdateBook }) {
  const [q, setQ] = useState('');
  const [kindle, setKindle] = useState(false);
  const [note, setNote] = useState('');
  const all = useMemo(() => books
    .flatMap(book => (book.quotes || []).map((quote, i) => ({ book, quote, key: `${book.id}-${i}` })))
    .sort((a, b) => String(b.quote.addedOn || '').localeCompare(String(a.quote.addedOn || ''))), [books]);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? all.filter(({ book, quote }) => `${quote.text} ${book.workTitle} ${book.author}`.toLowerCase().includes(needle))
    : all;
  const copy = async ({ book, quote }) => {
    const result = await shareOrCopy(`“${quote.text}”\n— ${book.author}, ${book.workTitle}${quote.page ? ` (p. ${quote.page})` : ''}`, book.workTitle);
    setNote(result === 'copied' ? 'Copied!' : '');
    setTimeout(() => setNote(''), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Quote className="w-5 h-5 text-emerald-600" /> My Quotes ({all.length})</h2>
        <div className="flex items-center gap-3">
          {note && <span className="text-xs text-emerald-700 font-semibold">{note}</span>}
          <button onClick={() => setKindle(true)} className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-emerald-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5"><Upload className="w-3.5 h-3.5 text-emerald-600" /> Import Kindle highlights</button>
        </div>
      </div>
      {kindle && <KindleImport books={books} onUpdateBook={onUpdateBook} onClose={() => setKindle(false)} />}
      {all.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
          No quotes yet. Open any book and use <b>My quotes → Add a quote</b> to save lines you love.
        </p>
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quotes, titles or authors…" aria-label="Search quotes"
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {shown.map(item => (
              <figure key={item.key} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
                <blockquote className="text-sm text-slate-800 italic whitespace-pre-wrap">“{item.quote.text}”</blockquote>
                {item.quote.note && <p className="text-xs text-slate-600 whitespace-pre-wrap">✎ {item.quote.note}</p>}
                <figcaption className="flex items-center gap-2 text-[11px] text-slate-500">
                  <button onClick={() => onOpenBook(item.book)} className="text-left hover:text-orange-600 min-w-0 truncate">
                    — <b className="text-slate-700">{item.book.workTitle}</b>, {item.book.author}{item.quote.page ? ` · p. ${item.quote.page}` : ''}
                  </button>
                  <span className="ml-auto flex-shrink-0 text-slate-400">{formatDate(item.quote.addedOn)}</span>
                  <button onClick={() => copy(item)} aria-label="Copy quote" className="tap flex-shrink-0 hover:text-emerald-700"><Copy className="w-4 h-4" /></button>
                </figcaption>
              </figure>
            ))}
          </div>
          {shown.length === 0 && <p className="text-xs text-slate-500">No quotes match “{q}”.</p>}
        </>
      )}
    </div>
  );
}
