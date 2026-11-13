import React, { useState } from 'react';
import { PartyPopper, Share2, Star } from 'lucide-react';
import { yearOf, formatDate } from './reading.js';
import { shareOrCopy } from './lending.js';
import { Cover } from './AuthorPage.jsx';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Every time a book was finished in a year: [{ book, date, reread }], newest first.
// The latest read only counts once the book is marked Completed; earlier reads always count.
export function finishesInYear(books, year) {
  const out = [];
  for (const book of books) {
    const reads = (book.reads || []).map(r => r.finished).filter(Boolean);
    reads.forEach((date, i) => { if (yearOf(date) === year) out.push({ book, date, reread: i > 0 }); });
    if (book.readingStatus === 'Completed' && yearOf(book.dateFinished) === year) {
      out.push({ book, date: book.dateFinished, reread: reads.length > 0 });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const pagesOf = (b) => Number(b.editions?.[0]?.pageCount) || 0;

export function yearSummary(books, year, entries = finishesInYear(books, year)) {
  const chrono = [...entries].reverse();
  const unique = [...new Map(entries.map(e => [e.book.id, e.book])).values()];
  const pages = entries.reduce((s, e) => s + pagesOf(e.book), 0);
  const months = MONTH_NAMES.map((_, m) => entries.filter(e => Number(e.date.slice(5, 7)) === m + 1).length);
  const busiest = Math.max(...months);
  const authors = Object.entries(entries.reduce((m, e) => { m[e.book.author] = (m[e.book.author] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const favourites = unique.filter(b => b.rating).sort((a, b) => b.rating - a.rating || 0);
  const quotes = books.reduce((n, b) => n + (b.quotes || []).filter(q => yearOf(q.addedOn) === year).length, 0);
  return {
    count: entries.length,
    pages,
    longest: [...unique].sort((a, b) => pagesOf(b) - pagesOf(a))[0],
    busiestMonth: busiest > 0 ? { name: MONTH_NAMES[months.indexOf(busiest)], count: busiest } : null,
    topAuthor: authors[0] ? { name: authors[0][0], count: authors[0][1] } : null,
    authorCount: authors.length,
    favourite: favourites[0] || null,
    fiveStars: favourites.filter(b => b.rating >= 5),
    first: chrono[0] || null,
    last: chrono[chrono.length - 1] || null,
    rereads: entries.filter(e => e.reread).length,
    quotes
  };
}

export function summaryText(year, s, name) {
  const lines = [`📚 ${name ? `${name}'s` : 'My'} ${year} in books`, `${s.count} book${s.count === 1 ? '' : 's'}${s.pages ? `, ${s.pages.toLocaleString()} pages` : ''}, ${s.authorCount} author${s.authorCount === 1 ? '' : 's'}`];
  if (s.favourite) lines.push(`Favourite: ${s.favourite.workTitle} by ${s.favourite.author} (${'★'.repeat(Math.floor(s.favourite.rating))})`);
  if (s.topAuthor && s.topAuthor.count > 1) lines.push(`Most read author: ${s.topAuthor.name} (${s.topAuthor.count})`);
  if (s.longest && pagesOf(s.longest)) lines.push(`Longest: ${s.longest.workTitle} (${pagesOf(s.longest)} pages)`);
  if (s.busiestMonth) lines.push(`Busiest month: ${s.busiestMonth.name} (${s.busiestMonth.count})`);
  if (s.rereads) lines.push(`Re-reads: ${s.rereads}`);
  return lines.join('\n');
}

// "Your year in review": the highlights of a year of reading, ready to share.
export default function YearInReview({ books, year, entries, onOpenBook, name }) {
  const s = yearSummary(books, year, entries);
  const [note, setNote] = useState('');
  const share = async () => {
    const result = await shareOrCopy(summaryText(year, s, name), `My ${year} in books`);
    setNote(result === 'copied' ? 'Copied! Paste it anywhere.' : '');
    setTimeout(() => setNote(''), 3000);
  };
  const tile = (label, value, book) => (
    <button onClick={() => book && onOpenBook(book)} disabled={!book} className="p-3 bg-white/15 rounded-2xl text-left flex gap-2.5 items-center min-w-0 disabled:cursor-default">
      {book && <div className="w-9 flex-shrink-0"><Cover url={book.customCoverUrl} title={book.workTitle} author={book.author} /></div>}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-white/70">{label}</p>
        <p className="text-xs font-bold text-white line-clamp-2">{value}</p>
      </div>
    </button>
  );

  return (
    <section className="p-5 rounded-3xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white space-y-4 shadow-md" aria-label={`${year} in review`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-white/80 flex items-center gap-1.5"><PartyPopper className="w-3.5 h-3.5" /> Your {year} in review</p>
          <p className="text-2xl font-black mt-1">{s.count} book{s.count === 1 ? '' : 's'}{s.pages ? ` · ${s.pages.toLocaleString()} pages` : ''}</p>
          <p className="text-xs text-white/80">{s.authorCount} different author{s.authorCount === 1 ? '' : 's'}{s.rereads ? ` · ${s.rereads} re-read${s.rereads === 1 ? '' : 's'}` : ''}{s.quotes ? ` · ${s.quotes} quote${s.quotes === 1 ? '' : 's'} saved` : ''}</p>
        </div>
        <button onClick={share} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-semibold flex items-center gap-1 flex-shrink-0">
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
      </div>
      {note && <p className="text-xs bg-white/20 p-2 rounded-lg">{note}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {s.favourite && tile('Favourite', <>{s.favourite.workTitle} <span className="inline-flex items-center gap-0.5">· {s.favourite.rating}<Star className="w-3 h-3 fill-white" /></span></>, s.favourite)}
        {s.longest && pagesOf(s.longest) > 0 && tile('Longest book', `${s.longest.workTitle} · ${pagesOf(s.longest)} pages`, s.longest)}
        {s.first && tile('First of the year', `${s.first.book.workTitle} · ${formatDate(s.first.date)}`, s.first.book)}
        {s.last && s.count > 1 && tile(year === new Date().getFullYear() ? 'Latest' : 'Last of the year', `${s.last.book.workTitle} · ${formatDate(s.last.date)}`, s.last.book)}
        {s.topAuthor && tile('Most read author', `${s.topAuthor.name} (${s.topAuthor.count})`)}
        {s.busiestMonth && tile('Busiest month', `${s.busiestMonth.name} (${s.busiestMonth.count} book${s.busiestMonth.count === 1 ? '' : 's'})`)}
      </div>
      {s.fiveStars.length > 1 && (
        <p className="text-xs text-white/90"><b>Five-star reads:</b> {s.fiveStars.map(b => b.workTitle).join(', ')}</p>
      )}
    </section>
  );
}
