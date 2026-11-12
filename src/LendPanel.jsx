import React, { useState } from 'react';
import { HandHelping, Undo2, History } from 'lucide-react';
import { today, formatDate } from './reading.js';
import { currentLoan } from './matching.js';

// "Lend this book" on a book's page, with the lending history.
export default function LendPanel({ book, onUpdate }) {
  const [to, setTo] = useState('');
  const [date, setDate] = useState(today());
  const [showHistory, setShowHistory] = useState(false);
  const loans = book.loans || [];
  const out = currentLoan(book);
  const past = loans.filter(l => l.returnedOn);

  const lend = async (e) => {
    e.preventDefault();
    if (!to.trim()) return;
    const saved = await onUpdate({ loans: [...loans, { to: to.trim(), lentOn: date || today(), returnedOn: null }] });
    if (saved) setTo('');
  };
  const returned = () => onUpdate({ loans: loans.map(l => (l === out ? { ...l, returnedOn: today() } : l)) });

  return (
    <div className="bg-sky-50/70 rounded-2xl p-4 border border-sky-200/70 space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><HandHelping className="w-4 h-4 text-sky-600" /> Lending</div>
      {out ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-700">Lent to <b>{out.to}</b>{out.lentOn ? ` on ${formatDate(out.lentOn)}` : ''}.</p>
          <button onClick={returned} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1">
            <Undo2 className="w-3.5 h-3.5" /> It's back
          </button>
        </div>
      ) : (
        <form onSubmit={lend} className="flex gap-2 flex-wrap">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Lend to… (name)" className="flex-1 min-w-[8rem] px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date lent" className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" />
          <button type="submit" disabled={!to.trim()} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold">Lend</button>
        </form>
      )}
      {past.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(v => !v)} className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
            <History className="w-3.5 h-3.5" /> {showHistory ? 'Hide' : 'Show'} lending history ({past.length})
          </button>
          {showHistory && (
            <ul className="mt-1 text-[11px] text-slate-600 space-y-0.5">
              {[...past].reverse().map((l, i) => (
                <li key={i}>• {l.to}: {formatDate(l.lentOn) || '?'} → {formatDate(l.returnedOn)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
