import React, { useMemo, useState } from 'react';
import { ShoppingBag, X, Copy, Check, Share2, PackageCheck } from 'lucide-react';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const surname = (a) => String(a || '').split(',')[0].trim().split(/\s+/).pop();

// The wishlist as a shopping list: grouped by author, series in order, with "Got it!" buttons
// and a plain-text copy to paste into notes or a message.
export default function ShoppingList({ books, onGotIt, onClose }) {
  const [copied, setCopied] = useState(false);
  const groups = useMemo(() => {
    const map = new Map();
    for (const b of books.filter(x => x.owned === false)) {
      const key = b.author || 'Unknown author';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(b);
    }
    return [...map.entries()]
      .sort((a, b) => collator.compare(surname(a[0]), surname(b[0])))
      .map(([author, list]) => [author, list.sort((x, y) =>
        collator.compare(x.series || '', y.series || '') || (Number(x.seriesNumber) || 0) - (Number(y.seriesNumber) || 0) || collator.compare(x.workTitle, y.workTitle))]);
  }, [books]);

  const line = (b) => `${b.workTitle}${b.series ? ` (${b.series} #${b.seriesNumber ?? '?'})` : ''}${b.editions?.[0]?.language && b.editions[0].language !== 'English' ? ` [${b.editions[0].language}]` : ''}`;
  const text = groups.map(([author, list]) => `${author}\n${list.map(b => `  ☐ ${line(b)}`).join('\n')}`).join('\n\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Books to buy\n\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked; the list is still on screen
    }
  };
  const share = () => navigator.share?.({ title: 'Books to buy', text: `Books to buy\n\n${text}` }).catch(() => {});

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white sm:rounded-3xl shadow-2xl max-w-md w-full flex flex-col h-full sm:h-auto sm:max-h-[92vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-rose-500" /> Shopping list</h3>
          <button onClick={onClose} aria-label="Close shopping list" className="w-8 h-8 rounded-full bg-slate-200/60 flex items-center justify-center text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {groups.length === 0 && <p className="text-xs text-slate-500 text-center py-8">Your wishlist is empty.</p>}
          {groups.map(([author, list]) => (
            <div key={author}>
              <p className="text-xs font-bold text-slate-900">{author}</p>
              <ul className="mt-1 divide-y divide-slate-100">
                {list.map(b => (
                  <li key={b.id} className="py-2 flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-xs text-slate-700">{line(b)}</span>
                    <button onClick={() => onGotIt(b)} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 flex-shrink-0">
                      <PackageCheck className="w-3.5 h-3.5" /> Got it!
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {groups.length > 0 && (
          <div className="p-4 border-t border-slate-100 flex gap-2">
            <button onClick={copy} className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 flex items-center justify-center gap-1.5">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy list'}
            </button>
            {navigator.share && (
              <button onClick={share} className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 flex items-center justify-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> Share</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
