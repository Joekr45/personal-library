import React, { useMemo, useState } from 'react';
import { MapPin, ChevronDown, ChevronRight, Pencil, Search, Home as HomeIcon, Archive } from 'lucide-react';
import { placeTree, placeParts, placeText, renamePlace } from './places.js';

// "Where is it?": your rooms, bookcases and shelves, with the books on each. Search a title to
// see exactly where it lives.
export default function ShelfMapPage({ books, onOpenBook, onUpdateMany, renderCover }) {
  const owned = books.filter(b => b.owned !== false);
  const { rooms, unplaced } = useMemo(() => placeTree(owned), [books]);
  const [open, setOpen] = useState(() => new Set());
  const [q, setQ] = useState('');
  const toggle = (key) => setOpen(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const found = q.trim().length >= 2
    ? owned.filter(b => `${b.workTitle} ${b.author}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

  const rename = async (node) => {
    const name = prompt(`New name for "${node.name}":`, node.name)?.trim();
    if (!name || name === node.name) return;
    const newPath = [...node.path.slice(0, -1), name];
    const changes = owned
      .map(b => ({ book: b, location: renamePlace(b.shelfLocation, node.path, newPath) }))
      .filter(x => x.location !== x.book.shelfLocation);
    await onUpdateMany(changes);
  };

  const Node = ({ node, depth }) => {
    const key = placeText(node.path);
    const isOpen = open.has(key);
    const Icon = depth === 0 ? HomeIcon : Archive;
    return (
      <li>
        <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: depth * 16 }}>
          <button onClick={() => toggle(key)} aria-expanded={isOpen} className="flex items-center gap-1.5 text-left flex-1 min-w-0">
            {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            <Icon className={`w-4 h-4 ${depth === 0 ? 'text-orange-500' : 'text-slate-400'}`} />
            <span className={`truncate ${depth === 0 ? 'text-sm font-bold text-slate-900' : 'text-xs font-semibold text-slate-700'}`}>{node.name}</span>
            <span className="text-[11px] text-slate-400">{node.count}</span>
          </button>
          <button onClick={() => rename(node)} aria-label={`Rename ${node.name}`} className="p-1 text-slate-300 hover:text-orange-600"><Pencil className="w-3.5 h-3.5" /></button>
        </div>
        {isOpen && (
          <>
            {node.books.length > 0 && (
              <div className="flex gap-2 flex-wrap py-2" style={{ paddingLeft: depth * 16 + 24 }}>
                {node.books.map(b => (
                  <button key={b.id} onClick={() => onOpenBook(b)} title={`${b.workTitle} — ${b.author}`} className="w-12">{renderCover(b)}</button>
                ))}
              </div>
            )}
            {node.children.length > 0 && <ul>{node.children.map(c => <Node key={placeText(c.path)} node={c} depth={depth + 1} />)}</ul>}
          </>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-orange-500" /> Where is it?</h2>
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which book are you looking for?" aria-label="Find a book's location"
          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500" />
      </div>
      {found.length > 0 && (
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {found.map(b => (
            <li key={b.id} className="p-2.5 flex items-center gap-3">
              <button onClick={() => onOpenBook(b)} className="w-9 flex-shrink-0">{renderCover(b)}</button>
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-bold text-slate-900 truncate">{b.workTitle}</p>
                <p className="text-orange-700 font-semibold flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />
                  {placeParts(b.shelfLocation).join(' › ') || 'No location yet'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">
        Give books a location with levels separated by “/”, like <b>Living room / Tall bookcase / Shelf 3</b> (on a book: Edit → Shelf location;
        for many at once: All Books → <b>Select</b> → Location). Tap the pencil to rename a room or bookcase everywhere.
      </p>
      {rooms.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">No locations yet.</p>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-2xl p-3">{rooms.map(r => <Node key={r.name} node={r} depth={0} />)}</ul>
      )}
      {unplaced.length > 0 && (
        <details className="bg-white border border-slate-200 rounded-2xl p-3">
          <summary className="text-xs font-semibold text-slate-600 cursor-pointer">Books without a location ({unplaced.length})</summary>
          <div className="flex gap-2 flex-wrap pt-2">
            {unplaced.map(b => <button key={b.id} onClick={() => onOpenBook(b)} title={b.workTitle} className="w-12">{renderCover(b)}</button>)}
          </div>
        </details>
      )}
    </div>
  );
}
