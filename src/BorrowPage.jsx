import React, { useEffect, useMemo, useState } from 'react';
import { HandHeart, ArrowLeft, Search, RefreshCw, Check, X, Undo2, Inbox, Send, Settings } from 'lucide-react';
import { api } from './api.js';
import { Cover } from './AuthorPage.jsx';
import { formatDate } from './reading.js';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const titleKey = (t) => String(t || '').trim().replace(/^(the|a|an)\s+/i, '');
const STATUS = {
  pending: ['Waiting', 'bg-amber-100 text-amber-800'],
  lent: ['Borrowed', 'bg-emerald-100 text-emerald-800'],
  returned: ['Returned', 'bg-slate-100 text-slate-600'],
  declined: ['Not this time', 'bg-rose-100 text-rose-700'],
  cancelled: ['Cancelled', 'bg-slate-100 text-slate-500']
};
const Badge = ({ status }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap flex-shrink-0 ${STATUS[status]?.[1] || ''}`}>{STATUS[status]?.[0] || status}</span>;
const Avatar = ({ p, size = 'w-10 h-10' }) => (
  <div className={`${size} rounded-full bg-gradient-to-br ${p?.color || 'from-slate-400 to-slate-500'} text-white font-bold flex items-center justify-center flex-shrink-0`}>{(p?.displayName || '?').charAt(0).toUpperCase()}</div>
);

// "Borrow": requests for your books, your own requests, and the libraries you can borrow from.
export default function BorrowPage({ myBooks = [], onOpenSettings, onWaitingChange, onLoansChanged }) {
  const [libs, setLibs] = useState(null);
  const [reqs, setReqs] = useState(null);
  const [personId, setPersonId] = useState(null);
  const [query, setQuery] = useState('');
  const [asking, setAsking] = useState(null); // book being asked for
  const [message, setMessage] = useState('');
  const [answering, setAnswering] = useState(null); // { id, action }
  const [reply, setReply] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [error, setError] = useState('');
  const [showOld, setShowOld] = useState(false);

  const load = () => {
    api.libraries().then(setLibs).catch(e => setError(e.message));
    api.borrowRequests().then(r => { setReqs(r); onWaitingChange?.(r.waiting); }).catch(e => setError(e.message));
  };
  useEffect(load, []);

  const person = libs?.people.find(p => p.id === personId);
  const shown = useMemo(() => {
    if (!person) return [];
    const q = query.trim().toLowerCase();
    return person.books
      .filter(b => !q || `${b.workTitle} ${b.author} ${b.series || ''}`.toLowerCase().includes(q))
      .sort((a, b) => collator.compare(titleKey(a.workTitle), titleKey(b.workTitle)));
  }, [person, query]);
  const iHave = (b) => myBooks.some(m => m.owned !== false && titleKey(m.workTitle).toLowerCase() === titleKey(b.workTitle).toLowerCase());

  const ask = async () => {
    setError('');
    try {
      await api.askToBorrow(person.id, asking.id, message.trim());
      setAsking(null); setMessage('');
      load();
    } catch (e) { setError(e.message); }
  };
  const answer = async (id, action, extra = {}) => {
    setError('');
    try {
      const r = await api.answerBorrow(id, action, extra);
      setReqs(r); onWaitingChange?.(r.waiting);
      setAnswering(null); setReply(''); setDueOn('');
      if (action === 'accept' || action === 'returned') onLoansChanged?.();
      api.libraries().then(setLibs).catch(() => {});
    } catch (e) { setError(e.message); }
  };

  if (!libs || !reqs) {
    return <p className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</p>;
  }

  const active = (r) => r.status === 'pending' || r.status === 'lent';
  const incoming = reqs.incoming.filter(r => showOld || active(r));
  const outgoing = reqs.outgoing.filter(r => showOld || active(r));
  const oldCount = [...reqs.incoming, ...reqs.outgoing].filter(r => !active(r)).length;

  const requestRow = (r) => {
    const other = r.mine ? r.owner : r.requester;
    return (
      <div key={r.id} className="p-3 bg-white border border-slate-200 rounded-2xl flex gap-3" data-request={r.id}>
        <div className="w-12 flex-shrink-0"><Cover url={r.book.cover} title={r.book.title} author={r.book.author} /></div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{r.book.title}</p>
              <p className="text-[11px] text-slate-500">
                {r.mine ? <>From <b>{other?.displayName}</b></> : <><b>{other?.displayName}</b> would like to borrow it</>} · {formatDate(r.createdAt.slice(0, 10))}
              </p>
            </div>
            <Badge status={r.status} />
          </div>
          {r.message && <p className="text-[11px] text-slate-600 italic">"{r.message}"</p>}
          {r.reply && <p className="text-[11px] text-slate-600">{r.mine ? `${other?.displayName}: ` : 'You: '}<i>"{r.reply}"</i></p>}
          {r.status === 'lent' && r.dueOn && <p className="text-[11px] text-slate-600">Due back {formatDate(r.dueOn)}</p>}

          {!r.mine && r.status === 'pending' && (answering?.id === r.id ? (
            <div className="space-y-2 pt-1">
              {answering.action === 'accept' && (
                <label className="text-[11px] text-slate-600 flex items-center gap-2">Due back (optional)
                  <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-label="Due back" className="px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                </label>
              )}
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={answering.action === 'accept' ? 'A note (optional), e.g. "I\'ll bring it Sunday"' : 'A note (optional)'} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAnswering(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Back</button>
                <button onClick={() => answer(r.id, answering.action, { reply, dueOn })} className={`px-3 py-1.5 rounded-lg text-white text-xs font-semibold ${answering.action === 'accept' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                  {answering.action === 'accept' ? 'Lend it' : 'Say no'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setAnswering({ id: r.id, action: 'accept' }); setReply(''); setDueOn(''); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Yes, lend it</button>
              <button onClick={() => { setAnswering({ id: r.id, action: 'decline' }); setReply(''); }} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Not now</button>
            </div>
          ))}
          {!r.mine && r.status === 'lent' && (
            <button onClick={() => answer(r.id, 'returned')} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1"><Undo2 className="w-3.5 h-3.5" /> It's back</button>
          )}
          {r.mine && r.status === 'pending' && (
            <button onClick={() => answer(r.id, 'cancel')} className="tap text-[11px] font-semibold text-slate-500 underline">Cancel my request</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><HandHeart className="w-5 h-5 text-orange-500" /> Borrow</h2>
        <p className="text-xs text-slate-500">Ask to borrow a book from someone's library. When they say yes, it shows up in their "Lent Out" list.</p>
      </div>
      {error && <p className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</p>}

      {(incoming.length > 0 || outgoing.length > 0 || oldCount > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><Inbox className="w-4 h-4" /> Asking for my books {reqs.waiting > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px]">{reqs.waiting}</span>}</h3>
            {incoming.length ? incoming.map(requestRow) : <p className="text-[11px] text-slate-500">Nobody right now.</p>}
          </section>
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><Send className="w-4 h-4" /> Books I asked for</h3>
            {outgoing.length ? outgoing.map(requestRow) : <p className="text-[11px] text-slate-500">None right now.</p>}
          </section>
          {oldCount > 0 && (
            <button onClick={() => setShowOld(v => !v)} className="md:col-span-2 text-[11px] font-semibold text-slate-500 underline justify-self-start">
              {showOld ? 'Hide finished requests' : `Show finished requests (${oldCount})`}
            </button>
          )}
        </div>
      )}

      <section className="space-y-3">
        {!person ? (
          <>
            <h3 className="text-xs font-bold text-slate-700">Libraries I can borrow from</h3>
            {libs.people.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
                Nobody is sharing their library with you yet. Each person can turn sharing on in their Settings.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {libs.people.map(p => (
                  <button key={p.id} onClick={() => { setPersonId(p.id); setQuery(''); }} className="p-4 bg-white border border-slate-200 hover:border-orange-300 rounded-2xl text-left flex items-center gap-3">
                    <Avatar p={p} />
                    <div>
                      <p className="text-sm font-bold text-slate-900">{p.displayName}</p>
                      <p className="text-[11px] text-slate-500">{p.books.length} {p.books.length === 1 ? 'book' : 'books'}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!libs.sharingWithFriends && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-600 flex items-center gap-3">
                <span className="flex-1">Want friends to borrow from you too? Turn on <b>Let friends see my library</b> in Settings.</span>
                <button onClick={onOpenSettings} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold flex items-center gap-1"><Settings className="w-3.5 h-3.5" /> Settings</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => setPersonId(null)} className="tap text-xs font-semibold text-slate-500 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Everyone</button>
              <h3 className="text-lg font-bold text-slate-900">{person.displayName}'s library</h3>
              <div className="relative ml-auto w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${person.displayName}'s books`} className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {shown.map(b => (
                <div key={b.id} className="flex flex-col">
                  <Cover url={b.cover} title={b.workTitle} author={b.author} muted={b.out} />
                  <p className="mt-1 text-[11px] font-bold text-slate-900 leading-tight line-clamp-2">{b.workTitle}</p>
                  <p className="text-[10px] text-slate-500 truncate">{b.author}</p>
                  {iHave(b) && <p className="text-[10px] text-emerald-700 font-semibold">You have it too</p>}
                  <div className="mt-auto pt-1">
                    {b.myRequest ? <Badge status={b.myRequest} />
                      : b.out ? <span className="text-[10px] text-slate-500">Lent out right now</span>
                        : <button onClick={() => { setAsking(b); setMessage(''); }} className="w-full px-2 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold">Ask to borrow</button>}
                  </div>
                </div>
              ))}
            </div>
            {shown.length === 0 && <p className="text-xs text-slate-500 text-center py-6">No books match.</p>}
          </>
        )}
      </section>

      {asking && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setAsking(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ask to borrow">
            <p className="text-sm font-bold text-slate-900">Ask {person?.displayName} for "{asking.workTitle}"?</p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} placeholder="A note (optional), e.g. &quot;For my trip next week&quot;" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setAsking(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Cancel</button>
              <button onClick={ask} className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold">Send request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
