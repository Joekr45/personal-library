import React, { useMemo, useRef, useState } from 'react';
import { Dices, X, BookOpen, RefreshCw } from 'lucide-react';
import { totalPagesOf, READ_FORMATS } from './shelves.js';
import { LENGTHS, candidates } from './nextread.js';

// "Pick my next read": a random book from Want to Read, with a few filters.
export default function NextReadPicker({ books, onClose, onStart, onOpenBook, renderCover }) {
  const [length, setLength] = useState('any');
  const [format, setFormat] = useState('any');
  const [mood, setMood] = useState('any');
  const [inOrder, setInOrder] = useState(true);
  const [pick, setPick] = useState(null);
  const [rolling, setRolling] = useState(false);
  const seen = useRef(new Set());

  const pool = useMemo(() => candidates(books, { length, format, mood, inOrder }), [books, length, format, mood, inOrder]);
  const moods = useMemo(() => [...new Set(books.filter(b => b.owned !== false && b.readingStatus === 'Unread').flatMap(b => b.moods || []))].sort(), [books]);

  const roll = () => {
    if (!pool.length) return;
    // Don't show the same book twice until every book has had a turn.
    let fresh = pool.filter(b => !seen.current.has(b.id) && b.id !== pick?.id);
    if (!fresh.length) { seen.current.clear(); fresh = pool.filter(b => b.id !== pick?.id); }
    if (!fresh.length) fresh = pool;
    const chosen = fresh[Math.floor(Math.random() * fresh.length)];
    seen.current.add(chosen.id);
    setRolling(true);
    setTimeout(() => { setPick(chosen); setRolling(false); }, 350);
  };

  const select = 'px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white';
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pick my next read">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Dices className="w-5 h-5 text-orange-500" /> Pick my next read</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select value={length} onChange={(e) => { setLength(e.target.value); setPick(null); }} aria-label="Length" className={select}>
            {LENGTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={format} onChange={(e) => { setFormat(e.target.value); setPick(null); }} aria-label="Format" className={select}>
            <option value="any">Any format</option>
            {READ_FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {moods.length > 0 && (
            <select value={mood} onChange={(e) => { setMood(e.target.value); setPick(null); }} aria-label="Mood" className={`${select} col-span-2`}>
              <option value="any">Any mood</option>
              {moods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-600">
          <input type="checkbox" checked={inOrder} onChange={(e) => { setInOrder(e.target.checked); setPick(null); }} className="accent-orange-500" />
          Keep series in order (skip book 3 if I haven't read book 2)
        </label>

        <div className="min-h-[9rem] flex items-center justify-center">
          {pool.length === 0 ? (
            <p className="text-xs text-slate-500 text-center">No Want to Read books match these choices.{length !== 'any' ? ' (Books without a page count are left out when you pick a length.)' : ''}</p>
          ) : rolling ? (
            <RefreshCw className="w-8 h-8 text-orange-400 animate-spin" />
          ) : pick ? (
            <div className="flex gap-4 items-center w-full" data-pick={pick.id}>
              <div className="w-20 flex-shrink-0">{renderCover(pick)}</div>
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-bold text-orange-600">How about…</p>
                <p className="text-base font-bold text-slate-900 leading-tight">{pick.workTitle}</p>
                <p className="text-xs text-slate-500">{pick.author}</p>
                {pick.series && <p className="text-[11px] text-slate-500">{pick.series}{pick.seriesNumber ? ` #${pick.seriesNumber}` : ''}</p>}
                {totalPagesOf(pick) > 0 && <p className="text-[11px] text-slate-400">{totalPagesOf(pick)} pages</p>}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center">{pool.length} book{pool.length === 1 ? '' : 's'} to choose from.</p>
          )}
        </div>

        <div className="flex gap-2 justify-end flex-wrap">
          {pick && !rolling && (
            <>
              <button onClick={() => onOpenBook(pick)} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">Open book</button>
              <button onClick={() => onStart(pick)} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> Start reading</button>
            </>
          )}
          <button onClick={roll} disabled={!pool.length || rolling} className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5">
            <Dices className="w-4 h-4" /> {pick ? 'Pick again' : 'Pick for me'}
          </button>
        </div>
      </div>
    </div>
  );
}
