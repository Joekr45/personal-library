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
export const PAGE_SECTIONS = ['home', 'authors', 'series', 'year', 'family', 'new', 'challenges', 'quotes', 'activity', 'discover', 'clubs', 'lists', 'readinglog', 'gifts', 'places', 'borrow', 'shelves'];

export const COVER_THEMES = [
  { bg: 'from-amber-900 via-stone-900 to-black', accent: 'border-amber-400/40 text-amber-200', tag: 'bg-amber-500/20 text-amber-300' },
  { bg: 'from-slate-900 via-blue-950 to-black', accent: 'border-blue-400/40 text-blue-200', tag: 'bg-blue-500/20 text-blue-300' },
  { bg: 'from-emerald-950 via-teal-950 to-black', accent: 'border-emerald-400/40 text-emerald-200', tag: 'bg-emerald-500/20 text-emerald-300' },
  { bg: 'from-rose-950 via-red-950 to-stone-950', accent: 'border-rose-400/40 text-rose-200', tag: 'bg-rose-500/20 text-rose-300' },
  { bg: 'from-indigo-950 via-purple-950 to-neutral-950', accent: 'border-purple-400/40 text-purple-200', tag: 'bg-purple-500/20 text-purple-300' },
  { bg: 'from-cyan-950 via-sky-950 to-black', accent: 'border-cyan-400/40 text-cyan-200', tag: 'bg-cyan-500/20 text-cyan-300' }
];

// Cloth and leather colours for books without a cover picture (picked from the title, so a book keeps its colour).
const BINDINGS = [
  { bg: '#6b2e2a', ink: '#f3e3c8' }, // oxblood
  { bg: '#2f4a6b', ink: '#eadfc6' }, // navy
  { bg: '#24392f', ink: '#d9b26a' }, // forest and gold
  { bg: '#9a6a3a', ink: '#fbf3e0' }, // tan
  { bg: '#5c3a21', ink: '#ecd7a3' }, // walnut
  { bg: '#e8dcc2', ink: '#5c3a21' }, // cream cloth
  { bg: '#4a4f3a', ink: '#ecdfbc' }, // olive
  { bg: '#3a2c3f', ink: '#e6d2b0' } // plum
];
const bindingFor = (book) => {
  const key = String(book.workTitle || book.id || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return BINDINGS[h % BINDINGS.length];
};

export function AppleBookCover({ book, height = 'aspect-[2/3]' }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const coverUrl = book.customCoverUrl || (book.editions?.[0]?.isbn && book.editions[0].isbn !== 'Pending Scan' ? `https://covers.openlibrary.org/b/isbn/${book.editions[0].isbn}-M.jpg` : null);
  const binding = bindingFor(book);

  // Start fresh when the cover changes (e.g. after choosing a new one)
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [coverUrl]);

  const showBinding = !imageLoaded || imageError || !coverUrl;
  return (
    <div
      className={`relative w-full ${height} overflow-hidden shadow-[0_10px_16px_-8px_rgba(40,25,10,0.55)] group-hover:shadow-[0_16px_22px_-10px_rgba(40,25,10,0.6)] transition-all duration-300 flex flex-col justify-between`}
      style={{ borderRadius: '3px 8px 8px 3px', background: binding.bg, color: binding.ink, containerType: 'inline-size' }}
    >
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

      {showBinding && (
        <div className="absolute inset-0 z-0 flex flex-col justify-between pl-[18%] pr-[9%] py-[10%]">
          <span aria-hidden="true" className="block h-px w-full opacity-40" style={{ background: binding.ink }} />
          <p className="tracking-wider line-clamp-1 opacity-85 mt-1" style={{ fontVariant: 'small-caps', fontSize: 'clamp(6px, 8cqw, 11px)' }}>{book.author}</p>
          <h4 className="font-serif font-semibold leading-tight line-clamp-3" style={{ fontSize: 'clamp(8px, 12.5cqw, 18px)' }}>{book.workTitle}</h4>
          <span aria-hidden="true" className="rounded-full border self-center opacity-40" style={{ borderColor: binding.ink, width: '18cqw', height: '18cqw', maxWidth: 26, maxHeight: 26 }} />
          <span aria-hidden="true" className="block h-px w-full opacity-40" style={{ background: binding.ink }} />
        </div>
      )}

      {/* the spine: a crease near the left edge */}
      <div className="absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/35 via-black/10 to-white/10 pointer-events-none z-10" />
      <div className="absolute inset-y-0 left-[7%] w-px bg-white/15 pointer-events-none z-10" />

      <div className="relative z-10 p-2.5 flex items-start justify-between pointer-events-none">
        {book.series && book.seriesNumber ? (
          <span className="ml-[10%] text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/55 text-amber-300 border border-amber-300/40">
            #{book.seriesNumber}
          </span>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

// The wooden shelf the books stand on (in the grid, the pieces join into one long shelf).
export function ShelfBoard({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`h-3 bg-gradient-to-b from-[#7a4e2c] via-[#5c3a21] to-[#4a2e19] shadow-[0_7px_10px_-5px_rgba(46,35,24,0.65),inset_0_1px_0_rgba(255,220,170,0.25)] ${className}`}
    />
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
      className={`group cursor-pointer flex flex-col ${selecting && !selected ? 'opacity-70' : ''}`}
    >
      <div className={`relative px-[6%] transition-transform duration-200 group-hover:-translate-y-1.5 ${selected ? 'ring-4 ring-orange-500 ring-offset-2 ring-offset-[#f4efe3] rounded-lg' : ''}`}>
        {selecting && (
          <span className={`absolute top-2 right-[9%] z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold ${selected ? 'bg-orange-500 border-orange-500' : 'bg-black/30 border-white'}`}>{selected ? '✓' : ''}</span>
        )}
        <AppleBookCover book={book} />
        {book.owned === false && (
          <span
            className="absolute top-2.5 right-[9%] z-20 w-7 h-7 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center shadow-xs"
            title="On your wishlist"
          >
            <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
          </span>
        )}
      </div>
      <ShelfBoard className="-mx-3" />

      <div className="mt-2.5 space-y-0.5">
        <h4 className="font-serif text-[15px] font-semibold leading-snug text-slate-900 truncate group-hover:text-orange-600 transition-colors">
          {book.workTitle}
        </h4>
        <button
          onClick={(e) => { e.stopPropagation(); onAuthorClick?.(e); }}
          className="text-xs text-slate-500 hover:text-orange-600 hover:underline transition-colors truncate block w-full text-left"
        >
          {book.author}
        </button>
        {book.rating ? <StarRating value={book.rating} size="sm" /> : null}
        {currentLoan(book) && <p className="text-[10px] font-semibold text-sky-700 truncate">Lent to {currentLoan(book).to}</p>}
        {book.owned !== false && (book.editions || []).length > 1 && (
          <p className="text-[10px] font-semibold text-orange-700 truncate">{book.editions.length} copies</p>
        )}
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
