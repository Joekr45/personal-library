import React, { useState } from 'react';
import { Sparkles, Heart, X, RefreshCw, CalendarClock } from 'lucide-react';
import { Cover } from './AuthorPage.jsx';
import { api } from './api.js';
import { formatDate, today } from './reading.js';

const when = (date) => {
  if (!date) return '';
  if (/^\d{4}$/.test(date)) return date;
  const full = date.length === 7 ? `${date}-01` : date;
  return full > today() ? `Coming ${formatDate(full)}` : `Out ${formatDate(full)}`;
};

// "New for you": recent and upcoming books by your authors and in your series.
export default function NewForYouPage({ data, onRefresh, onAddWishlist, onDismissed }) {
  const [busy, setBusy] = useState(null);

  const dismiss = async (r) => {
    setBusy(r.id);
    try {
      await api.dismissRelease(r.id);
      onDismissed(r.id);
    } finally {
      setBusy(null);
    }
  };
  const wish = async (r) => {
    setBusy(r.id);
    try {
      await onAddWishlist(r);
      onDismissed(r.id, { keepDismissal: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-orange-500" /> New for You</h2>
          <p className="text-xs text-slate-500">New and upcoming books from the authors on your shelves{data?.authorsChecked ? ` (your top ${data.authorsChecked})` : ''} and the series you collect.</p>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-xl bg-white border border-slate-200" aria-label="Check again"><RefreshCw className={`w-4 h-4 ${!data ? 'animate-spin' : ''}`} /></button>
      </div>

      {!data ? (
        <p className="py-12 text-center text-xs text-slate-500">Checking for new books…</p>
      ) : data.error ? (
        <p className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs">{data.error}</p>
      ) : data.releases.length === 0 ? (
        <p className="p-8 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">Nothing new right now. Check back later — new books show up here automatically.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.releases.map(r => (
            <li key={r.id} className="p-3 bg-white border border-slate-200 rounded-2xl flex gap-3">
              <div className="w-16 flex-shrink-0"><Cover url={r.cover} title={r.title} author={r.author} /></div>
              <div className="flex-1 min-w-0 space-y-1">
                <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">{r.reason}</span>
                <p className="text-sm font-bold text-slate-900 leading-tight">{r.title}</p>
                <p className="text-[11px] text-slate-500">{r.author}</p>
                <p className="text-[11px] text-slate-400 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> {when(r.date)}</p>
                <div className="flex gap-1.5 pt-1">
                  <button onClick={() => wish(r)} disabled={busy === r.id} className="px-2.5 py-1.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> Wishlist</button>
                  <button onClick={() => dismiss(r)} disabled={busy === r.id} className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold flex items-center gap-1"><X className="w-3.5 h-3.5" /> Not interested</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
