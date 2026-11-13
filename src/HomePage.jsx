import React, { useEffect, useState } from 'react';
import { BookOpen, Flame, Inbox, BellRing, Sparkles, Library, Activity, Plus, Target, ChevronRight, Dices, HandHeart } from 'lucide-react';
import { api } from './api.js';
import { progressOf, progressLabel } from './shelves.js';
import { finishesInYear } from './YearInReview.jsx';
import { wishlistNews } from './WishlistAlerts.jsx';
import { Avatar } from './ActivityPage.jsx';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

// Home: what you're reading, today's reading time, and anything that needs you, at a glance.
export default function HomePage({ books, currentUser, overdue, inboxCount, newCount, onOpenBook, onGo, onScan, onPickNext, borrowWaiting = 0, BookCover }) {
  const [log, setLog] = useState(null);
  const [goal, setGoal] = useState(null);
  const [feed, setFeed] = useState(null);
  const [wishCheck, setWishCheck] = useState(null);
  const year = new Date().getFullYear();
  useEffect(() => {
    api.readingLog().then(setLog).catch(() => {});
    api.getGoal(year).then(g => setGoal(g?.goal || null)).catch(() => {});
    api.feed().then(f => setFeed(f.items.filter(i => !i.isMe).slice(0, 5))).catch(() => setFeed([]));
    api.wishlistCheck().then(setWishCheck).catch(() => {});
  }, []);

  const reading = books.filter(b => b.readingStatus === 'Reading' && b.owned !== false);
  const finishedThisYear = finishesInYear(books, year).length;
  const todayMin = log ? (log.days.find(d => d.day === log.today)?.minutes || 0) : 0;
  const available = books.filter(b => b.owned === false && wishlistNews(b, wishCheck?.results?.[b.id])?.alert);
  const addMinutes = async (m) => { try { setLog(await api.logMinutes(m)); } catch { /* try again */ } };

  const alertTiles = [
    borrowWaiting > 0 && { key: 'borrow', icon: HandHeart, color: 'bg-rose-50 border-rose-200 text-rose-700', text: `${borrowWaiting} ${borrowWaiting === 1 ? 'person wants' : 'people want'} to borrow a book`, go: 'borrow' },
    inboxCount > 0 && { key: 'inbox', icon: Inbox, color: 'bg-rose-50 border-rose-200 text-rose-700', text: `${inboxCount} book${inboxCount === 1 ? '' : 's'} recommended to you`, go: 'activity' },
    overdue.length > 0 && { key: 'overdue', icon: BellRing, color: 'bg-red-50 border-red-200 text-red-700', text: `${overdue.length} lent book${overdue.length === 1 ? ' is' : 's are'} overdue`, go: 'lent' },
    available.length > 0 && { key: 'wish', icon: Library, color: 'bg-emerald-50 border-emerald-200 text-emerald-700', text: `${available.length} wishlist book${available.length === 1 ? '' : 's'} available or on sale`, go: 'wishlist' },
    newCount > 0 && { key: 'new', icon: Sparkles, color: 'bg-amber-50 border-amber-200 text-amber-800', text: `${newCount} new book${newCount === 1 ? '' : 's'} from your authors`, go: 'new' }
  ].filter(Boolean);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{greeting()}, {currentUser.displayName}!</h2>
        <button onClick={onScan} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add a book</button>
      </div>

      {alertTiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {alertTiles.map(t => (
            <button key={t.key} onClick={() => onGo(t.go)} className={`p-3 border rounded-2xl text-xs font-semibold flex items-center gap-2 text-left ${t.color}`}>
              <t.icon className="w-4 h-4 flex-shrink-0" /> <span className="flex-1">{t.text}</span> <ChevronRight className="w-4 h-4" />
            </button>
          ))}
        </div>
      )}

      <section className="space-y-2" aria-label="Currently reading">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><BookOpen className="w-4 h-4 text-orange-500" /> Currently reading</h3>
          <div className="flex items-center gap-3">
            {books.some(b => b.owned !== false && b.readingStatus === 'Unread') && <button onClick={onPickNext} className="text-[11px] font-semibold text-orange-600 flex items-center gap-1"><Dices className="w-3.5 h-3.5" /> Pick my next read</button>}
            {reading.length > 0 && <button onClick={() => onGo('reading')} className="text-[11px] font-semibold text-slate-500">See all</button>}
          </div>
        </div>
        {reading.length === 0 ? (
          <p className="p-4 bg-white border border-slate-200 rounded-2xl text-xs text-slate-500">
            Nothing on the go. Pick something from <button onClick={() => onGo('unread')} className="font-semibold text-orange-600">Want to Read</button> and tap <b>Reading</b>.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {reading.slice(0, 4).map(b => {
              const p = progressOf(b);
              return (
                <button key={b.id} onClick={() => onOpenBook(b)} className="p-3 bg-white border border-slate-200 rounded-2xl flex gap-3 text-left hover:bg-slate-50">
                  <div className="w-14 flex-shrink-0">{BookCover(b)}</div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className="text-sm font-bold text-slate-900 line-clamp-2">{b.workTitle}</p>
                    <p className="text-[11px] text-slate-500 truncate">{b.author}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-orange-100 overflow-hidden"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${p?.pct || 0}%` }} /></div>
                      <span className="text-[11px] font-semibold text-orange-600">{p ? (p.pct !== null ? `${p.pct}%` : progressLabel(p)) : 'Start'}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section className="p-4 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white space-y-2" aria-label="Today's reading">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-white/80">Read today</p>
              <p className="text-2xl font-black">{todayMin}<span className="text-sm font-bold text-white/80"> / {log?.goal || 20} min</span></p>
            </div>
            <p className="text-xl font-black flex items-center gap-1"><Flame className="w-5 h-5" />{log?.streak?.current || 0}</p>
          </div>
          <div className="flex gap-2">
            {[10, 20, 30].map(m => <button key={m} onClick={() => addMinutes(m)} aria-label={`Add ${m} minutes`} className="flex-1 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-sm font-bold">+{m}</button>)}
            <button onClick={() => onGo('readinglog')} className="px-2 rounded-xl bg-white/10 text-[11px] font-semibold">Log</button>
          </div>
        </section>
        <button onClick={() => onGo('year')} className="p-4 rounded-3xl bg-gradient-to-br from-orange-500 to-amber-500 text-white text-left space-y-2" aria-label="Yearly goal">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-white/80 flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {year} goal</p>
          <p className="text-2xl font-black">{finishedThisYear}<span className="text-sm font-bold text-white/80">{goal ? ` / ${goal} books` : ' books finished'}</span></p>
          {goal ? (
            <div className="h-2 rounded-full bg-white/25 overflow-hidden"><div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, (100 * finishedThisYear) / goal)}%` }} /></div>
          ) : <p className="text-[11px] text-white/90">Tap to set a goal on My Year</p>}
        </button>
      </div>

      {feed && feed.length > 0 && (
        <section className="space-y-2" aria-label="Recent activity">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Activity className="w-4 h-4 text-orange-500" /> Recently from family &amp; friends</h3>
            <button onClick={() => onGo('activity')} className="text-[11px] font-semibold text-slate-500">See all</button>
          </div>
          <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {feed.map(i => (
              <li key={i.id} className="p-2.5 flex items-center gap-2.5 text-xs text-slate-600">
                <Avatar user={i.user} size="w-7 h-7" />
                <span className="min-w-0 truncate"><b className="text-slate-900">{i.user.displayName}</b> {{ added: 'added', wishlisted: 'wants to read', started: 'started', finished: 'finished', dnf: "didn't finish", rated: 'rated', reviewed: 'reviewed', update: 'is reading' }[i.type] || i.type} <b className="text-slate-900">{i.book.title}</b></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
