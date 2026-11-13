import React, { useEffect, useState } from 'react';
import { BookOpenCheck, PartyPopper } from 'lucide-react';
import { totalPagesOf, progressOf } from './shelves.js';
import { statusChanges } from './reading.js';

// For a book you're reading: which page you're on, with a progress bar.
export default function ProgressPanel({ book, onUpdate }) {
  const [page, setPage] = useState(book.currentPage ?? '');
  const [total, setTotal] = useState(totalPagesOf(book) || '');
  useEffect(() => { setPage(book.currentPage ?? ''); }, [book.id, book.currentPage]);
  useEffect(() => { setTotal(totalPagesOf(book) || ''); }, [book.id, totalPagesOf(book)]);

  const progress = progressOf(book);
  const savePage = (value) => {
    const n = value === '' ? null : Math.max(0, Math.round(Number(value)));
    if (n !== null && Number.isNaN(n)) return;
    if ((book.currentPage ?? null) !== n) onUpdate({ currentPage: n });
  };
  const saveTotal = () => {
    const n = total === '' ? null : Math.max(0, Math.round(Number(total))) || null;
    if (n === (totalPagesOf(book) || null)) return;
    const [first = {}, ...rest] = book.editions || [];
    onUpdate({ editions: [{ ...first, pageCount: n }, ...rest] });
  };
  const bump = (by) => {
    const next = Math.max(0, (Number(book.currentPage) || 0) + by);
    setPage(next);
    onUpdate({ currentPage: next });
  };
  const atEnd = progress?.total && progress.page >= progress.total;
  const input = 'w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-center focus:outline-none focus:border-orange-400';
  const enterSaves = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };

  return (
    <div className="bg-orange-50/60 rounded-2xl p-4 border border-orange-200/70 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><BookOpenCheck className="w-4 h-4 text-orange-500" /> My progress</span>
        {progress?.pct !== null && progress?.pct !== undefined && <span className="text-xs font-bold text-orange-600">{progress.pct}%</span>}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
        <span>Page</span>
        <input type="number" inputMode="numeric" min="0" aria-label="Page I'm on" value={page}
          onChange={(e) => setPage(e.target.value)} onBlur={() => savePage(page)} onKeyDown={enterSaves} className={input} />
        <span>of</span>
        <input type="number" inputMode="numeric" min="0" aria-label="Number of pages" value={total} placeholder="?"
          onChange={(e) => setTotal(e.target.value)} onBlur={saveTotal} onKeyDown={enterSaves} className={input} />
        <div className="flex gap-1 ml-auto">
          {[10, 25].map(n => (
            <button key={n} onClick={() => bump(n)} className="px-2 py-1 rounded-lg border border-orange-200 bg-white text-orange-700 text-[11px] font-semibold hover:bg-orange-100">+{n}</button>
          ))}
        </div>
      </div>
      <div className="h-2 rounded-full bg-orange-100 overflow-hidden" role="progressbar" aria-valuenow={progress?.pct || 0} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${progress?.pct || 0}%` }} />
      </div>
      {!totalPagesOf(book) && <p className="text-[11px] text-slate-500">Type the number of pages to see how far along you are.</p>}
      {atEnd && (
        <button onClick={() => onUpdate(statusChanges(book, 'Completed'))} className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5">
          <PartyPopper className="w-4 h-4" /> I finished it!
        </button>
      )}
    </div>
  );
}
