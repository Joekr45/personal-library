import React, { useEffect, useState } from 'react';
import { X, Trash2, Undo2 } from 'lucide-react';
import { api } from './api.js';

const daysLeft = (deletedAt, keep) => Math.max(0, keep - Math.floor((Date.now() - Date.parse(deletedAt)) / 86400000));

// "Recently deleted": deleted books stay here for 30 days and can be put back.
export default function TrashModal({ onClose, onRestored, renderCover }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.trash().then(setData).catch(err => setError(err.message));
  useEffect(() => { load(); }, []);

  const restore = async (ids) => {
    setError('');
    try { onRestored(await api.restoreFromTrash(ids)); load(); } catch (err) { setError(err.message); }
  };
  const purge = async (body, question) => {
    if (!confirm(question)) return;
    try { await api.emptyTrash(body); load(); } catch (err) { setError(err.message); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Trash2 className="w-4 h-4 text-orange-500" /> Recently deleted</h3>
          <button onClick={onClose} aria-label="Close recently deleted" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          <p className="text-xs text-slate-500">Deleted books wait here for {data?.keepDays || 30} days, with their notes, dates and covers, before they're gone for good.</p>
          {error && <p className="text-xs text-red-700">{error}</p>}
          {!data ? <p className="text-xs text-slate-400">Loading…</p> : data.books.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl">Nothing here.</p>
          ) : (
            <>
              <div className="flex gap-2 justify-end">
                <button onClick={() => restore(data.books.map(b => b.id))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1"><Undo2 className="w-3.5 h-3.5" /> Put all back</button>
                <button onClick={() => purge({ all: true }, `Delete all ${data.books.length} for good? This can't be undone.`)} className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600">Empty</button>
              </div>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                {data.books.map(b => (
                  <li key={b.id} className="p-3 flex items-center gap-3">
                    <div className="w-9 flex-shrink-0">{renderCover(b)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{b.workTitle}</p>
                      <p className="text-[11px] text-slate-500 truncate">{b.author}</p>
                      <p className="text-[10px] text-slate-400">Gone for good in {daysLeft(b.deletedAt, data.keepDays)} days</p>
                    </div>
                    <button onClick={() => restore([b.id])} className="px-2.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold flex items-center gap-1"><Undo2 className="w-3.5 h-3.5" /> Put back</button>
                    <button onClick={() => purge({ ids: [b.id] }, `Delete "${b.workTitle}" for good?`)} aria-label={`Delete ${b.workTitle} for good`} className="text-slate-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
