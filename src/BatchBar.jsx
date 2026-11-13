import React, { useState } from 'react';
import { X, Trash2, Tags, MapPin, Heart, Library, CheckSquare , Printer } from 'lucide-react';

// The bar at the bottom while selecting books: change them all at once.
export default function BatchBar({ count, total, onSelectAll, onClear, onDone, onApply, onPrintLabels, shelves }) {
  const [busy, setBusy] = useState(false);
  const run = async (body) => { setBusy(true); try { await onApply(body); } finally { setBusy(false); } };
  const disabled = busy || count === 0;
  const select = 'px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs text-white disabled:opacity-40';
  const button = 'px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1 disabled:opacity-40';

  return (
    <div className="fixed bottom-3 inset-x-3 md:left-72 z-40 p-3 rounded-2xl bg-slate-900 text-white shadow-2xl flex items-center gap-2 flex-wrap" role="toolbar" aria-label="Change selected books">
      <span className="text-xs font-bold mr-1">{count} selected</span>
      <button onClick={count === total ? onClear : onSelectAll} className={button}><CheckSquare className="w-3.5 h-3.5" /> {count === total ? 'None' : `All ${total}`}</button>
      <select disabled={disabled} value="" aria-label="Set reading status" className={select}
        onChange={(e) => e.target.value && run({ status: e.target.value })}>
        <option value="">Status…</option>
        <option value="Unread">Unread</option>
        <option value="Reading">Reading</option>
        <option value="Completed">Completed</option>
        <option value="DNF">Did not finish</option>
      </select>
      <select disabled={disabled} value="" aria-label="Add to shelf" className={select}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const name = v === '__new' ? prompt('New shelf name:')?.trim() : v;
          if (name) run({ addTags: [name] });
        }}>
        <option value="">Add to shelf…</option>
        {shelves.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        <option value="__new">+ New shelf…</option>
      </select>
      <button disabled={disabled} onClick={() => { const where = prompt('Where are these books? (e.g. Bedroom shelf)'); if (where !== null) run({ shelfLocation: where.trim() }); }} className={button}><MapPin className="w-3.5 h-3.5" /> Location</button>
      <button disabled={disabled} onClick={() => run({ owned: true })} className={button}><Library className="w-3.5 h-3.5" /> I own these</button>
      <button disabled={disabled} onClick={() => run({ owned: false })} className={button}><Heart className="w-3.5 h-3.5" /> To wishlist</button>
      <button disabled={disabled} onClick={onPrintLabels} className={button}><Printer className="w-3.5 h-3.5" /> Labels</button>
      <button disabled={disabled} onClick={() => confirm(`Delete ${count} book${count === 1 ? '' : 's'}? They go to Recently deleted for 30 days.`) && run({ trash: true })} className={`${button} text-red-300`}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
      <button onClick={onDone} className="ml-auto px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-xs font-semibold flex items-center gap-1"><X className="w-3.5 h-3.5" /> Done</button>
    </div>
  );
}
