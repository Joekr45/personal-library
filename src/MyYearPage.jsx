import React, { useEffect, useMemo, useState } from 'react';
import { Target, Trophy, BookOpen, Star, Pencil, Check, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { api } from './api.js';
import StarRating from './StarRating.jsx';
import { yearOf, formatDate, upNextInSeries } from './reading.js';
import YearInReview, { finishesInYear } from './YearInReview.jsx';
import ReadingStats from './ReadingStats.jsx';
import { Cover } from './AuthorPage.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Up next in your series": the next book to read in every series you've started.
export function UpNext({ books, onOpenBook }) {
  const next = useMemo(() => upNextInSeries(books), [books]);
  if (next.length === 0) return null;
  return (
    <section className="p-4 bg-white border border-slate-200/80 rounded-3xl space-y-3">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><ArrowRight className="w-4 h-4 text-orange-500" /> Up next in your series</h3>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {next.map(({ book, series }) => (
          <button key={book.id} onClick={() => onOpenBook(book)} className="w-24 flex-shrink-0 text-left">
            <Cover url={book.customCoverUrl} title={book.workTitle} author={book.author} muted={book.owned === false} />
            <p className="mt-1 text-[10px] font-bold text-orange-600 line-clamp-1">{series} #{book.seriesNumber}</p>
            <p className="text-[11px] font-bold text-slate-900 leading-tight line-clamp-2">{book.workTitle}</p>
            {book.owned === false && <p className="text-[10px] text-rose-600">On your wishlist</p>}
          </button>
        ))}
      </div>
    </section>
  );
}

// "My Year": books finished this year, the yearly goal, and a few fun numbers.
export default function MyYearPage({ books, onOpenBook }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [goal, setGoal] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getGoal(year).then(d => setGoal(d.goal)).catch(() => setGoal(null));
  }, [year]);

  // One entry per time a book was finished this year (a re-read counts again).
  const entries = useMemo(() => finishesInYear(books, year), [books, year]);
  const finished = entries.map(e => ({ ...e.book, dateFinished: e.date }));
  const finishedNoDate = books.filter(b => b.readingStatus === 'Completed' && !b.dateFinished).length;

  const byMonth = MONTHS.map((_, m) => finished.filter(b => Number(String(b.dateFinished).slice(5, 7)) === m + 1).length);
  const maxMonth = Math.max(1, ...byMonth);
  const rated = finished.filter(b => b.rating);
  const avgRating = rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : null;
  const pages = finished.reduce((s, b) => s + (Number(b.editions?.[0]?.pageCount) || 0), 0);
  const topAuthors = Object.entries(finished.reduce((m, b) => { m[b.author] = (m[b.author] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 3);
  const favourite = [...rated].sort((a, b) => b.rating - a.rating)[0];

  // Ahead or behind schedule this year
  const dayOfYear = Math.floor((Date.now() - new Date(thisYear, 0, 1)) / 86400000) + 1;
  const expected = goal && year === thisYear ? Math.floor((goal * dayOfYear) / 365) : null;

  const saveGoal = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const result = await api.setGoal(year, Number(goalInput) || 0);
      setGoal(result.goal);
      setEditingGoal(false);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Trophy className="w-5 h-5 text-orange-500" /> My Year in Books</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-lg bg-white border border-slate-200" aria-label="Previous year"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-bold w-12 text-center">{year}</span>
          <button onClick={() => setYear(y => Math.min(thisYear, y + 1))} disabled={year >= thisYear} className="p-1.5 rounded-lg bg-white border border-slate-200 disabled:opacity-30" aria-label="Next year"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Goal */}
      <section className="p-5 bg-gradient-to-br from-amber-600 to-amber-800 text-white rounded-3xl space-y-3 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/80 font-semibold flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> {year} reading goal</p>
            <p className="text-3xl font-black mt-1">{finished.length}{goal ? <span className="text-lg font-bold text-white/80"> of {goal} books</span> : <span className="text-lg font-bold text-white/80"> {finished.length === 1 ? 'book' : 'books'} read</span>}</p>
          </div>
          {!editingGoal && (
            <button onClick={() => { setGoalInput(goal ? String(goal) : ''); setEditingGoal(true); }} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-semibold flex items-center gap-1">
              <Pencil className="w-3.5 h-3.5" /> {goal ? 'Change goal' : 'Set a goal'}
            </button>
          )}
        </div>
        {editingGoal && (
          <form onSubmit={saveGoal} className="flex gap-2 items-center">
            <input type="number" min="1" max="1000" autoFocus value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="e.g. 24" className="w-24 px-3 py-1.5 rounded-xl text-slate-900 text-sm" />
            <span className="text-xs">books in {year}</span>
            <button type="submit" className="ml-auto px-3 py-1.5 bg-white text-orange-600 rounded-xl text-xs font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Save</button>
          </form>
        )}
        {error && <p className="text-xs bg-white/20 p-2 rounded-lg">{error}</p>}
        {goal && (
          <>
            <div className="h-3 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, (100 * finished.length) / goal)}%` }} />
            </div>
            <p className="text-xs text-white/90">
              {finished.length >= goal
                ? `Goal reached! 🎉`
                : expected !== null
                  ? finished.length >= expected
                    ? `You're ${finished.length - expected === 0 ? 'right on' : `${finished.length - expected} ahead of`} schedule.`
                    : `${expected - finished.length} behind schedule — ${goal - finished.length} to go.`
                  : `${goal - finished.length} to go.`}
            </p>
          </>
        )}
      </section>

      {/* Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded-2xl"><p className="text-[10px] uppercase font-semibold text-slate-400">Books</p><p className="text-xl font-black text-slate-900">{finished.length}</p></div>
        <div className="p-3 bg-white border border-slate-200 rounded-2xl"><p className="text-[10px] uppercase font-semibold text-slate-400">Pages</p><p className="text-xl font-black text-slate-900">{pages ? pages.toLocaleString() : '—'}</p></div>
        <div className="p-3 bg-white border border-slate-200 rounded-2xl"><p className="text-[10px] uppercase font-semibold text-slate-400">Average rating</p><p className="text-xl font-black text-slate-900 flex items-center gap-1">{avgRating ? <>{avgRating.toFixed(1)} <Star className="w-4 h-4 text-amber-500 fill-amber-500" /></> : '—'}</p></div>
        <div className="p-3 bg-white border border-slate-200 rounded-2xl"><p className="text-[10px] uppercase font-semibold text-slate-400">Top author</p><p className="text-sm font-black text-slate-900 line-clamp-2">{topAuthors[0] ? `${topAuthors[0][0]} (${topAuthors[0][1]})` : '—'}</p></div>
      </div>

      {/* By month */}
      <section className="p-4 bg-white border border-slate-200/80 rounded-3xl">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Books finished each month</h3>
        <div className="flex items-end gap-1.5 h-28">
          {byMonth.map((n, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              {n > 0 && <span className="text-[10px] font-bold text-slate-600">{n}</span>}
              <div className="w-full rounded-t-md bg-orange-400" style={{ height: `${(80 * n) / maxMonth}%`, minHeight: n ? 4 : 1, opacity: n ? 1 : 0.25 }} />
              <span className="text-[9px] text-slate-400">{MONTHS[i].charAt(0)}</span>
            </div>
          ))}
        </div>
      </section>

      {entries.length > 0 ? (
        <YearInReview books={books} year={year} entries={entries} onOpenBook={onOpenBook} />
      ) : (
        <section className="p-5 rounded-3xl border-2 border-dashed border-violet-200 bg-violet-50/60 text-center space-y-1" aria-label={`${year} in review`}>
          <p className="text-sm font-bold text-violet-700">Your {year} in review</p>
          <p className="text-xs text-slate-600">
            Finish a book to see your year in review here: your favourite, longest book, busiest month and more, ready to share.
            Open a book you've read and tap <b>Completed</b> (you can change the finish date under <b>Reading dates</b>).
          </p>
        </section>
      )}

      <ReadingStats entries={entries} year={year} />

      {year === thisYear && <UpNext books={books} onOpenBook={onOpenBook} />}

      {/* Finished list */}
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">Finished in {year}</h3>
        {favourite && <p className="text-xs text-slate-500">Highest rated: <b className="text-slate-800">{favourite.workTitle}</b></p>}
        {finished.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
            No finished books with a {year} date yet. Mark a book <b>Completed</b> and its finish date is filled in automatically.
          </p>
        ) : (
          <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {entries.map(({ book: b, date, reread }) => (
              <li key={`${b.id}-${date}`}>
                <button onClick={() => onOpenBook(b)} className="w-full p-3 flex gap-3 items-center text-left">
                  <div className="w-10 flex-shrink-0"><Cover url={b.customCoverUrl} title={b.workTitle} author={b.author} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{b.workTitle}</p>
                    <p className="text-[11px] text-slate-500 truncate">{b.author}</p>
                    {b.rating ? <StarRating value={b.rating} size="sm" /> : null}
                  </div>
                  <span className="text-[11px] text-slate-400 flex-shrink-0 text-right">{formatDate(date)}{reread && <span className="block text-[10px] text-orange-600 font-semibold">Re-read</span>}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {finishedNoDate > 0 && year === thisYear && (
          <p className="text-[11px] text-slate-400 flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {finishedNoDate} finished {finishedNoDate === 1 ? 'book has' : 'books have'} no finish date, so {finishedNoDate === 1 ? "it isn't" : "they aren't"} counted. Add one on the book's page.</p>
        )}
      </section>
    </div>
  );
}
