import React, { useState, useEffect } from 'react';
import { BookOpen, Heart } from 'lucide-react';
import StarRating from './StarRating.jsx';
import { currentLoan } from './matching.js';
import { progressOf, progressLabel } from './shelves.js';

// Shared bits of the main screen: sorting, page names, cover colours and the book cover/card.
export const sortKey = (title) => String(title || '').trim().replace(/^(the|a|an)\s+/i, '');
export const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
export const byTitle = (a, b) => titleCollator.compare(sortKey(a.workTitle), sortKey(b.workTitle)) || titleCollator.compare(a.author || '', b.author || '');

// Menu pages that aren't a list of books (no sorting, filters or selecting there).
export const PAGE_SECTIONS = ['home', 'authors', 'series', 'year', 'family', 'new', 'challenges', 'quotes', 'activity', 'discover', 'clubs', 'lists', 'readinglog', 'gifts', 'places'];

export const COVER_THEMES = [
  { bg: 'from-amber-900 via-stone-900 to-black', accent: 'border-amber-400/40 text-amber-200', tag: 'bg-amber-500/20 text-amber-300' },
  { bg: 'from-slate-900 via-blue-950 to-black', accent: 'border-blue-400/40 text-blue-200', tag: 'bg-blue-500/20 text-blue-300' },
  { bg: 'from-emerald-950 via-teal-950 to-black', accent: 'border-emerald-400/40 text-emerald-200', tag: 'bg-emerald-500/20 text-emerald-300' },
  { bg: 'from-rose-950 via-red-950 to-stone-950', accent: 'border-rose-400/40 text-rose-200', tag: 'bg-rose-500/20 text-rose-300' },
  { bg: 'from-indigo-950 via-purple-950 to-neutral-950', accent: 'border-purple-400/40 text-purple-200', tag: 'bg-purple-500/20 text-purple-300' },
  { bg: 'from-cyan-950 via-sky-950 to-black', accent: 'border-cyan-400/40 text-cyan-200', tag: 'bg-cyan-500/20 text-cyan-300' }
];

export function AppleBookCover({ book, height = 'aspect-[2/3]' }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const coverUrl = book.customCoverUrl || (book.editions?.[0]?.isbn && book.editions[0].isbn !== 'Pending Scan' ? `https://covers.openlibrary.org/b/isbn/${book.editions[0].isbn}-M.jpg` : null);
  const theme = book.theme || COVER_THEMES[0];

  // Start fresh when the cover changes (e.g. after choosing a new one)
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [coverUrl]);

  return (
    <div className={`relative w-full ${height} rounded-2xl overflow-hidden shadow-md group-hover:shadow-xl border border-black/10 bg-slate-900 transition-all duration-300 flex flex-col justify-between`}>
      {coverUrl && !imageError && (
        <img
          src={coverUrl}
          alt={book.workTitle}
          onLoad={(e) => (e.currentTarget.naturalWidth < 10 ? setImageError(true) : setImageLoaded(true))}
          onError={() => setImageError(true)}
          className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
        />
      )}

      {(!imageLoaded || imageError || !coverUrl) && (
        <>
          <div className={`absolute inset-0 bg-gradient-to-br ${theme.bg} z-0`} />
          <div className="absolute inset-0 bg-radial-at-t from-white/20 via-transparent to-black/50 pointer-events-none" />

          <div className="relative z-10 my-auto text-center px-2">
            <div className="w-8 h-8 mx-auto rounded-full border border-white/20 flex items-center justify-center text-white/50 mb-1">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <div className="text-[9px] tracking-widest uppercase font-serif text-white/60">
              {book.series || 'Physical Copy'}
            </div>
          </div>

          <div className="relative z-10 p-3 space-y-1">
            <p className="text-[10px] font-semibold tracking-wider uppercase text-white/80 line-clamp-1">
              {book.author}
            </p>
            <h4 className="text-xs font-black tracking-tight leading-snug line-clamp-2 text-white">
              {book.workTitle}
            </h4>
          </div>
        </>
      )}

      <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/50 via-white/10 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 left-3 w-px bg-white/20 pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-1 bg-black/20 pointer-events-none z-10" />

      <div className="relative z-10 p-2.5 flex items-start justify-between pointer-events-none">
        {book.series ? (
          <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-amber-300 border border-amber-300/30 shadow-xs">
            #{book.seriesNumber}
          </span>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

// Card Wrapper for Grid Views
export function AppleBookCard({ book, onClick, onAuthorClick, selecting = false, selected = false }) {
  return (
    <div
      onClick={onClick}
      role={selecting ? 'checkbox' : undefined}
      aria-checked={selecting ? selected : undefined}
      aria-label={selecting ? `Select ${book.workTitle}` : undefined}
      className={`group cursor-pointer flex flex-col transition-all duration-200 transform hover:-translate-y-1.5 ${selecting && !selected ? 'opacity-70' : ''}`}
    >
      <div className={`relative rounded-xl ${selected ? 'ring-4 ring-orange-500 ring-offset-2' : ''}`}>
        {selecting && (
          <span className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold ${selected ? 'bg-orange-500 border-orange-500' : 'bg-black/30 border-white'}`}>{selected ? '✓' : ''}</span>
        )}
        <AppleBookCover book={book} />
        {book.owned === false && (
          <span
            className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center shadow-xs"
            title="On your wishlist"
          >
            <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
          </span>
        )}
      </div>

      <div className="mt-2 space-y-0.5">
        <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-orange-600 transition-colors">
          {book.workTitle}
        </h4>
        <button
          onClick={(e) => { e.stopPropagation(); onAuthorClick?.(e); }}
          className="text-[11px] text-slate-500 hover:text-orange-600 hover:underline transition-colors truncate block text-left"
        >
          {book.author}
        </button>
        {book.rating ? <StarRating value={book.rating} size="sm" /> : null}
        {currentLoan(book) && <p className="text-[10px] font-semibold text-sky-700 truncate">Lent to {currentLoan(book).to}</p>}
        {(book.collector?.signed || book.collector?.firstEdition) && (
          <p className="text-[10px] font-semibold text-amber-700 truncate">{[book.collector.signed && 'Signed', book.collector.firstEdition && '1st edition'].filter(Boolean).join(' · ')}</p>
        )}
        {book.readingStatus === 'Reading' && progressOf(book) && (
          <div className="pt-1" title={progressLabel(progressOf(book))}>
            {progressOf(book).pct !== null ? (
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1.5 rounded-full bg-orange-100 overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${progressOf(book).pct}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-orange-600">{progressOf(book).pct}%</span>
              </div>
            ) : (
              <span className="text-[10px] font-semibold text-orange-600">{progressLabel(progressOf(book))}</span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between pt-1 text-[10px]">
          <span className="text-slate-400 flex items-center gap-1 font-medium">
            <span className={`w-1.5 h-1.5 rounded-full ${book.readingStatus === 'Reading' ? 'bg-orange-500' : book.readingStatus === 'Completed' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {book.readingStatus === 'DNF' ? 'Did not finish' : book.readingStatus}
          </span>
          {book.series && (
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
              #{book.seriesNumber}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
