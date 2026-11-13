import React, { useMemo, useState } from 'react';
import { Users, ArrowLeft, Search, CheckCircle2, Settings, RefreshCw } from 'lucide-react';
import { Cover } from './AuthorPage.jsx';
import StarRating from './StarRating.jsx';
import { sameBook } from './matching.js';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const titleKey = (t) => String(t || '').trim().replace(/^(the|a|an)\s+/i, '');

// "Family Shelves": browse the libraries other family members chose to share.
export default function FamilyPage({ family, myBooks, onOpenSettings, onRefresh }) {
  const [memberId, setMemberId] = useState(null);
  const [query, setQuery] = useState('');
  const member = family?.members?.find(m => m.id === memberId);

  const shown = useMemo(() => {
    if (!member) return [];
    const q = query.trim().toLowerCase();
    return member.books
      .filter(b => !q || `${b.workTitle} ${b.author} ${b.series || ''}`.toLowerCase().includes(q))
      .sort((a, b) => collator.compare(titleKey(a.workTitle), titleKey(b.workTitle)))
      .map(b => ({ ...b, mine: myBooks.find(m => m.owned !== false && sameBook(m, b)) }));
  }, [member, query, myBooks]);

  if (!family) {
    return <p className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading family shelves…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Users className="w-5 h-5 text-orange-500" /> Family Shelves</h2>
        <p className="text-xs text-slate-500">Books on the shelves of family members who share their library. Notes and wishlists stay private.</p>
      </div>

      {!family.sharing && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="flex-1">You're not sharing your own shelves yet. Turn on <b>Share my library with the family</b> in Settings so they can see yours too.</span>
          <button onClick={onOpenSettings} className="px-3 py-2 bg-white border border-amber-300 rounded-xl font-semibold flex items-center gap-1.5 self-start"><Settings className="w-3.5 h-3.5" /> Settings</button>
        </div>
      )}

      {!member ? (
        family.members.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
            Nobody else is sharing their library yet. Each person can turn it on in their Settings.
            <button onClick={onRefresh} className="tap block mx-auto mt-2 font-semibold text-orange-600 underline">Check again</button>
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {family.members.map(m => (
              <button key={m.id} onClick={() => { setMemberId(m.id); setQuery(''); }} className="p-4 bg-white border border-slate-200 hover:border-orange-300 rounded-2xl text-left flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${m.color} text-white font-bold flex items-center justify-center`}>{m.displayName.charAt(0).toUpperCase()}</div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{m.displayName}</p>
                  <p className="text-[11px] text-slate-500">{m.books.length} {m.books.length === 1 ? 'book' : 'books'}</p>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setMemberId(null)} className="tap text-xs font-semibold text-slate-500 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Everyone</button>
            <h3 className="text-lg font-bold text-slate-900">{member.displayName}'s shelves</h3>
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${member.displayName}'s books`} className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {shown.map(b => (
              <div key={b.id}>
                <div className="relative">
                  <Cover url={b.customCoverUrl} title={b.workTitle} author={b.author} />
                  {b.mine && (
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center gap-0.5 shadow" title="You have this too">
                      <CheckCircle2 className="w-3 h-3" /> You too
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] font-bold text-slate-900 leading-tight line-clamp-2">{b.workTitle}</p>
                <p className="text-[10px] text-slate-500 truncate">{b.author}</p>
                {b.rating ? <StarRating value={b.rating} size="sm" /> : null}
              </div>
            ))}
          </div>
          {shown.length === 0 && <p className="text-xs text-slate-500 text-center py-6">No books match.</p>}
        </div>
      )}
    </div>
  );
}
