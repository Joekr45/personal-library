import React, { useEffect, useState } from 'react';
import { Activity, Inbox, Heart, X, RefreshCw, Send } from 'lucide-react';
import { api } from './api.js';
import StarRating from './StarRating.jsx';
import { Cover } from './AuthorPage.jsx';

const ago = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const WHAT = {
  added: 'added to their shelves',
  wishlisted: 'wants to read',
  started: 'started reading',
  finished: 'finished',
  dnf: "didn't finish",
  rated: 'rated',
  reviewed: 'reviewed',
  update: 'is reading'
};

export const Avatar = ({ user, size = 'w-8 h-8' }) => (
  <span className={`${size} rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br ${user?.color || 'from-orange-500 to-amber-500'}`}>
    {(user?.displayName || '?').charAt(0).toUpperCase()}
  </span>
);

// "Activity": what family and friends are reading, and books recommended to you.
export default function ActivityPage({ onAddToWishlist, onOpenSettings, onInboxChange }) {
  const [feed, setFeed] = useState(null);
  const [recs, setRecs] = useState(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    api.feed().then(setFeed).catch(err => setError(err.message));
    api.recommendations().then(r => { setRecs(r); onInboxChange?.(r.inbox.length); }).catch(() => setRecs({ inbox: [], sent: [] }));
  };
  useEffect(load, []);

  const answer = async (rec, status) => {
    if (status === 'added') {
      const saved = await onAddToWishlist(rec.book);
      if (!saved) return;
    }
    const r = await api.answerRecommendation(rec.id, status);
    setRecs(r);
    onInboxChange?.(r.inbox.length);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Activity className="w-5 h-5 text-orange-500" /> Activity</h2>
        <button onClick={load} aria-label="Refresh" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

      {recs?.inbox?.length > 0 && (
        <section className="p-4 bg-orange-50 border border-orange-200 rounded-2xl space-y-3" aria-label="Recommended for you">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Inbox className="w-4 h-4 text-orange-500" /> Recommended for you</h3>
          {recs.inbox.map(r => (
            <div key={r.id} className="flex gap-3 items-start">
              <div className="w-12 flex-shrink-0"><Cover url={r.book.cover} title={r.book.title} author={r.book.author} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-600"><b className="text-slate-900">{r.from?.displayName || 'Someone'}</b> thinks you'd like</p>
                <p className="text-sm font-bold text-slate-900">{r.book.title}</p>
                <p className="text-[11px] text-slate-500">{r.book.author}</p>
                {r.note && <p className="mt-1 text-xs text-slate-700 italic">“{r.note}”</p>}
                <div className="mt-2 flex gap-2">
                  <button onClick={() => answer(r, 'added')} className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> Add to wishlist</button>
                  <button onClick={() => answer(r, 'dismissed')} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold flex items-center gap-1"><X className="w-3.5 h-3.5" /> No thanks</button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {feed && !feed.activityOn && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
          Your own activity is hidden from others. <button onClick={onOpenSettings} className="font-semibold text-orange-600">Change in Settings</button>
        </p>
      )}

      {feed === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : feed.items.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
          Nothing yet. When anyone starts, finishes, rates or reviews a book, it shows up here.
        </p>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {feed.items.map(item => (
            <li key={item.id} className="p-3 flex gap-3">
              <Avatar user={item.user} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-600">
                  <b className="text-slate-900">{item.isMe ? 'You' : item.user.displayName}</b> {WHAT[item.type] || item.type}{' '}
                  <b className="text-slate-900">{item.book.title}</b> <span className="text-slate-400">by {item.book.author}</span>
                  {item.type === 'update' && item.detail?.page ? <span> — page {item.detail.page}{item.detail.pages ? ` of ${item.detail.pages}` : ''}</span> : null}
                </p>
                {(item.type === 'finished' || item.type === 'rated' || item.type === 'reviewed') && item.detail?.rating ? <div className="mt-0.5"><StarRating value={item.detail.rating} size="sm" /></div> : null}
                {item.detail?.text && <p className="mt-1 text-xs text-slate-700 bg-slate-50 rounded-lg p-2 whitespace-pre-line">{item.detail.text}</p>}
                <p className="mt-0.5 text-[10px] text-slate-400">{ago(item.at)}</p>
              </div>
              <div className="w-10 flex-shrink-0"><Cover url={item.book.cover} title={item.book.title} author={item.book.author} /></div>
            </li>
          ))}
        </ul>
      )}

      {recs?.sent?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Send className="w-4 h-4 text-orange-500" /> Books you recommended</h3>
          <ul className="text-xs text-slate-600 space-y-1">
            {recs.sent.slice(0, 10).map(r => (
              <li key={r.id}>• <b>{r.book.title}</b> to {r.to?.displayName || '?'} — {r.status === 'added' ? 'added to their wishlist 🎉' : r.status === 'dismissed' ? 'not for them' : 'not answered yet'}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
