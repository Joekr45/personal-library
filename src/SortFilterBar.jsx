import React, { useMemo, useState } from 'react';
import { ArrowUpDown, SlidersHorizontal, X } from 'lucide-react';

export const SORTS = [
  ['title', 'Title (A–Z)'],
  ['author', 'Author (A–Z)'],
  ['added', 'Recently added'],
  ['finished', 'Recently finished'],
  ['rating', 'My rating'],
  ['published', 'Year published']
];

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const titleKey = (t) => String(t || '').trim().replace(/^(the|a|an)\s+/i, '');
const surname = (a) => String(a || '').split(',')[0].trim().split(/\s+/).pop();
const pubYear = (b) => Number((String(b.editions?.[0]?.published || '').match(/\d{4}/) || [0])[0]);
const byTitle = (a, b) => collator.compare(titleKey(a.workTitle), titleKey(b.workTitle));
// Books without the value (no rating, no date…) go to the end.
const desc = (get) => (a, b) => {
  const x = get(a); const y = get(b);
  if (!x && !y) return byTitle(a, b);
  if (!x) return 1;
  if (!y) return -1;
  return x < y ? 1 : x > y ? -1 : byTitle(a, b);
};

export const SORTERS = {
  title: (a, b) => byTitle(a, b) || collator.compare(a.author || '', b.author || ''),
  author: (a, b) => collator.compare(surname(a.author), surname(b.author)) || collator.compare(a.author || '', b.author || '') ||
    (Number(a.seriesNumber) || 0) - (Number(b.seriesNumber) || 0) || byTitle(a, b),
  added: desc(b => b.addedAt || ''),
  finished: desc(b => b.dateFinished || ''),
  rating: desc(b => b.rating || 0),
  published: desc(pubYear)
};

export const EMPTY_FILTERS = { shelf: '', language: '', format: '', rating: '' };

export function applyFilters(books, filters) {
  return books.filter(b => {
    const e = b.editions?.[0] || {};
    if (filters.shelf && (b.shelfLocation || '') !== filters.shelf) return false;
    if (filters.language && (e.language || 'English') !== filters.language) return false;
    if (filters.format && (e.format || '') !== filters.format) return false;
    if (filters.rating === 'unrated' && b.rating) return false;
    if (filters.rating && filters.rating !== 'unrated' && !(Number(b.rating) >= Number(filters.rating))) return false;
    return true;
  });
}

// Sort menu and filters above the book list.
export default function SortFilterBar({ books, sortBy, onSortChange, filters, onFiltersChange }) {
  const [open, setOpen] = useState(Object.values(filters).some(Boolean));
  const options = useMemo(() => {
    const uniq = (get) => [...new Set(books.map(get).filter(Boolean))].sort((a, b) => collator.compare(a, b));
    return {
      shelf: uniq(b => b.shelfLocation),
      language: uniq(b => b.editions?.[0]?.language || 'English'),
      format: uniq(b => b.editions?.[0]?.format)
    };
  }, [books]);
  const active = Object.values(filters).filter(Boolean).length;
  const select = 'px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white min-w-0';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <select aria-label="Sort by" value={sortBy} onChange={(e) => onSortChange(e.target.value)} className={select}>
            {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <button onClick={() => setOpen(v => !v)} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${active ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-200 text-slate-600'}`}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> Filters{active ? ` (${active})` : ''}
        </button>
        {active > 0 && (
          <button onClick={() => onFiltersChange(EMPTY_FILTERS)} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Clear</button>
        )}
      </div>
      {open && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-white border border-slate-200 rounded-2xl">
          {[['shelf', 'Shelf'], ['language', 'Language'], ['format', 'Format']].map(([key, label]) => (
            <label key={key} className="flex flex-col gap-0.5 text-[10px] uppercase font-semibold text-slate-400">
              {label}
              <select value={filters[key]} onChange={(e) => onFiltersChange({ ...filters, [key]: e.target.value })} className={select}>
                <option value="">Any</option>
                {options[key].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-0.5 text-[10px] uppercase font-semibold text-slate-400">
            My rating
            <select value={filters.rating} onChange={(e) => onFiltersChange({ ...filters, rating: e.target.value })} className={select}>
              <option value="">Any</option>
              <option value="5">★★★★★ only</option>
              <option value="4">★★★★ and up</option>
              <option value="3">★★★ and up</option>
              <option value="unrated">Not rated yet</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
