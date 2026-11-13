import React, { useEffect, useState } from 'react';
import { Headphones, PartyPopper, BookOpen, Tablet } from 'lucide-react';
import { progressOf, hoursText, READ_FORMATS } from './shelves.js';
import { statusChanges } from './reading.js';

const ICONS = { print: BookOpen, ebook: Tablet, audio: Headphones };

// "Reading it as: Print / Ebook / Audiobook" (shown on the My Reading tab).
export function FormatChips({ book, onUpdate }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Reading it as">
      <span className="text-[10px] uppercase font-semibold text-slate-400 mr-1">Reading it as</span>
      {READ_FORMATS.map(([value, label]) => {
        const Icon = ICONS[value];
        const on = (book.readFormat || 'print') === value;
        return (
          <button key={value} role="radio" aria-checked={on} onClick={() => onUpdate({ readFormat: value })}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1 ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        );
      })}
    </div>
  );
}

// Two boxes (hours and minutes) for a length of time.
function TimeInput({ label, minutes, onSave }) {
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  useEffect(() => {
    const total = Number(minutes) || 0;
    setH(total ? String(Math.floor(total / 60)) : '');
    setM(total ? String(total % 60) : '');
  }, [minutes]);
  const save = () => {
    const total = (Number(h) || 0) * 60 + (Number(m) || 0);
    if (total !== (Number(minutes) || 0)) onSave(total || null);
  };
  const box = 'w-12 px-1.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-center';
  const enter = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <span className="flex items-center gap-1">
      <input type="number" min="0" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} onBlur={save} onKeyDown={enter} aria-label={`${label} hours`} className={box} placeholder="0" /> h
      <input type="number" min="0" max="59" inputMode="numeric" value={m} onChange={(e) => setM(e.target.value)} onBlur={save} onKeyDown={enter} aria-label={`${label} minutes`} className={box} placeholder="0" /> min
    </span>
  );
}

// For an audiobook you're listening to: time listened out of the total length.
export default function AudioProgress({ book, onUpdate }) {
  const p = progressOf(book);
  const length = Number(book.audioLength) || 0;
  const bump = (by) => onUpdate({ audioMinutes: Math.max(0, (Number(book.audioMinutes) || 0) + by) });
  const atEnd = length && (Number(book.audioMinutes) || 0) >= length;
  return (
    <div className="bg-orange-50/60 rounded-2xl p-4 border border-orange-200/70 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Headphones className="w-4 h-4 text-orange-500" /> My listening</span>
        {p?.pct !== null && p?.pct !== undefined && <span className="text-xs font-bold text-orange-600">{p.pct}%</span>}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
        <span>Listened</span>
        <TimeInput label="Listened" minutes={book.audioMinutes} onSave={(v) => onUpdate({ audioMinutes: v })} />
        <span>of</span>
        <TimeInput label="Audiobook length" minutes={book.audioLength} onSave={(v) => onUpdate({ audioLength: v })} />
      </div>
      <div className="flex gap-1.5">
        {[15, 30, 60].map(n => <button key={n} onClick={() => bump(n)} className="px-2 py-1 rounded-lg border border-orange-200 bg-white text-orange-700 text-[11px] font-semibold hover:bg-orange-100">+{n} min</button>)}
      </div>
      <div className="h-2 rounded-full bg-orange-100 overflow-hidden" role="progressbar" aria-valuenow={p?.pct || 0} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${p?.pct || 0}%` }} />
      </div>
      {!length && <p className="text-[11px] text-slate-500">Enter the audiobook's length (it's on the app you listen with) to see how far along you are.</p>}
      {length > 0 && <p className="text-[11px] text-slate-500">{hoursText(Math.max(0, length - (Number(book.audioMinutes) || 0)))} left</p>}
      {atEnd && (
        <button onClick={() => onUpdate(statusChanges(book, 'Completed'))} className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5">
          <PartyPopper className="w-4 h-4" /> I finished it!
        </button>
      )}
    </div>
  );
}
