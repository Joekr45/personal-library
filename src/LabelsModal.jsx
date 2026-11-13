import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';
import { SHEETS, labelsHtml } from './labels.js';

// "Print labels" for the selected books: QR code (opens the book in the app), title, author, where it lives.
export default function LabelsModal({ books, ownerName, onClose }) {
  const [sheet, setSheet] = useState('small');
  const [owner, setOwner] = useState(ownerName ? `From the library of ${ownerName}` : '');
  const [showLocation, setShowLocation] = useState(true);
  const [startAt, setStartAt] = useState(1);
  const [error, setError] = useState('');
  const s = SHEETS[sheet];
  const perPage = s.cols * s.rows;
  const pages = Math.ceil((books.length + startAt - 1) / perPage);

  const open = () => {
    setError('');
    const html = labelsHtml(books, { sheet, origin: window.location.origin, owner: owner.trim(), showLocation, startAt });
    const w = window.open('', '_blank');
    if (!w) { setError('Your browser blocked the new window. Allow pop-ups for this site and try again.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* they can press Ctrl+P */ } }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Print labels">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Printer className="w-5 h-5 text-orange-500" /> Print labels ({books.length} book{books.length === 1 ? '' : 's'})</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500">Each label has a QR code. Scan it with a phone camera to open that book in the app (you need to be signed in).</p>
        <div className="space-y-3 text-xs">
          <label className="block space-y-1"><span className="font-semibold text-slate-700">Label sheet</span>
            <select value={sheet} onChange={(e) => { setSheet(e.target.value); setStartAt(1); }} className="w-full px-2 py-2 border border-slate-200 rounded-lg bg-white">
              {Object.entries(SHEETS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </label>
          <label className="block space-y-1"><span className="font-semibold text-slate-700">Top line (optional)</span>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={60} placeholder="e.g. From the library of…" className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={showLocation} onChange={(e) => setShowLocation(e.target.checked)} className="accent-orange-500" /> Show where the book lives (e.g. "Bedroom shelf")</label>
          <label className="flex items-center gap-2">Start at label number
            <input type="number" min={1} max={perPage} value={startAt} onChange={(e) => setStartAt(Math.min(perPage, Math.max(1, Number(e.target.value) || 1)))} aria-label="Start at label number" className="w-16 px-2 py-1 border border-slate-200 rounded-lg" />
            <span className="text-slate-400">(to reuse a half-used sheet)</span>
          </label>
        </div>
        <p className="text-[11px] text-slate-500">{pages} page{pages === 1 ? '' : 's'}. In the print window pick <b>Scale 100%</b> and <b>no margins</b>.</p>
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">Cancel</button>
          <button onClick={open} disabled={!books.length} className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"><Printer className="w-4 h-4" /> Make labels</button>
        </div>
      </div>
    </div>
  );
}
