import React, { useState } from 'react';
import { HandHelping, Undo2, History, BellRing, AlertTriangle } from 'lucide-react';
import { today, formatDate } from './reading.js';
import { currentLoan } from './matching.js';
import { loanStatus, reminderText, shareOrCopy } from './lending.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "Lend this book" on a book's page: who has it, when it's due back, reminders, and the history.
export default function LendPanel({ book, onUpdate, fromName }) {
  const [to, setTo] = useState('');
  const [date, setDate] = useState(today());
  const [due, setDue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [shared, setShared] = useState('');
  const loans = book.loans || [];
  const out = currentLoan(book);
  const past = loans.filter(l => l.returnedOn);
  const status = loanStatus(out);

  const lend = async (e) => {
    e.preventDefault();
    if (!to.trim()) return;
    const saved = await onUpdate({ loans: [...loans, { to: to.trim(), lentOn: date || today(), dueOn: due || null, returnedOn: null }] });
    if (saved) { setTo(''); setDue(''); }
  };
  const changeOut = (changes) => onUpdate({ loans: loans.map(l => (l === out ? { ...l, ...changes } : l)) });
  const remind = async () => {
    const result = await shareOrCopy(reminderText(book, out, fromName), `About "${book.workTitle}"`);
    setShared(result === 'copied' ? 'Reminder copied. Paste it into a text or email.' : result === 'shared' ? 'Reminder sent.' : '');
    setTimeout(() => setShared(''), 4000);
  };

  return (
    <div className="bg-sky-50/70 rounded-2xl p-4 border border-sky-200/70 space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><HandHelping className="w-4 h-4 text-sky-600" /> Lending</div>
      {out ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-700">Lent to <b>{out.to}</b>{out.lentOn ? ` on ${formatDate(out.lentOn)}` : ''}.</p>
            <button onClick={() => changeOut({ returnedOn: today() })} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1">
              <Undo2 className="w-3.5 h-3.5" /> It's back
            </button>
          </div>
          {status?.overdue && (
            <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {out.dueOn ? `Overdue by ${plural(status.daysLate, 'day')}` : `Out for ${plural(status.daysOut, 'day')}`}
            </p>
          )}
          {!status?.overdue && out.dueOn && (
            <p className="text-xs text-slate-600">{status.dueIn === 0 ? 'Due back today.' : `Due back in ${plural(status.dueIn, 'day')}.`}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[11px] text-slate-500 flex items-center gap-1.5">
              Due back
              <input type="date" value={out.dueOn || ''} onChange={(e) => changeOut({ dueOn: e.target.value || null })} aria-label="Due back" className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white" />
            </label>
            <button onClick={remind} className="ml-auto px-3 py-1.5 bg-white border border-sky-200 hover:bg-sky-50 text-sky-700 rounded-lg text-xs font-semibold flex items-center gap-1">
              <BellRing className="w-3.5 h-3.5" /> Send a reminder
            </button>
          </div>
          {shared && <p className="text-[11px] text-emerald-700">{shared}</p>}
        </div>
      ) : (
        <form onSubmit={lend} className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Lend to… (name)" className="flex-1 min-w-[8rem] px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date lent" className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" />
            <button type="submit" disabled={!to.trim()} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold">Lend</button>
          </div>
          <label className="text-[11px] text-slate-500 flex items-center gap-1.5">
            Due back (optional)
            <input type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} aria-label="Due back (optional)" className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white" />
          </label>
        </form>
      )}
      {past.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(v => !v)} className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
            <History className="w-3.5 h-3.5" /> {showHistory ? 'Hide' : 'Show'} lending history ({past.length})
          </button>
          {showHistory && (
            <ul className="mt-1 text-[11px] text-slate-600 space-y-0.5">
              {[...past].reverse().map((l, i) => (
                <li key={i}>• {l.to}: {formatDate(l.lentOn) || '?'} → {formatDate(l.returnedOn)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
