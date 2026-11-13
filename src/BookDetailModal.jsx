import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Library, Heart, Users, X, Globe2, RefreshCw, ArrowRight, Trash2, ExternalLink, Pencil, ImagePlus } from 'lucide-react';
import ReadingPanel from './ReadingPanel.jsx';
import { statusChanges } from './reading.js';
import LendPanel from './LendPanel.jsx';
import { sameBook } from './matching.js';
import ShelvesPanel from './ShelvesPanel.jsx';
import ProgressPanel from './ProgressPanel.jsx';
import QuotesPanel from './QuotesPanel.jsx';
import CollectorPanel from './CollectorPanel.jsx';
import FindItLinks from './FindItLinks.jsx';
import BookInfoPanel from './BookInfoPanel.jsx';
import ReviewPanel from './ReviewPanel.jsx';
import MoodPanel from './MoodPanel.jsx';
import SharePanel from './SharePanel.jsx';
import AudioProgress, { FormatChips } from './AudioProgress.jsx';
import { AppleBookCover } from './appShared.jsx';

// The book page: cover, status, and the tabs (My Reading, About, Review & Quotes, Shelves & More).
// (Moved out of App.jsx; it receives the App state and actions it uses as props.)
export default function BookDetailModal({ activeEditionIndex, bookTab, books, currentUser, deleteBook, family, isSavingDetailCover, myShelves, navigateToAuthor, onBookSaved, prefs, selectedBook, setBookTab, setEditingBook, setIsDetailCoverPickerOpen, setOwned, setSelectedBook, updateBook }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Book Details & Edition
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditingBook(selectedBook)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-orange-600 rounded-lg hover:bg-orange-50 transition-colors"
              title="Edit book details"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              onClick={(e) => deleteBook(selectedBook.id, e)}
              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              title="Remove Book"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedBook(null)}
              className="w-8 h-8 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center sm:items-start">
            <div className="w-32 sm:w-40 flex-shrink-0">
              <div className="relative">
                <AppleBookCover
                  book={selectedBook}
                  height="h-48 sm:h-56"
                />
                {isSavingDetailCover && (
                  <div className="absolute inset-0 rounded-2xl bg-white/70 flex items-center justify-center z-20">
                    <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsDetailCoverPickerOpen(true)}
                className="mt-2 w-full py-1.5 text-[11px] font-semibold text-orange-600 hover:bg-orange-50 rounded-lg flex items-center justify-center gap-1"
              >
                <ImagePlus className="w-3.5 h-3.5" /> Change cover
              </button>
            </div>

            <div className="flex-1 w-full space-y-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900 leading-tight">{selectedBook.workTitle}</h3>
                <button
                  onClick={(e) => navigateToAuthor(selectedBook.author, e)}
                  className="text-sm font-semibold text-orange-600 hover:underline mt-0.5 flex items-center gap-1"
                >
                  <span>{selectedBook.author}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
                {(() => {
                  const owners = (family?.members || []).filter(m => m.books.some(b => sameBook(b, selectedBook))).map(m => m.displayName);
                  return owners.length > 0 ? (
                    <p className="mt-1 text-[11px] text-sky-700 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Also on {owners.join(' and ')}'s shelf</p>
                  ) : null;
                })()}
              </div>

              {selectedBook.series && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold">
                  <span>{selectedBook.series}</span>
                  <span>#{selectedBook.seriesNumber}</span>
                </div>
              )}

              <div className="pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setOwned(selectedBook.id, true)}
                    className={`py-2 text-xs rounded-xl font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                      selectedBook.owned !== false
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Library className="w-3.5 h-3.5" /> On My Shelf
                  </button>
                  <button
                    onClick={() => setOwned(selectedBook.id, false)}
                    className={`py-2 text-xs rounded-xl font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                      selectedBook.owned === false
                        ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Heart className="w-3.5 h-3.5" /> Wishlist
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Reading Status for {currentUser.displayName}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Unread', 'Reading', 'Completed', 'DNF'].map(status => (
                    <button
                      key={status}
                      onClick={() => updateBook(selectedBook.id, statusChanges(selectedBook, status))}
                      className={`py-2 text-xs rounded-xl font-semibold border transition-all ${
                        selectedBook.readingStatus === status
                          ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {status === 'DNF' ? 'Did not finish' : status}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* The book's boxes, grouped into tabs so the page isn't one long scroll. */}
          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs gap-1 sticky top-0 z-10" role="tablist" aria-label="Book sections">
            {[['reading', 'My Reading'], ['about', 'About'], ['notes', 'Review & Quotes'], ['more', 'Shelves & More']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={bookTab === id} onClick={() => setBookTab(id)}
                className={`flex-1 py-2 rounded-xl font-semibold transition-all ${bookTab === id ? 'bg-white shadow-xs text-orange-600' : 'text-slate-500 hover:text-slate-900'}`}>
                {label}
              </button>
            ))}
          </div>

          {bookTab === 'reading' && (
            <>
              <FormatChips book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
              {selectedBook.readingStatus === 'Reading' && (selectedBook.readFormat === 'audio'
                ? <AudioProgress book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
                : <ProgressPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />)}
              <ReadingPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
              <MoodPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
            </>
          )}

          {/* Kept mounted (just hidden) so book info is fetched the first time any book is opened. */}
          <div className={bookTab === 'about' ? 'space-y-6' : 'hidden'}>
            <BookInfoPanel book={selectedBook} onBookSaved={onBookSaved} />

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Globe2 className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-bold text-slate-800">Physical Edition & Shelf Data</span>
                </div>
                {selectedBook.editions[activeEditionIndex]?.isbn && selectedBook.editions[activeEditionIndex].isbn !== 'Pending Scan' && (
                  <a
                    href={`https://openlibrary.org/isbn/${selectedBook.editions[activeEditionIndex]?.isbn}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-orange-600 font-semibold hover:underline flex items-center gap-1"
                  >
                    <span>View on Open Library</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {selectedBook.editions[activeEditionIndex] && (
                <div className="grid grid-cols-2 gap-3 text-xs bg-white p-3 rounded-xl border border-slate-200/80">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">ISBN-13 Barcode</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-slate-800 font-semibold">
                        {selectedBook.editions[activeEditionIndex].isbn}
                      </span>
                      <button
                        onClick={() => {
                          const newIsbn = prompt('Enter exact ISBN (e.g. 9780446610032):', selectedBook.editions[activeEditionIndex].isbn === 'Pending Scan' ? '' : selectedBook.editions[activeEditionIndex].isbn);
                          if (newIsbn && newIsbn.trim()) {
                            const clean = newIsbn.trim().replace(/[^0-9X]/gi, '');
                            const newCoverUrl = `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`;
                            const updatedEditions = [...selectedBook.editions];
                            updatedEditions[activeEditionIndex] = { ...updatedEditions[activeEditionIndex], isbn: clean };
                            // Only replace the cover if the book was using the automatic one for the old ISBN
                            const oldIsbn = selectedBook.editions[activeEditionIndex].isbn;
                            const usesAutoCover = !selectedBook.customCoverUrl || selectedBook.customCoverUrl.includes(`/isbn/${oldIsbn}-`);
                            updateBook(selectedBook.id, {
                              editions: updatedEditions,
                              ...(usesAutoCover ? { customCoverUrl: newCoverUrl } : {})
                            });
                          }
                        }}
                        className="text-[10px] text-orange-600 hover:text-orange-700 font-medium underline"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Format</span>
                    <span className="text-slate-800 font-medium">{selectedBook.editions[activeEditionIndex].format}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Shelf Location</span>
                    <span className="text-slate-800 font-medium">{selectedBook.shelfLocation || 'Living Room Shelf'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Language</span>
                    <span className="text-slate-800 font-medium">{selectedBook.editions[activeEditionIndex].language}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {bookTab === 'notes' && (
            <>
              <ReviewPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
              <QuotesPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
            </>
          )}

          {bookTab === 'more' && (
            <>
              <ShelvesPanel book={selectedBook} shelves={myShelves} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
              {selectedBook.owned !== false && <LendPanel book={selectedBook} fromName={currentUser.displayName} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />}
              {selectedBook.owned !== false && <CollectorPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />}
              <FindItLinks book={selectedBook} prefs={prefs} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
              <SharePanel book={selectedBook} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
