import React, { useEffect, useState } from 'react';
import { BellRing, RefreshCw, Library, Tag } from 'lucide-react';
import { api } from './api.js';

// What the daily wishlist check found for one book: { available, waitText, priceText, alert }.
export function wishlistNews(book, result) {
  if (!result) return null;
  const lib = result.library;
  const price = result.price;
  const availableFormats = lib?.found ? lib.formats.filter(f => f.available).map(f => f.type) : [];
  const waits = lib?.found ? lib.formats.filter(f => !f.available && f.waitDays).map(f => `${f.type}: ~${f.waitDays} days wait`) : [];
  const underTarget = price && book.targetPrice && price.amount <= book.targetPrice;
  return {
    available: availableFormats.length ? `Available now at your library (${[...new Set(availableFormats)].join(', ')})` : null,
    wait: !availableFormats.length && waits.length ? waits[0] : null,
    price: price ? `eBook ${price.currency === 'USD' ? '$' : `${price.currency} `}${price.amount.toFixed(2)}${price.source ? ` on ${price.source}` : ''}` : null,
    priceUrl: price?.url || null,
    alert: Boolean(availableFormats.length || underTarget),
    underTarget
  };
}

// Top of the Wishlist page: books available at your library right now, or under your price alert.
export default function WishlistAlerts({ books, hasLibrary, onOpenSettings, onResults }) {
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.wishlistCheck().then(c => { setCheck(c); onResults?.(c); }).catch(() => {}); }, []);
  const run = async () => {
    setBusy(true);
    try { const c = await api.runWishlistCheck(); setCheck(c); onResults?.(c); } catch { /* shown as unchanged */ } finally { setBusy(false); }
  };
  const wish = books.filter(b => b.owned === false);
  const news = wish.map(b => ({ book: b, n: wishlistNews(b, check?.results?.[b.id]) })).filter(x => x.n?.alert);

  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><BellRing className="w-4 h-4 text-orange-500" /> Wishlist alerts</p>
        <button onClick={run} disabled={busy} className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center gap-1">
          <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} /> {busy ? 'Checking…' : 'Check now'}
        </button>
      </div>
      {news.length > 0 ? (
        <ul className="space-y-1">
          {news.map(({ book, n }) => (
            <li key={book.id} className="text-xs text-slate-700">
              <b>{book.workTitle}</b>: {n.available && <span className="text-emerald-700 font-semibold"><Library className="inline w-3.5 h-3.5" /> {n.available}</span>}
              {n.underTarget && <span className="text-rose-700 font-semibold"> <Tag className="inline w-3.5 h-3.5" /> {n.price} (your alert: ${book.targetPrice})</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">
          {check?.checkedAt ? 'Nothing new right now.' : 'Not checked yet.'} Every day the app checks whether your wishlist books are
          {hasLibrary ? ' available at your library' : <> available at your library (<button onClick={onOpenSettings} className="font-semibold text-orange-600">add your library</button>)</>} and what the ebook costs.
          Set a price alert on any wishlist book's page.
        </p>
      )}
      {check?.checkedAt && <p className="text-[10px] text-slate-400">Last checked {new Date(check.checkedAt).toLocaleString()}</p>}
    </div>
  );
}
