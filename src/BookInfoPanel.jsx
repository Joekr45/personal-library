import React, { useEffect, useState } from 'react';
import { Info, Users, RefreshCw, Star } from 'lucide-react';
import { api } from './api.js';
import StarRating from './StarRating.jsx';
import { toIsbn13 } from '../shared/isbn.js';

// "About this book": description, genres and the rating from other readers (filled in from the
// catalogs the first time you open the book), plus ratings and reviews from people you know.
export default function BookInfoPanel({ book, onBookSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState(null);
  const isbn = (book.editions || []).map(e => toIsbn13(e.isbn)).find(Boolean) || '';

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const res = await api.fillBookInfo(book.id);
      onBookSaved?.(res.book);
    } catch {
      // not important; try again next time
    } finally {
      setLoading(false);
    }
  };
  // Only once per book (the server notes the day it checked).
  useEffect(() => { setExpanded(false); if (!book.infoCheckedOn) fetchInfo(); }, [book.id]);
  useEffect(() => {
    setReviews(null);
    api.reviews({ title: book.workTitle, author: book.author, isbn }).then(setReviews).catch(() => setReviews([]));
  }, [book.id]);

  const description = book.description || '';
  const long = description.length > 320;
  const r = book.communityRating;

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Info className="w-4 h-4 text-orange-500" /> About this book</span>
        <button onClick={fetchInfo} disabled={loading} className="text-[11px] text-slate-400 hover:text-orange-600 flex items-center gap-1" aria-label="Look up book info again">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Looking up…' : 'Refresh'}
        </button>
      </div>
      {r && (
        <p className="text-xs text-slate-600 flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <b className="text-slate-800">{Number(r.average).toFixed(1)}</b> average from {r.count ? `${r.count.toLocaleString()} readers` : 'readers'} on {r.source}
        </p>
      )}
      {(book.genres || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {book.genres.map(g => <span key={g} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">{g}</span>)}
        </div>
      )}
      {description ? (
        <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
          {long && !expanded ? `${description.slice(0, 320).trim()}…` : description}
          {long && <button onClick={() => setExpanded(v => !v)} className="ml-1 font-semibold text-orange-600">{expanded ? 'Show less' : 'Read more'}</button>}
        </div>
      ) : (
        !loading && <p className="text-[11px] text-slate-400">{book.infoCheckedOn ? 'No description found in the catalogs. You can type one with Edit.' : ''}</p>
      )}

      {reviews && reviews.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Users className="w-4 h-4 text-orange-500" /> People you know</p>
          {reviews.map((rv, i) => (
            <div key={i} className="flex gap-2.5">
              <span className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white bg-gradient-to-br ${rv.user.color || 'from-orange-500 to-amber-500'}`}>{rv.user.displayName.charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-800">{rv.user.displayName}</span>
                  {rv.rating ? <StarRating value={rv.rating} size="sm" /> : rv.status && <span className="text-[10px] text-slate-400">{rv.status === 'Completed' ? 'Finished' : rv.status}</span>}
                </div>
                {rv.text && <p className="text-xs text-slate-600 whitespace-pre-line mt-0.5">{rv.text}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
