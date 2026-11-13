import React, { useEffect, useState } from 'react';
import { Gem, ChevronDown, ChevronUp } from 'lucide-react';

export const CONDITIONS = ['New', 'Fine', 'Very good', 'Good', 'Fair', 'Poor'];
const EMPTY = { signed: false, firstEdition: false, condition: null, boughtFrom: null, pricePaid: null, boughtOn: null };

export const hasCollectorInfo = (book) => {
  const c = book?.collector;
  return Boolean(c && (c.signed || c.firstEdition || c.condition || c.boughtFrom || c.pricePaid || c.boughtOn));
};

// "Collector details" for your copy: signed, first edition, condition, where and when you bought it.
export default function CollectorPanel({ book, onUpdate }) {
  const c = { ...EMPTY, ...(book.collector || {}) };
  const [open, setOpen] = useState(hasCollectorInfo(book));
  const [from, setFrom] = useState(c.boughtFrom || '');
  const [price, setPrice] = useState(c.pricePaid || '');
  useEffect(() => { setFrom(c.boughtFrom || ''); setPrice(c.pricePaid || ''); }, [book.id, c.boughtFrom, c.pricePaid]);

  const save = (changes) => onUpdate({ collector: { ...c, ...changes } });
  const input = 'w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white';
  const label = 'text-[10px] uppercase font-semibold text-slate-400';
  const summary = [c.signed && 'Signed', c.firstEdition && 'First edition', c.condition].filter(Boolean).join(' · ');

  return (
    <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200/70 space-y-3">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between text-xs font-bold text-slate-800">
        <span className="flex items-center gap-1.5"><Gem className="w-4 h-4 text-amber-600" /> Collector details</span>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">{summary}{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>
      {open && (
        <>
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={c.signed} onChange={(e) => save({ signed: e.target.checked })} className="accent-amber-600" /> Signed copy</label>
            <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={c.firstEdition} onChange={(e) => save({ firstEdition: e.target.checked })} className="accent-amber-600" /> First edition</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className={label}>Condition</span>
              <select value={c.condition || ''} onChange={(e) => save({ condition: e.target.value || null })} className={input}>
                <option value="">—</option>
                {CONDITIONS.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="block"><span className={label}>Bought on</span>
              <input type="date" value={c.boughtOn || ''} onChange={(e) => save({ boughtOn: e.target.value || null })} className={input} />
            </label>
            <label className="block"><span className={label}>Bought from</span>
              <input value={from} onChange={(e) => setFrom(e.target.value)} onBlur={() => from !== (c.boughtFrom || '') && save({ boughtFrom: from || null })} placeholder="e.g. Strand, a gift" className={input} />
            </label>
            <label className="block"><span className={label}>Price paid</span>
              <input value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => price !== (c.pricePaid || '') && save({ pricePaid: price || null })} placeholder="e.g. $12" className={input} />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
