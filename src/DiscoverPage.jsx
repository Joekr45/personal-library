import React, { useEffect, useState } from 'react';
import { Compass, Heart, X, RefreshCw } from 'lucide-react';
import { api } from './api.js';
import { Cover } from './AuthorPage.jsx';

// "Discover": books people you know loved, and more in the genres you love.
export default function DiscoverPage({ onAddToWishlist }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [gone, setGone] = useState(new Set());
  const load = () => { setError(''); setData(null); api.discover().then(setData).catch(err => setError(err.message)); };
  useEffect(load, []);

  const hide = (id) => setGone(prev => new Set(prev).add(id));
  const want = async (b) => { if (await onAddToWishlist({ title: b.title, author: b.author, isbn: b.isbn13 || b.isbn, cover: b.cover })) hide(b.id); };
  const dismiss = async (b) => { hide(b.id); api.dismissRelease(b.id).catch(() => {}); };

  const card = (b, extra) => (
    <div key={b.id} className="w-28 flex-shrink-0">
      <Cover url={b.cover} title={b.title} author={b.author} />
      <p className="mt-1 text-[11px] font-bold text-slate-900 leading-tight line-clamp-2">{b.title}</p>
      <p className="text-[10px] text-slate-500 truncate">{b.author}</p>
      {extra}
      <div className="mt-1 flex gap-1">
        <button onClick={() => want(b)} aria-label={`Add ${b.title} to wishlist`} className="flex-1 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center gap-0.5"><Heart className="w-3 h-3" /> Want</button>
        <button onClick={() => dismiss(b)} aria-label={`Not interested in ${b.title}`} className="px-1.5 py-1 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700"><X className="w-3 h-3" /></button>
      </div>
    </div>
  );

  const loved = (data?.loved || []).filter(b => !gone.has(b.id));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Compass className="w-5 h-5 text-orange-500" /> Discover</h2>
        <button onClick={load} aria-label="Refresh" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
      {!data && !error && <p className="text-xs text-slate-400">Finding books for you…</p>}
      {data && (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Loved by people you know</h3>
            {loved.length === 0 ? (
              <p className="text-xs text-slate-500">Nothing yet. When family and friends rate books 4★ or more, they show up here.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {loved.map(b => card(b, <p className="text-[10px] text-orange-600 font-semibold truncate">{b.by.map(x => `${x.name} ${'★'.repeat(Math.floor(x.rating))}`).join(', ')}</p>))}
              </div>
            )}
          </section>
          {data.byGenre.map(g => (
            <section key={g.genre} className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">Because you like <span className="text-orange-600">{g.genre}</span></h3>
              <div className="flex gap-3 overflow-x-auto pb-2">{g.books.filter(b => !gone.has(b.id)).map(b => card(b))}</div>
            </section>
          ))}
          {!data.genresKnown && (
            <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl p-4">
              Genre picks appear once your favourite books have genres. Open a book you loved (genres are filled in automatically), or use
              <b> Settings → My books → Fill in book info</b> to do all of them at once.
            </p>
          )}
        </>
      )}
    </div>
  );
}
