import React, { useState } from 'react';
import { Tags, X, Plus } from 'lucide-react';
import { tagsOf, hasTag } from './shelves.js';

// "My shelves" on a book's page: put the book on your own shelves (Beach reads, Signed copies…).
export default function ShelvesPanel({ book, shelves, onUpdate }) {
  const [text, setText] = useState('');
  const tags = tagsOf(book);
  const others = shelves.filter(s => !hasTag(book, s.name));

  const add = (name) => {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean || hasTag(book, clean)) { setText(''); return; }
    // Use the existing spelling if this shelf already exists ("beach reads" → "Beach reads").
    const existing = shelves.find(s => s.name.toLowerCase() === clean.toLowerCase());
    onUpdate({ tags: [...tags, existing ? existing.name : clean] });
    setText('');
  };
  const remove = (name) => onUpdate({ tags: tags.filter(t => t !== name) });

  return (
    <div className="bg-violet-50/60 rounded-2xl p-4 border border-violet-200/70 space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
        <Tags className="w-4 h-4 text-violet-500" /> My shelves
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-violet-500 text-white text-[11px] font-semibold">
              {t}
              <button onClick={() => remove(t)} aria-label={`Take off ${t}`} className="w-4 h-4 rounded-full hover:bg-white/25 flex items-center justify-center">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">Group books your way, e.g. “Beach reads”, “Signed copies”, “Book club”.</p>
      )}
      <form onSubmit={(e) => { e.preventDefault(); add(text); }} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add to a shelf…"
          aria-label="New shelf name"
          maxLength={40}
          className="flex-1 min-w-0 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-violet-400"
        />
        <button type="submit" disabled={!text.trim()} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500 text-white disabled:opacity-40 flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </form>
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.slice(0, 12).map(s => (
            <button key={s.name} onClick={() => add(s.name)} className="px-2.5 py-1 rounded-full border border-violet-200 bg-white text-violet-700 text-[11px] font-medium hover:bg-violet-100">
              + {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
