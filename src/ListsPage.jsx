import React, { useEffect, useState } from 'react';
import { ListOrdered, Plus, ArrowLeft, Trash2, Heart, Globe, Lock, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { api } from './api.js';
import { Cover } from './AuthorPage.jsx';
import { Avatar } from './ActivityPage.jsx';

// One list: its books (with notes), in order. The maker can rename, reorder, remove and share it.
function ListView({ list: initial, onBack, onChanged, onAddToWishlist, have }) {
  const [list, setList] = useState(initial);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(new Set());
  const save = async (changes) => {
    setError('');
    try { const saved = await api.updateList(list.id, changes); setList(saved); onChanged(saved); } catch (err) { setError(err.message); }
  };
  const move = (i, d) => {
    const items = [...list.items];
    [items[i], items[i + d]] = [items[i + d], items[i]];
    save({ items });
  };
  const owned = (it) => have.has(`${it.title}`.toLowerCase());

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={onBack} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> All lists</button>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{list.name}</h2>
          {list.description && <p className="text-xs text-slate-600">{list.description}</p>}
          <p className="text-[11px] text-slate-400">{list.mine ? (list.isPublic ? 'Shared with family & friends' : 'Only you can see this list') : `By ${list.owner?.displayName}`} · {list.items.length} book{list.items.length === 1 ? '' : 's'}</p>
        </div>
        {list.mine && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={() => save({ isPublic: !list.isPublic })} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center gap-1">
              {list.isPublic ? <><Lock className="w-3.5 h-3.5" /> Make private</> : <><Globe className="w-3.5 h-3.5" /> Share</>}
            </button>
            <button onClick={() => { const n = prompt('List name:', list.name); if (n?.trim()) save({ name: n.trim(), description: prompt('Description (optional):', list.description || '') ?? list.description }); }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600">Rename</button>
            <button onClick={async () => { if (confirm(`Delete the list "${list.name}"?`)) { await api.deleteList(list.id); onBack(); } }} aria-label="Delete list"
              className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {list.items.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">No books yet. Open any book and use <b>Add to a list</b>.</p>
      ) : (
        <ol className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {list.items.map((it, i) => (
            <li key={`${it.title}-${i}`} className="p-3 flex gap-3 items-center">
              <span className="w-5 text-xs font-bold text-slate-400 text-right">{i + 1}</span>
              <div className="w-10 flex-shrink-0"><Cover url={it.cover} title={it.title} author={it.author} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{it.title}</p>
                <p className="text-[11px] text-slate-500 truncate">{it.author}</p>
                {list.mine ? (
                  <input defaultValue={it.note || ''} placeholder="Add a note…" aria-label={`Note for ${it.title}`} maxLength={500}
                    onBlur={(e) => e.target.value !== (it.note || '') && save({ items: list.items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })}
                    className="mt-1 w-full px-2 py-1 border border-transparent hover:border-slate-200 focus:border-slate-200 rounded text-[11px] text-slate-600 bg-transparent" />
                ) : it.note && <p className="text-[11px] text-slate-600 italic">{it.note}</p>}
              </div>
              {list.mine ? (
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-slate-400 disabled:opacity-20"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === list.items.length - 1} aria-label="Move down" className="text-slate-400 disabled:opacity-20"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => save({ items: list.items.filter((_, j) => j !== i) })} aria-label={`Remove ${it.title}`} className="text-slate-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ) : owned(it) || added.has(i) ? (
                <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5"><Check className="w-3 h-3" /> {added.has(i) ? 'Added' : 'You have it'}</span>
              ) : (
                <button onClick={async () => { if (await onAddToWishlist(it)) setAdded(prev => new Set(prev).add(i)); }} className="px-2 py-1 rounded-lg bg-rose-500 text-white text-[10px] font-semibold flex items-center gap-0.5"><Heart className="w-3 h-3" /> Want</button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// "Lists": your own book lists, and lists others chose to share.
export default function ListsPage({ myBooks, onAddToWishlist }) {
  const [lists, setLists] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.lists().then(setLists).catch(err => setError(err.message));
  useEffect(() => { load(); }, []);
  const have = new Set(myBooks.map(b => String(b.workTitle).toLowerCase()));

  if (open) return <ListView list={open} have={have} onAddToWishlist={onAddToWishlist} onChanged={(l) => setLists(prev => prev.map(x => (x.id === l.id ? l : x)))} onBack={() => { setOpen(null); load(); }} />;

  const create = async () => {
    const name = prompt('Name for the new list (e.g. "Best beach reads"):');
    if (!name?.trim()) return;
    try { const list = await api.createList({ name: name.trim(), isPublic: false, items: [] }); setOpen(list); } catch (err) { setError(err.message); }
  };
  const mine = (lists || []).filter(l => l.mine);
  const others = (lists || []).filter(l => !l.mine);
  const row = (l) => (
    <button key={l.id} onClick={() => setOpen(l)} className="w-full p-3 bg-white border border-slate-200 rounded-2xl flex gap-3 items-center text-left hover:bg-slate-50">
      <div className="flex -space-x-4">{l.items.slice(0, 3).map((it, i) => <div key={i} className="w-9"><Cover url={it.cover} title={it.title} author={it.author} /></div>)}{l.items.length === 0 && <div className="w-9 h-12 rounded-lg bg-slate-100" />}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{l.name}</p>
        <p className="text-[11px] text-slate-500">{l.items.length} book{l.items.length === 1 ? '' : 's'}{l.mine ? (l.isPublic ? ' · shared' : ' · private') : ''}</p>
      </div>
      {!l.mine && <Avatar user={l.owner} size="w-7 h-7" />}
    </button>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><ListOrdered className="w-5 h-5 text-orange-500" /> Lists</h2>
        <button onClick={create} className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"><Plus className="w-4 h-4" /> New list</button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {lists === null ? <p className="text-xs text-slate-400">Loading…</p> : (
        <>
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">My lists</h3>
            {mine.length ? mine.map(row) : <p className="text-xs text-slate-500">Make ranked lists with notes, like “Books to read before the movie”. Keep them private or share them.</p>}
          </section>
          {others.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Shared by family &amp; friends</h3>
              {others.map(row)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
