import React, { useEffect, useState } from 'react';
import { CalendarDays, NotebookPen, Check } from 'lucide-react';
import StarRating from './StarRating.jsx';

// "My reading" on a book's page: stars, when you started and finished it, and your notes.
export default function ReadingPanel({ book, onUpdate }) {
  const [notes, setNotes] = useState(book.notes || '');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setNotes(book.notes || ''); }, [book.id]);

  const saveNotes = async () => {
    if ((book.notes || '') === notes) return;
    const result = await onUpdate({ notes });
    if (result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  const dateInput = (field, label) => (
    <label className="block">
      <span className="text-[10px] uppercase font-semibold text-slate-400">{label}</span>
      <input
        type="date"
        value={book[field] || ''}
        onChange={(e) => onUpdate({ [field]: e.target.value || null })}
        className="mt-0.5 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
      />
    </label>
  );

  return (
    <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200/70 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs font-bold text-slate-800">My rating</span>
        <StarRating value={book.rating} onChange={(rating) => onUpdate({ rating })} />
      </div>
      <div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1"><CalendarDays className="w-4 h-4 text-orange-500" /> Reading dates</div>
        <div className="grid grid-cols-2 gap-2">
          {dateInput('dateStarted', 'Started')}
          {dateInput('dateFinished', 'Finished')}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><NotebookPen className="w-4 h-4 text-orange-500" /> My notes</span>
          {saved && <span className="text-[11px] text-emerald-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</span>}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Your thoughts, favourite quotes, who recommended it… (saved when you tap away)"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-orange-500"
        />
      </div>
    </div>
  );
}
