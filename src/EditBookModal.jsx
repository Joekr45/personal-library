import React, { useState } from 'react';
import { Pencil, X, Save, RefreshCw } from 'lucide-react';
import { LANGUAGES } from './languages.js';

const FORMATS = ['Hardcover', 'Paperback', 'Mass Market Paperback', 'Special Collector Edition', 'Physical Print'];

// A form for changing a book's details after it has been added.
export default function EditBookModal({ book, onCancel, onSave }) {
  const firstEdition = book.editions?.[0] || {};
  const [title, setTitle] = useState(book.workTitle || '');
  const [author, setAuthor] = useState(book.author || '');
  const [series, setSeries] = useState(book.series || '');
  const [seriesNumber, setSeriesNumber] = useState(
    book.seriesNumber === null || book.seriesNumber === undefined ? '' : String(book.seriesNumber)
  );
  const [shelf, setShelf] = useState(book.shelfLocation || '');
  const [format, setFormat] = useState(firstEdition.format || 'Paperback');
  const [language, setLanguage] = useState(firstEdition.language || 'English');
  const languages = LANGUAGES.includes(language) ? LANGUAGES : [language, ...LANGUAGES];
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const formats = FORMATS.includes(format) ? FORMATS : [format, ...FORMATS];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) {
      setError('Title and author are required.');
      return;
    }
    const number = seriesNumber.trim() === '' ? null : parseFloat(seriesNumber);
    if (number !== null && Number.isNaN(number)) {
      setError('The series number must be a number, like 1 or 2.5.');
      return;
    }
    const editions = [...(book.editions || [])];
    if (editions.length > 0) {
      editions[0] = { ...editions[0], format, language, title: editions[0].title === book.workTitle ? title.trim() : editions[0].title };
    }
    setError('');
    setIsSaving(true);
    const saved = await onSave({
      workTitle: title.trim(),
      author: author.trim(),
      series: series.trim() || null,
      seriesNumber: series.trim() ? number : null,
      shelfLocation: shelf.trim(),
      editions
    });
    setIsSaving(false);
    if (!saved) setError('Could not save your changes. Please try again.');
  };

  const inputClass = 'w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500';
  const labelClass = 'text-[11px] font-semibold text-slate-500 uppercase block mb-1';

  return (
    <div className="fixed inset-0 z-[55] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-900">Edit Book Details</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className={labelClass} htmlFor="edit-title">Title *</label>
            <input id="edit-title" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="edit-author">Author *</label>
            <input id="edit-author" type="text" required value={author} onChange={(e) => setAuthor(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelClass} htmlFor="edit-series">Series</label>
              <input id="edit-series" type="text" value={series} onChange={(e) => setSeries(e.target.value)} placeholder="e.g. Century Trilogy" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="edit-series-number">Book #</label>
              <input id="edit-series-number" type="number" step="any" min="0" value={seriesNumber} onChange={(e) => setSeriesNumber(e.target.value)} placeholder="1" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="edit-format">Format</label>
              <select id="edit-format" value={format} onChange={(e) => setFormat(e.target.value)} className={`${inputClass} bg-white`}>
                {formats.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="edit-shelf">Shelf Location</label>
              <input id="edit-shelf" type="text" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="e.g. Study" className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="edit-language">Language of my copy</label>
            <select id="edit-language" value={language} onChange={(e) => setLanguage(e.target.value)} className={`${inputClass} bg-white`}>
              {languages.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5">
              {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
