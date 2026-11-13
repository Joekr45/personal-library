import React, { useState } from 'react';
import { Quote, Trash2, Plus, Copy } from 'lucide-react';
import { today } from './reading.js';
import { shareOrCopy } from './lending.js';

// "My quotes" on a book's page: lines you want to keep, with the page number.
export default function QuotesPanel({ book, onUpdate }) {
  const quotes = book.quotes || [];
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const [note, setNote] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const saved = await onUpdate({ quotes: [...quotes, { text: text.trim(), page: page ? Number(page) : null, addedOn: today() }] });
    if (saved) { setText(''); setPage(''); setAdding(false); }
  };
  const remove = (q) => { if (confirm('Delete this quote?')) onUpdate({ quotes: quotes.filter(x => x !== q) }); };
  const copy = async (q) => {
    const result = await shareOrCopy(`“${q.text}”\n— ${book.author}, ${book.workTitle}${q.page ? ` (p. ${q.page})` : ''}`, book.workTitle);
    setNote(result === 'copied' ? 'Copied!' : '');
    setTimeout(() => setNote(''), 2000);
  };

  return (
    <div className="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-200/70 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Quote className="w-4 h-4 text-emerald-600" /> My quotes{quotes.length ? ` (${quotes.length})` : ''}</span>
        {note && <span className="text-[11px] text-emerald-700">{note}</span>}
        {!adding && (
          <button onClick={() => setAdding(true)} className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-700 text-[11px] font-semibold flex items-center gap-1 hover:bg-emerald-50">
            <Plus className="w-3.5 h-3.5" /> Add a quote
          </button>
        )}
      </div>
      {quotes.length === 0 && !adding && <p className="text-[11px] text-slate-500">Save lines you love, with the page they're on.</p>}
      {quotes.length > 0 && (
        <ul className="space-y-2">
          {quotes.map((q, i) => (
            <li key={i} className="bg-white rounded-xl p-3 border border-emerald-100">
              <p className="text-xs text-slate-800 italic whitespace-pre-wrap">“{q.text}”</p>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                {q.page && <span>Page {q.page}</span>}
                <button onClick={() => copy(q)} className="ml-auto flex items-center gap-1 hover:text-emerald-700" aria-label="Copy quote"><Copy className="w-3 h-3" /> Copy</button>
                <button onClick={() => remove(q)} className="flex items-center gap-1 hover:text-red-600" aria-label="Delete quote"><Trash2 className="w-3 h-3" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form onSubmit={add} className="space-y-2">
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Type or paste the quote…" aria-label="Quote"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-emerald-500" />
          <div className="flex items-center gap-2">
            <input type="number" min="1" inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} placeholder="Page" aria-label="Quote page"
              className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" />
            <button type="button" onClick={() => { setAdding(false); setText(''); setPage(''); }} className="ml-auto px-3 py-1.5 text-xs font-semibold text-slate-500">Cancel</button>
            <button type="submit" disabled={!text.trim()} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold">Save quote</button>
          </div>
        </form>
      )}
    </div>
  );
}
