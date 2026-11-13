import React, { useEffect, useState } from 'react';
import { MessagesSquare, Plus, ArrowLeft, Trash2, LogIn, LogOut, EyeOff, Send } from 'lucide-react';
import { api } from './api.js';
import { Cover } from './AuthorPage.jsx';
import { Avatar } from './ActivityPage.jsx';
import { bookRef } from './SharePanel.jsx';

const progressText = (m) => {
  if (!m.status) return "doesn't have the book yet";
  if (m.status === 'Completed') return 'finished ✓';
  if (m.status === 'DNF') return "didn't finish";
  if (m.status === 'Reading') return m.page ? `page ${m.page}${m.pages ? ` of ${m.pages}` : ''}` : 'reading';
  return 'not started';
};
const pct = (m) => (m.status === 'Completed' ? 100 : m.page && m.pages ? Math.min(100, Math.round((100 * m.page) / m.pages)) : 0);

// One club: everyone's progress and the discussion. Posts about pages you haven't reached are hidden.
function ClubView({ id, onBack, myBooks }) {
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const [revealed, setRevealed] = useState(new Set());
  const [error, setError] = useState('');
  const run = async (fn) => { setError(''); try { const r = await fn(); if (r?.club && r.posts) setData(r); else setData(await api.club(id)); } catch (err) { setError(err.message); } };
  useEffect(() => { run(() => api.club(id)); }, [id]);
  // Pick up new posts while the club is open.
  useEffect(() => { const t = setInterval(() => api.club(id).then(setData).catch(() => {}), 30000); return () => clearInterval(t); }, [id]);
  if (!data) return <p className="text-xs text-slate-400">{error || 'Loading…'}</p>;
  const { club, posts } = data;
  const me = club.members.find(m => m.isMe);
  const myPage = me?.status === 'Completed' ? Infinity : me?.page || 0;

  const post = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await run(() => api.postToClub(id, text.trim(), page ? Number(page) : null));
    setText('');
  };
  const own = myBooks.some(b => b.workTitle?.toLowerCase() === club.book.title?.toLowerCase());

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={onBack} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> All clubs</button>
      <div className="flex gap-4 items-start">
        <div className="w-20 flex-shrink-0"><Cover url={club.book.cover} title={club.book.title} author={club.book.author} /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">{club.name}</h2>
          <p className="text-xs text-slate-600">Reading <b>{club.book.title}</b> by {club.book.author}</p>
          {club.createdBy && <p className="text-[11px] text-slate-400">Started by {club.createdBy}</p>}
          <div className="mt-2 flex gap-2 flex-wrap">
            {club.joined
              ? <button onClick={() => run(() => api.leaveClub(id))} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold flex items-center gap-1"><LogOut className="w-3.5 h-3.5" /> Leave</button>
              : <button onClick={() => run(() => api.joinClub(id))} className="px-2.5 py-1.5 rounded-lg bg-orange-500 text-white text-[11px] font-semibold flex items-center gap-1"><LogIn className="w-3.5 h-3.5" /> Join</button>}
            {club.canDelete && <button onClick={async () => { if (confirm(`Delete "${club.name}" for everyone?`)) { await api.deleteClub(id); onBack(); } }} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 text-[11px] font-semibold flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
          </div>
          {club.joined && !own && <p className="mt-2 text-[11px] text-amber-700">Add this book to your library (and mark it Reading) so your progress shows here.</p>}
        </div>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}

      <section className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
        <h3 className="text-xs font-bold text-slate-800">Where everyone is</h3>
        {club.members.map(m => (
          <div key={m.id} className="flex items-center gap-2.5">
            <Avatar user={m} size="w-7 h-7" />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-[11px]"><span className={`font-semibold ${m.isMe ? 'text-orange-600' : 'text-slate-700'}`}>{m.displayName}{m.isMe ? ' (you)' : ''}</span><span className="text-slate-500">{progressText(m)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${pct(m)}%` }} /></div>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-slate-800">Discussion</h3>
        {posts.length === 0 && <p className="text-xs text-slate-500">No posts yet. Start the conversation!</p>}
        {posts.map(p => {
          const spoiler = p.page && p.page > myPage && !p.mine && !revealed.has(p.id);
          return (
            <div key={p.id} className="p-3 bg-white border border-slate-200 rounded-2xl flex gap-2.5">
              <Avatar user={p.user} size="w-7 h-7" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-500"><b className="text-slate-800">{p.user?.displayName || 'Someone'}</b>{p.page ? ` · at page ${p.page}` : ''} · {new Date(p.at).toLocaleDateString()}</p>
                {spoiler ? (
                  <button onClick={() => setRevealed(prev => new Set(prev).add(p.id))} className="mt-1 text-xs text-slate-500 flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1.5">
                    <EyeOff className="w-3.5 h-3.5" /> Spoiler — about page {p.page} (you're on {myPage || 'page 0'}). Tap to show.
                  </button>
                ) : <p className="mt-0.5 text-xs text-slate-700 whitespace-pre-line">{p.text}</p>}
              </div>
              {p.canDelete && <button onClick={() => confirm('Delete this post?') && run(() => api.deleteClubPost(id, p.id))} aria-label="Delete post" className="text-slate-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          );
        })}
        {club.joined && (
          <form onSubmit={post} className="p-3 bg-white border border-slate-200 rounded-2xl space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} placeholder="Share a thought…" aria-label="Club post"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-orange-500" />
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500 flex items-center gap-1.5">About page
                <input type="number" min="1" value={page} onChange={(e) => setPage(e.target.value)} placeholder={me?.page ? String(me.page) : '—'} aria-label="About page"
                  className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white" />
              </label>
              <span className="text-[10px] text-slate-400">hides it from people who aren't there yet</span>
              <button type="submit" disabled={!text.trim()} className="ml-auto px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Post</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

// "Book Clubs": buddy reads with everyone's progress and a spoiler-safe discussion.
export default function ClubsPage({ myBooks }) {
  const [clubs, setClubs] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [bookId, setBookId] = useState('');
  const [error, setError] = useState('');
  const load = () => api.clubs().then(setClubs).catch(err => setError(err.message));
  useEffect(() => { if (!openId) load(); }, [openId]);

  if (openId) return <ClubView id={openId} myBooks={myBooks} onBack={() => setOpenId(null)} />;

  const sorted = [...myBooks].sort((a, b) => (a.readingStatus === 'Reading' ? -1 : 0) - (b.readingStatus === 'Reading' ? -1 : 0) || a.workTitle.localeCompare(b.workTitle));
  const create = async (e) => {
    e.preventDefault();
    setError('');
    const book = myBooks.find(b => b.id === bookId);
    try {
      const club = await api.createClub(name.trim() || `${book.workTitle} buddy read`, bookRef(book));
      setCreating(false); setName(''); setBookId('');
      setOpenId(club.id);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><MessagesSquare className="w-5 h-5 text-orange-500" /> Book Clubs</h2>
        {!creating && <button onClick={() => setCreating(true)} className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"><Plus className="w-4 h-4" /> Start a club</button>}
      </div>
      <p className="text-xs text-slate-500">Read a book together with family or friends: see where everyone is and talk about it, without spoilers.</p>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
      {creating && (
        <form onSubmit={create} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <select value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="Club book" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white">
            <option value="">Which book? (from your library or wishlist)</option>
            {sorted.map(b => <option key={b.id} value={b.id}>{b.workTitle} — {b.author}{b.readingStatus === 'Reading' ? ' (reading)' : ''}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Club name (optional)" aria-label="Club name" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 text-xs font-semibold text-slate-500">Cancel</button>
            <button type="submit" disabled={!bookId} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl text-xs font-semibold">Start club</button>
          </div>
        </form>
      )}
      {clubs === null ? <p className="text-xs text-slate-400">Loading…</p> : clubs.length === 0 && !creating ? (
        <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">No clubs yet. Start one with a book you want to read together.</p>
      ) : (
        <div className="space-y-2">
          {clubs.map(c => (
            <button key={c.id} onClick={() => setOpenId(c.id)} className="w-full p-3 bg-white border border-slate-200 rounded-2xl flex gap-3 items-center text-left hover:bg-slate-50">
              <div className="w-12 flex-shrink-0"><Cover url={c.book.cover} title={c.book.title} author={c.book.author} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{c.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{c.book.title} · {c.book.author}</p>
                <p className="text-[11px] text-slate-400">{c.members.length} member{c.members.length === 1 ? '' : 's'} · {c.postCount} post{c.postCount === 1 ? '' : 's'}{c.joined ? ' · you\'re in' : ''}</p>
              </div>
              <div className="flex -space-x-2">{c.members.slice(0, 4).map(m => <Avatar key={m.id} user={m} size="w-7 h-7" />)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
