import React, { useEffect, useState } from 'react';
import { Send, ListPlus, Check } from 'lucide-react';
import { api } from './api.js';
import { toIsbn13 } from '../shared/isbn.js';

// A shareable description of a book (for recommendations, lists and clubs).
export const bookRef = (book) => {
  const isbn = (book.editions || []).map(e => toIsbn13(e.isbn)).find(Boolean) || null;
  const cover = /^https:\/\//.test(book.customCoverUrl || '') ? book.customCoverUrl : isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : null;
  return { title: book.workTitle, author: book.author, isbn, cover, workKey: book.workKey || null };
};

// "Recommend to someone" and "Add to a list" on a book's page.
export default function SharePanel({ book }) {
  const [people, setPeople] = useState(null);
  const [lists, setLists] = useState(null);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [listId, setListId] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    api.people().then(setPeople).catch(() => setPeople([]));
    api.lists().then(l => setLists(l.filter(x => x.mine))).catch(() => setLists([]));
  }, []);
  const flash = (text) => { setMessage(text); setTimeout(() => setMessage(''), 2500); };

  const recommend = async (e) => {
    e.preventDefault();
    try {
      await api.recommend(to, bookRef(book), note.trim());
      flash(`Sent to ${people.find(p => p.id === to)?.displayName}!`);
      setTo(''); setNote('');
    } catch (err) { flash(err.message); }
  };
  const addToList = async (e) => {
    e.preventDefault();
    try {
      let list = lists.find(l => l.id === listId);
      if (listId === 'new') {
        const name = prompt('Name for the new list:', '');
        if (!name?.trim()) return;
        list = await api.createList({ name: name.trim(), isPublic: false, items: [] });
        setLists(prev => [list, ...prev]);
      }
      const ref = bookRef(book);
      if (list.items.some(i => i.title === ref.title && i.author === ref.author)) { flash(`Already on “${list.name}”.`); return; }
      const saved = await api.updateList(list.id, { items: [...list.items, ref] });
      setLists(prev => prev.map(l => (l.id === saved.id ? saved : l)));
      flash(`Added to “${saved.name}”.`);
      setListId('');
    } catch (err) { flash(err.message); }
  };
  const select = 'flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white';

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
      {people && people.length > 0 && (
        <form onSubmit={recommend} className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Send className="w-4 h-4 text-orange-500" /> Recommend to someone</p>
          <div className="flex gap-2">
            <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Recommend to" className={select}>
              <option value="">Choose a person…</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.displayName}{p.circle === 'friend' ? ' (friend)' : ''}</option>)}
            </select>
            <button type="submit" disabled={!to} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg text-xs font-semibold">Send</button>
          </div>
          {to && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional): why they'll love it" aria-label="Recommendation note" maxLength={1000} className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" />}
        </form>
      )}
      {lists && (
        <form onSubmit={addToList} className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><ListPlus className="w-4 h-4 text-orange-500" /> Add to a list</p>
          <div className="flex gap-2">
            <select value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Add to list" className={select}>
              <option value="">Choose a list…</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              <option value="new">+ New list…</option>
            </select>
            <button type="submit" disabled={!listId} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg text-xs font-semibold">Add</button>
          </div>
        </form>
      )}
      {message && <p className="text-[11px] text-emerald-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {message}</p>}
    </div>
  );
}
