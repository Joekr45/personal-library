import React, { useEffect, useState } from 'react';
import { BarChart3, Flame } from 'lucide-react';
import { api } from './api.js';

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// "Reading stats" on My Year: genres, moods, book length, speed, pages a day and streaks.
export default function ReadingStats({ entries, year }) {
  const [log, setLog] = useState(null);
  useEffect(() => { api.readingLog().then(setLog).catch(() => setLog(null)); }, []);

  const books = entries.map(e => ({ ...e.book, finishedOn: e.date }));
  const tally = (get) => {
    const m = new Map();
    books.forEach(b => (get(b) || []).forEach(x => m.set(x, (m.get(x) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const genres = tally(b => b.genres).slice(0, 6);
  const moods = tally(b => b.moods).slice(0, 6);
  const paces = tally(b => (b.pace ? [b.pace] : []));
  const lengths = books.map(b => Number(b.editions?.[0]?.pageCount) || 0).filter(Boolean);
  const avgLength = lengths.length ? Math.round(lengths.reduce((s, n) => s + n, 0) / lengths.length) : null;
  const durations = books.filter(b => b.dateStarted && b.finishedOn >= b.dateStarted && b.finishedOn === b.dateFinished)
    .map(b => daysBetween(b.dateStarted, b.finishedOn) + 1);
  const avgDays = durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : null;
  const now = new Date();
  const daysSoFar = year === now.getFullYear() ? Math.floor((now - new Date(year, 0, 1)) / 86400000) + 1 : (year % 4 === 0 ? 366 : 365);
  const pages = lengths.reduce((s, n) => s + n, 0);
  const minutesThisYear = (log?.days || []).filter(d => d.day.startsWith(String(year))).reduce((s, d) => s + d.minutes, 0);
  const maxGenre = Math.max(1, ...genres.map(g => g[1]));

  const stat = (label, value, hint) => (
    <div className="p-3 bg-slate-50 rounded-2xl">
      <p className="text-[10px] uppercase font-semibold text-slate-400">{label}</p>
      <p className="text-lg font-black text-slate-900">{value}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );

  return (
    <section className="p-4 bg-white border border-slate-200/80 rounded-3xl space-y-4" aria-label="Reading stats">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-orange-500" /> Reading stats</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stat('Average length', avgLength ? `${avgLength} pages` : '—')}
        {stat('Time per book', avgDays ? `${avgDays} day${avgDays === 1 ? '' : 's'}` : '—', durations.length ? 'start to finish' : 'needs start dates')}
        {stat('Pages a day', pages ? (pages / daysSoFar).toFixed(1) : '—')}
        {stat('Reading streak', log ? <span className="flex items-center gap-1"><Flame className="w-4 h-4 text-orange-500" />{log.streak.current} day{log.streak.current === 1 ? '' : 's'}</span> : '—', log ? `best: ${log.streak.longest}` : null)}
      </div>
      {minutesThisYear > 0 && <p className="text-xs text-slate-600">Logged reading time in {year}: <b>{Math.floor(minutesThisYear / 60)} h {minutesThisYear % 60} min</b></p>}
      {genres.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase font-semibold text-slate-400">Top genres</p>
          {genres.map(([g, n]) => (
            <div key={g} className="flex items-center gap-2 text-[11px]">
              <span className="w-32 truncate text-slate-700">{g}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-orange-400 rounded-full" style={{ width: `${(100 * n) / maxGenre}%` }} /></div>
              <span className="w-6 text-right text-slate-500">{n}</span>
            </div>
          ))}
        </div>
      ) : <p className="text-[11px] text-slate-400">Genres appear here once your finished books have them (open a book, or fill them all in from Settings).</p>}
      {(moods.length > 0 || paces.length > 0) && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] uppercase font-semibold text-slate-400 mr-1">Your reads felt</span>
          {moods.map(([m, n]) => <span key={m} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium">{m} · {n}</span>)}
          {paces.map(([p, n]) => <span key={p} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">{p} pace · {n}</span>)}
        </div>
      )}
    </section>
  );
}
