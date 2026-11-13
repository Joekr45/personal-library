import React, { useEffect, useState } from 'react';
import { Gift, Check, Undo2 } from 'lucide-react';
import { api } from './api.js';
import { Cover } from './AuthorPage.jsx';
import { Avatar } from './ActivityPage.jsx';

// "Gift Ideas" (family only): family members' wishlists, with a secret "I'm getting this" mark
// so two people don't buy the same book. The wishlist's owner never sees the marks.
export default function GiftsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true); setError('');
    try { setData(await fn()); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  useEffect(() => { run(api.gifts); }, []);
  if (!data) return <p className="text-xs text-slate-400">{error || 'Loading…'}</p>;

  return (
    <div className="space-y-5 max-w-3xl">
      <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Gift className="w-5 h-5 text-rose-500" /> Gift Ideas</h2>
      <label className="flex items-start gap-2 p-3 bg-white border border-slate-200 rounded-2xl cursor-pointer text-xs text-slate-700">
        <input type="checkbox" checked={data.sharing} disabled={busy} className="w-4 h-4 mt-0.5 accent-rose-500"
          onChange={async (e) => { const on = e.target.checked; setData({ ...data, sharing: on }); try { await api.setGiftSharing(on); } catch (err) { setError(err.message); } }} />
        <span><b>Share my wishlist with the family for gift ideas.</b> They can secretly mark a book "I'm getting this" so nobody buys it twice. You'll never see who's getting what.</span>
      </label>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {data.members.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
          Nobody in the family has shared their wishlist yet. Ask them to tick the box above on their account.
        </p>
      ) : data.members.map(m => (
        <section key={m.id} className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Avatar user={m} size="w-7 h-7" /> {m.displayName}'s wishlist ({m.wishlist.length})</h3>
          {m.wishlist.length === 0 ? <p className="text-xs text-slate-500">Nothing on it right now.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {m.wishlist.map(b => (
                <div key={b.bookId} className="space-y-1">
                  <div className={b.claimedBy && !b.claimedByMe ? 'opacity-40' : ''}><Cover url={b.cover} title={b.title} author={b.author} /></div>
                  <p className="text-[11px] font-bold text-slate-900 leading-tight line-clamp-2">{b.title}</p>
                  <p className="text-[10px] text-slate-500 truncate">{b.author}{b.series ? ` · ${b.series} #${b.seriesNumber}` : ''}</p>
                  {b.claimedByMe ? (
                    <button onClick={() => run(() => api.unclaimGift(b.bookId))} disabled={busy} className="w-full py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-semibold flex items-center justify-center gap-1"><Check className="w-3 h-3" /> You're getting this <Undo2 className="w-3 h-3 opacity-70" /></button>
                  ) : b.claimedBy ? (
                    <p className="text-[10px] font-semibold text-slate-500 text-center py-1">{b.claimedBy} is getting this</p>
                  ) : (
                    <button onClick={() => run(() => api.claimGift(b.bookId))} disabled={busy} className="w-full py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center gap-1"><Gift className="w-3 h-3" /> I'll get this</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
