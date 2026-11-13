import React, { useState } from 'react';
import { Palette, Plus, X } from 'lucide-react';

export const MOODS = ['Adventurous', 'Challenging', 'Dark', 'Emotional', 'Funny', 'Hopeful', 'Informative', 'Inspiring', 'Lighthearted', 'Mysterious', 'Reflective', 'Relaxing', 'Sad', 'Tense'];
export const PACES = [['slow', 'Slow'], ['medium', 'Medium'], ['fast', 'Fast']];
const COMMON_WARNINGS = ['Violence', 'Death', 'Abuse', 'Addiction', 'Language', 'Sexual content', 'Self-harm', 'War'];

// "How it felt": moods, pace and content warnings for a book.
export default function MoodPanel({ book, onUpdate }) {
  const moods = book.moods || [];
  const warnings = book.warnings || [];
  const [open, setOpen] = useState(moods.length > 0 || Boolean(book.pace) || warnings.length > 0);
  const [warning, setWarning] = useState('');

  const toggle = (list, value, field) => onUpdate({ [field]: list.includes(value) ? list.filter(x => x !== value) : [...list, value] });
  const addWarning = (e) => {
    e.preventDefault();
    const w = warning.trim();
    if (w && !warnings.some(x => x.toLowerCase() === w.toLowerCase())) onUpdate({ warnings: [...warnings, w] });
    setWarning('');
  };
  const chip = (on) => `px-2.5 py-1 rounded-full text-[11px] font-medium border ${on ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`;

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between text-xs font-bold text-slate-800">
        <span className="flex items-center gap-1.5"><Palette className="w-4 h-4 text-indigo-500" /> How it felt</span>
        <span className="text-[11px] font-medium text-slate-400 truncate ml-2">{[...moods.slice(0, 3), book.pace && `${book.pace} pace`].filter(Boolean).join(' · ') || (open ? '' : 'Mood, pace, warnings')}</span>
      </button>
      {open && (
        <>
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-400 mb-1">Mood</p>
            <div className="flex flex-wrap gap-1.5">
              {MOODS.map(m => <button key={m} onClick={() => toggle(moods, m, 'moods')} className={chip(moods.includes(m))} aria-pressed={moods.includes(m)}>{m}</button>)}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-400 mb-1">Pace</p>
            <div className="flex gap-1.5">
              {PACES.map(([v, label]) => <button key={v} onClick={() => onUpdate({ pace: book.pace === v ? null : v })} className={chip(book.pace === v)} aria-pressed={book.pace === v}>{label}</button>)}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-400 mb-1">Content warnings</p>
            <div className="flex flex-wrap gap-1.5">
              {warnings.map(w => (
                <span key={w} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-rose-500 text-white text-[11px] font-medium">
                  {w}<button onClick={() => toggle(warnings, w, 'warnings')} aria-label={`Remove ${w}`} className="w-4 h-4 rounded-full hover:bg-white/25 flex items-center justify-center"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {COMMON_WARNINGS.filter(w => !warnings.includes(w)).map(w => (
                <button key={w} onClick={() => toggle(warnings, w, 'warnings')} className="px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-[11px] text-slate-500 hover:bg-slate-50">+ {w}</button>
              ))}
            </div>
            <form onSubmit={addWarning} className="mt-1.5 flex gap-2">
              <input value={warning} onChange={(e) => setWarning(e.target.value)} placeholder="Other warning…" aria-label="Other content warning" maxLength={60}
                className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" />
              <button type="submit" disabled={!warning.trim()} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs disabled:opacity-40"><Plus className="w-3.5 h-3.5" /></button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
