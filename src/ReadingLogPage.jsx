import React, { useEffect, useState } from 'react';
import { Timer, Flame, Trophy, Pencil, Check, Minus } from 'lucide-react';
import { api } from './api.js';
import { Avatar } from './ActivityPage.jsx';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const shift = (day, n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`);

// "Reading Log": tap to add minutes read today. Stars for each day you reach your goal,
// a streak, and (for family) this week's family reading-time board. Made to be easy for kids.
export default function ReadingLogPage({ isFamily }) {
  const [log, setLog] = useState(null);
  const [board, setBoard] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const loadBoard = () => isFamily && api.familyReadingTime().then(setBoard).catch(() => setBoard(null));
  useEffect(() => { api.readingLog().then(setLog).catch(err => setError(err.message)); loadBoard(); }, []);

  const add = async (m) => {
    setError('');
    try { setLog(await api.logMinutes(m)); loadBoard(); } catch (err) { setError(err.message); }
  };
  if (!log) return <p className="text-xs text-slate-400">{error || 'Loading…'}</p>;

  const byDay = Object.fromEntries(log.days.map(d => [d.day, d.minutes]));
  const todayMin = byDay[log.today] || 0;
  const goalPct = Math.min(100, Math.round((100 * todayMin) / log.goal));
  const dow = (new Date(`${log.today}T12:00:00`).getDay() + 6) % 7;
  const week = DAY_LETTERS.map((letter, i) => { const day = shift(log.today, i - dow); return { day, letter, minutes: byDay[day] || 0, future: day > log.today }; });
  const maxWeek = Math.max(log.goal, ...week.map(d => d.minutes));
  const last14 = Array.from({ length: 14 }, (_, i) => shift(log.today, i - 13));
  const thisWeekTotal = week.reduce((s, d) => s + d.minutes, 0);

  return (
    <div className="space-y-5 max-w-2xl">
      <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Timer className="w-5 h-5 text-orange-500" /> Reading Log</h2>
      {error && <p className="text-xs text-red-700">{error}</p>}

      <section className="p-5 rounded-3xl bg-orange-600 text-white space-y-3 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-white/80">Today</p>
            <p className="text-4xl font-black">{todayMin}<span className="text-lg font-bold text-white/80"> / {log.goal} min</span></p>
            <p className="text-xs text-white/90">{todayMin >= log.goal ? 'Goal reached! ⭐ Great job!' : `${log.goal - todayMin} more minutes to reach your goal`}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black flex items-center gap-1 justify-end"><Flame className="w-7 h-7" /> {log.streak.current}</p>
            <p className="text-[11px] text-white/80">day streak{log.streak.longest > log.streak.current ? ` · best ${log.streak.longest}` : ''}</p>
          </div>
        </div>
        <div className="h-3 bg-white/25 rounded-full overflow-hidden"><div className="h-full bg-white rounded-full transition-all" style={{ width: `${goalPct}%` }} /></div>
        <div className="grid grid-cols-4 gap-2">
          {[5, 10, 15, 30].map(m => (
            <button key={m} onClick={() => add(m)} className="py-3 rounded-2xl bg-white/20 hover:bg-white/30 text-lg font-black" aria-label={`Add ${m} minutes`}>+{m}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (Number(custom)) { add(Number(custom)); setCustom(''); } }} className="flex gap-2 items-center">
          <input type="number" min="1" max="600" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Other" aria-label="Minutes read" className="w-20 px-3 py-1.5 rounded-xl bg-white text-slate-900 text-sm" />
          <span className="text-xs">minutes</span>
          <button type="submit" className="px-3 py-1.5 bg-white text-emerald-700 rounded-xl text-xs font-bold">Add</button>
          <button type="button" onClick={() => todayMin > 0 && add(-Math.min(5, todayMin))} disabled={!todayMin} className="ml-auto px-2.5 py-1.5 bg-white/15 rounded-xl text-xs font-semibold flex items-center gap-1 disabled:opacity-40" aria-label="Take away 5 minutes"><Minus className="w-3.5 h-3.5" /> 5 (oops)</button>
        </form>
      </section>

      <section className="p-4 bg-white border border-slate-200 rounded-3xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">This week · {mins(thisWeekTotal)}</h3>
          {editingGoal ? (
            <form onSubmit={async (e) => { e.preventDefault(); try { const g = await api.setReadingGoal(Number(goalInput)); setLog({ ...log, goal: g }); setEditingGoal(false); } catch (err) { setError(err.message); } }} className="flex gap-1.5 items-center">
              <input type="number" min="1" max="600" autoFocus value={goalInput} onChange={(e) => setGoalInput(e.target.value)} aria-label="Daily goal in minutes" className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white" />
              <span className="text-[11px] text-slate-500">min a day</span>
              <button type="submit" className="p-1 text-emerald-600" aria-label="Save goal"><Check className="w-4 h-4" /></button>
            </form>
          ) : (
            <button onClick={() => { setGoalInput(String(log.goal)); setEditingGoal(true); }} className="text-[11px] font-semibold text-slate-500 flex items-center gap-1"><Pencil className="w-3 h-3" /> Daily goal: {log.goal} min</button>
          )}
        </div>
        <div className="flex items-end gap-2 h-28">
          {week.map(d => (
            <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              {d.minutes > 0 && <span className="text-[10px] font-bold text-slate-600">{d.minutes}</span>}
              <div className={`w-full rounded-t-md ${d.minutes >= log.goal ? 'bg-emerald-500' : 'bg-emerald-300'}`} style={{ height: `${(80 * d.minutes) / maxWeek}%`, minHeight: d.minutes ? 4 : 1, opacity: d.future ? 0.2 : d.minutes ? 1 : 0.3 }} />
              <span className={`text-[10px] ${d.day === log.today ? 'font-bold text-emerald-700' : 'text-slate-400'}`}>{d.letter}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-[10px] uppercase font-semibold text-slate-400 mb-1">Goal stars, last 2 weeks</p>
          <div className="flex gap-1 flex-wrap" aria-label="Goal stars">
            {last14.map(day => <span key={day} title={`${day}: ${byDay[day] || 0} min`} className={`text-lg ${(byDay[day] || 0) >= log.goal ? '' : 'grayscale opacity-25'}`}>⭐</span>)}
          </div>
        </div>
      </section>

      {isFamily && board && (
        <section className="p-4 bg-white border border-slate-200 rounded-3xl space-y-2" aria-label="Family reading time this week">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Family reading time this week</h3>
          {board.board.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2.5">
              <span className="w-5 text-center text-sm">{['🥇', '🥈', '🥉'][i] || ''}</span>
              <Avatar user={m} size="w-7 h-7" />
              <span className={`flex-1 text-xs font-semibold ${m.isMe ? 'text-orange-600' : 'text-slate-700'}`}>{m.displayName}{m.isMe ? ' (you)' : ''}</span>
              {m.streak > 1 && <span className="text-[11px] text-orange-600 flex items-center gap-0.5"><Flame className="w-3 h-3" />{m.streak}</span>}
              <span className="text-xs font-bold text-slate-900 w-20 text-right">{mins(m.minutes)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
