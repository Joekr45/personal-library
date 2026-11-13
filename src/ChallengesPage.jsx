import React, { useEffect, useState } from 'react';
import { Flag, Plus, Trash2, LogIn, LogOut, Crown, RefreshCw } from 'lucide-react';
import { api } from './api.js';
import { today, formatDate } from './reading.js';

const daysLeft = (end) => Math.round((Date.parse(end) - Date.parse(today())) / 86400000);
const plus = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

// Family reading challenges: e.g. "Summer reading: 10 books by Aug 31". Everyone can join;
// progress counts books each person finishes between the start and end dates (re-reads too).
export default function ChallengesPage() {
  const [challenges, setChallenges] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', target: '10', startsOn: today(), endsOn: plus(90) });

  const run = async (fn) => {
    setError('');
    try { setChallenges(await fn()); } catch (err) { setError(err.message); }
  };
  useEffect(() => { run(api.challenges); }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setChallenges(await api.createChallenge({ ...form, target: Number(form.target) }));
      setCreating(false);
      setForm({ name: '', target: '10', startsOn: today(), endsOn: plus(90) });
    } catch (err) {
      setError(err.message);
    }
  };
  const input = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-orange-500';
  const label = 'text-[10px] uppercase font-semibold text-slate-400';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Flag className="w-5 h-5 text-orange-500" /> Family Challenges</h2>
        <div className="flex gap-2">
          <button onClick={() => run(api.challenges)} aria-label="Refresh" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="w-4 h-4" /></button>
          {!creating && (
            <button onClick={() => setCreating(true)} className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> New challenge
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">Set a reading goal together. Books count when someone marks them <b>Finished</b> with a finish date inside the challenge. Only the number of books is shown to others.</p>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

      {creating && (
        <form onSubmit={create} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
          <label className="block"><span className={label}>Name</span>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Summer reading" maxLength={80} className={input} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block"><span className={label}>Books each</span>
              <input type="number" min="1" max="1000" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className={input} />
            </label>
            <label className="block"><span className={label}>Starts</span>
              <input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} className={input} />
            </label>
            <label className="block"><span className={label}>Ends</span>
              <input type="date" value={form.endsOn} min={form.startsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} className={input} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 text-xs font-semibold text-slate-500">Cancel</button>
            <button type="submit" disabled={!form.name.trim()} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl text-xs font-semibold">Create and join</button>
          </div>
        </form>
      )}

      {challenges === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : challenges.length === 0 && !creating ? (
        <p className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">No challenges yet. Start one and invite the family to join!</p>
      ) : (
        <div className="space-y-3">
          {challenges.map(c => {
            const left = daysLeft(c.endsOn);
            const upcoming = c.startsOn > today();
            const ended = left < 0;
            return (
              <article key={c.id} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900">{c.name}</h3>
                    <p className="text-[11px] text-slate-500">
                      {c.target} book{c.target === 1 ? '' : 's'} each · {formatDate(c.startsOn)} – {formatDate(c.endsOn)} ·{' '}
                      {ended ? 'Ended' : upcoming ? 'Not started yet' : left === 0 ? 'Last day!' : `${left} day${left === 1 ? '' : 's'} left`}
                      {c.createdBy ? ` · started by ${c.createdBy}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {c.joined ? (
                      <button onClick={() => run(() => api.leaveChallenge(c.id))} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold flex items-center gap-1 hover:bg-slate-50"><LogOut className="w-3.5 h-3.5" /> Leave</button>
                    ) : (
                      <button onClick={() => run(() => api.joinChallenge(c.id))} className="px-2.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold flex items-center gap-1"><LogIn className="w-3.5 h-3.5" /> Join</button>
                    )}
                    {c.canDelete && (
                      <button onClick={() => confirm(`Delete the challenge "${c.name}" for everyone?`) && run(() => api.deleteChallenge(c.id))} aria-label="Delete challenge" className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
                {c.members.length === 0 ? (
                  <p className="text-[11px] text-slate-400">Nobody has joined yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {c.members.map((m, i) => {
                      const pct = Math.min(100, Math.round((100 * m.finished) / c.target));
                      return (
                        <li key={m.id} className="flex items-center gap-2.5">
                          <span className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white bg-gradient-to-br ${m.color || 'from-orange-500 to-amber-500'}`}>{m.displayName.charAt(0).toUpperCase()}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className={`font-semibold truncate ${m.isMe ? 'text-orange-600' : 'text-slate-700'}`}>
                                {m.displayName}{m.isMe ? ' (you)' : ''}
                                {i === 0 && m.finished > 0 && c.members.length > 1 && <Crown className="inline w-3.5 h-3.5 ml-1 text-amber-500" />}
                              </span>
                              <span className="text-slate-500 flex-shrink-0">{m.finished} / {c.target}{m.finished >= c.target ? ' 🎉' : ''}</span>
                            </div>
                            <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full ${m.finished >= c.target ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
