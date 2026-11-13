import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, X, ImagePlus } from 'lucide-react';
import { LANGUAGES } from './languages.js';

// "Add Manually": type in a book yourself.
// (Moved out of App.jsx; it receives the App state and actions it uses as props.)
export default function ManualAddModal({ handleManualAddSubmit, manualAuthor, manualCover, manualFormat, manualIsbn, manualLanguage, manualOwned, manualSeries, manualSeriesNum, manualShelf, manualTitle, setIsManualAddOpen, setIsManualCoverPickerOpen, setManualAuthor, setManualFormat, setManualIsbn, setManualLanguage, setManualOwned, setManualSeries, setManualSeriesNum, setManualShelf, setManualTitle }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-900">Add Book to Shelf</h3>
          </div>
          <button
            onClick={() => setIsManualAddOpen(false)}
            className="w-7 h-7 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleManualAddSubmit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setManualOwned(true)}
              className={`py-2 text-xs rounded-xl font-semibold border transition-all ${manualOwned ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}
            >
              I own this
            </button>
            <button
              type="button"
              onClick={() => setManualOwned(false)}
              className={`py-2 text-xs rounded-xl font-semibold border transition-all ${!manualOwned ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-600 border-slate-200'}`}
            >
              Add to wishlist
            </button>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Book Title *</label>
            <input
              type="text"
              required
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="e.g. 1st To Die"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Author *</label>
            <input
              type="text"
              required
              value={manualAuthor}
              onChange={(e) => setManualAuthor(e.target.value)}
              placeholder="e.g. James Patterson"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Series Name</label>
              <input
                type="text"
                value={manualSeries}
                onChange={(e) => setManualSeries(e.target.value)}
                placeholder="e.g. Women's Murder Club"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Book # In Series</label>
              <input
                type="number"
                step="any"
                min="0"
                value={manualSeriesNum}
                onChange={(e) => setManualSeriesNum(e.target.value)}
                placeholder="e.g. 1"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">ISBN-13 (Optional)</label>
              <input
                type="text"
                value={manualIsbn}
                onChange={(e) => setManualIsbn(e.target.value)}
                placeholder="e.g. 9780446610032"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Format</label>
              <select
                value={manualFormat}
                onChange={(e) => setManualFormat(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 bg-white"
              >
                <option value="Hardcover">Hardcover</option>
                <option value="Paperback">Paperback</option>
                <option value="Mass Market Paperback">Mass Market Paperback</option>
                <option value="Special Collector Edition">Collector's Edition</option>
              </select>
            </div>
          </div>

          {manualOwned && <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Shelf Location</label>
            <input
              type="text"
              value={manualShelf}
              onChange={(e) => setManualShelf(e.target.value)}
              placeholder="e.g. Living Room Shelf 2, Study"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
            />
          </div>}

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Language of my copy</label>
              <select
                value={manualLanguage}
                onChange={(e) => setManualLanguage(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 bg-white"
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {manualCover && (
                <img src={manualCover.url || manualCover.imageData} alt="" className="w-8 h-12 object-cover rounded border border-slate-200" />
              )}
              <button
                type="button"
                disabled={!manualTitle.trim()}
                onClick={() => setIsManualCoverPickerOpen(true)}
                className="flex-1 py-2 text-xs font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center gap-1.5"
                title={manualTitle.trim() ? '' : 'Enter a title first'}
              >
                <ImagePlus className="w-3.5 h-3.5 text-orange-500" />
                {manualCover ? 'Change cover' : 'Choose cover'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-xs transition-all mt-4"
          >
            {manualOwned ? '+ Place On Shelf' : '+ Add to Wishlist'}
          </button>
        </form>
      </div>
    </div>
  );
}
