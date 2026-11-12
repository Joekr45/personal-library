import React, { useMemo, useState } from 'react';
import { X, Upload, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { api } from './api.js';
import { readGoodreadsExport } from '../shared/goodreads.js';
import { sameBook } from './matching.js';

// Import your books from a Goodreads export file.
export default function ImportModal({ books, onImported, onClose }) {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [toRead, setToRead] = useState('wishlist'); // wishlist | shelf | skip
  const [includeRead, setIncludeRead] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [done, setDone] = useState(null);

  const readFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      setParsed(readGoodreadsExport(await file.text()));
    } catch (err) {
      setParsed(null);
      setError(err.message);
    }
  };

  // What will be added, after the choices above and skipping books already in the library.
  const plan = useMemo(() => {
    if (!parsed) return null;
    const chosen = [];
    let duplicates = 0;
    for (const b of parsed.books) {
      const { shelf, ...book } = b;
      let item;
      if (shelf === 'to-read') {
        if (toRead === 'skip') continue;
        item = { ...book, owned: toRead === 'shelf', readingStatus: 'Unread', shelfLocation: toRead === 'shelf' ? 'Living Room Shelf' : '' };
      } else if (shelf === 'read') {
        if (!includeRead) continue;
        item = { ...book, owned: true, readingStatus: 'Completed', shelfLocation: 'Living Room Shelf' };
      } else if (shelf === 'currently-reading') {
        item = { ...book, owned: true, readingStatus: 'Reading', shelfLocation: 'Living Room Shelf' };
      } else {
        item = { ...book, owned: true, readingStatus: 'Unread', shelfLocation: 'Living Room Shelf' };
      }
      if (books.some(existing => sameBook(existing, item)) || chosen.some(c => sameBook(c, item))) { duplicates++; continue; }
      chosen.push(item);
    }
    return { chosen, duplicates };
  }, [parsed, toRead, includeRead, books]);

  const runImport = async () => {
    setIsImporting(true);
    setError('');
    try {
      const result = await api.bulkAdd(plan.chosen);
      onImported(result.books);
      setDone(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const radio = (value, label) => (
    <label className="flex items-center gap-1.5">
      <input type="radio" name="toread" checked={toRead === value} onChange={() => setToRead(value)} className="accent-orange-500" /> {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white sm:rounded-3xl shadow-2xl max-w-lg w-full flex flex-col h-full sm:h-auto sm:max-h-[92vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Upload className="w-4 h-4 text-orange-500" /> Import from Goodreads</h3>
          <button onClick={onClose} aria-label="Close import" className="w-8 h-8 rounded-full bg-slate-200/60 flex items-center justify-center text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
          {done ? (
            <div className="space-y-3 text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-900">Imported {done.added} {done.added === 1 ? 'book' : 'books'}.</p>
              {done.skipped > 0 && <p>{done.skipped} could not be read and were skipped.</p>}
              <p className="text-slate-500">Tip: open the <b>Series</b> page and tap <b>Find series</b> to fill in any missing series, and use <b>Change cover</b> on any book whose cover you'd like to pick.</p>
              <button onClick={onClose} className="px-4 py-2 bg-orange-500 text-white rounded-xl font-semibold">Done</button>
            </div>
          ) : (
            <>
              <ol className="list-decimal pl-5 space-y-1">
                <li>
                  On Goodreads, open{' '}
                  <a href="https://www.goodreads.com/review/import" target="_blank" rel="noreferrer" className="text-orange-600 font-semibold underline inline-flex items-center gap-0.5">
                    My Books → Import and export <ExternalLink className="w-3 h-3" />
                  </a>{' '}and tap <b>Export Library</b>.
                </li>
                <li>Download the file it makes (it ends in <code>.csv</code>).</li>
                <li>Choose that file here.</li>
              </ol>
              <input type="file" accept=".csv,text/csv" onChange={readFile} className="block w-full text-xs file:mr-3 file:px-3 file:py-2 file:rounded-xl file:border-0 file:bg-orange-500 file:text-white file:font-semibold" />
              {error && <p className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}</p>}
              {parsed && plan && (
                <div className="space-y-3 p-3 bg-slate-50 rounded-2xl">
                  <p className="font-bold text-slate-900">Found {parsed.books.length} books:</p>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={includeRead} onChange={(e) => setIncludeRead(e.target.checked)} className="accent-orange-500" /> <b>Read</b> ({parsed.shelves.read}) → on my shelf, Finished (with your ratings, reviews and dates)</label>
                  <p className="pl-6"><b>Currently reading</b> ({parsed.shelves['currently-reading']}) → on my shelf, Reading</p>
                  <div className="pl-6 space-y-1">
                    <p><b>Want to read</b> ({parsed.shelves['to-read']}) →</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">{radio('wishlist', 'Wishlist')}{radio('shelf', 'On my shelf')}{radio('skip', 'Skip')}</div>
                  </div>
                  {parsed.shelves.other > 0 && <p className="pl-6"><b>Other shelves</b> ({parsed.shelves.other}) → on my shelf</p>}
                  {plan.duplicates > 0 && <p className="text-slate-500">{plan.duplicates} {plan.duplicates === 1 ? 'is' : 'are'} already in your library and will be skipped.</p>}
                  <button onClick={runImport} disabled={isImporting || plan.chosen.length === 0} className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-1.5">
                    {isImporting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />} Import {plan.chosen.length} {plan.chosen.length === 1 ? 'book' : 'books'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
