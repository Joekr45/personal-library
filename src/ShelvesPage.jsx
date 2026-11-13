import React from 'react';
import { Tags, ChevronRight } from 'lucide-react';

// "My Shelves": the shelves you made (e.g. "Beach reads"). Tap one to see its books.
export default function ShelvesPage({ shelves, onOpen }) {
  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Tags className="w-5 h-5 text-violet-500" /> My Shelves</h2>
        <p className="text-xs text-slate-500">Your own groups of books, like "Beach reads" or "Book club picks". A book can be on as many shelves as you like.</p>
      </div>
      {shelves.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
          No shelves yet. Open any book, go to <b>Shelves &amp; More</b> and add it to a new shelf. To put many books on a shelf at once: <b>All → Select</b>, pick the books, then <b>Add to shelf</b>.
        </p>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {shelves.map(s => (
            <li key={s.name}>
              <button onClick={() => onOpen(s.name)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-violet-50">
                <span className="w-8 h-8 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center flex-shrink-0"><Tags className="w-4 h-4" /></span>
                <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{s.name}</span>
                <span className="text-xs text-slate-400">{s.count} book{s.count === 1 ? '' : 's'}</span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
