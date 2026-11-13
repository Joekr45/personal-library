import React, { useEffect, useState } from 'react';
import { Copy, Plus, ImagePlus, Star, Trash2 } from 'lucide-react';
import { toIsbn13 } from '../shared/isbn.js';

// The picture for one copy: its own cover, else (for the first copy) the book's cover, else the
// catalog's picture for its ISBN.
export const copyCoverUrl = (book, edition, index) => {
  if (edition?.coverUrl) return edition.coverUrl;
  if (index === 0 && book.customCoverUrl) return book.customCoverUrl;
  const isbn = toIsbn13(edition?.isbn);
  return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : null;
};
const yearOf = (published) => (String(published || '').match(/\d{4}/) || [])[0] || null;
export const copyLabel = (e) => [e.format && e.format !== 'Physical Print' ? e.format : null, yearOf(e.published), e.language && e.language !== 'English' ? e.language : null].filter(Boolean).join(' · ') || 'Copy';

function Thumb({ url, title, selected, onClick, children }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return (
    <button onClick={onClick} aria-pressed={selected}
      className={`relative w-20 flex-shrink-0 rounded-xl overflow-hidden border-2 ${selected ? 'border-orange-500' : 'border-transparent'} bg-slate-200 aspect-[2/3]`}>
      {url && !broken
        ? <img src={url} alt={title} className="w-full h-full object-cover" onError={() => setBroken(true)} onLoad={(e) => e.currentTarget.naturalWidth < 10 && setBroken(true)} />
        : <span className="absolute inset-0 flex items-center justify-center p-1 text-[9px] font-semibold text-slate-500 text-center">{title}</span>}
      {children}
    </button>
  );
}

// "My copies": every copy of this book you own (e.g. one for each new cover), side by side.
export default function CopiesPanel({ book, activeIndex, onSelect, onUpdate, onAddCopy, onChangeCover }) {
  const editions = book.editions || [];
  const current = editions[activeIndex] || editions[0];
  const [note, setNote] = useState(current?.note || '');
  useEffect(() => { setNote(current?.note || ''); }, [book.id, activeIndex, current?.note]);
  if (!current) return null;
  const mainUrl = book.customCoverUrl;
  const setEditions = (list) => onUpdate({ editions: list });
  const saveNote = () => {
    if ((current.note || '') === note.trim()) return;
    setEditions(editions.map((e, i) => (i === activeIndex ? { ...e, note: note.trim() || null } : e)));
  };
  const remove = () => {
    if (!confirm(`Remove this copy (${copyLabel(current)})? The book and your other copies stay.`)) return;
    onSelect(0);
    setEditions(editions.filter((_, i) => i !== activeIndex));
  };
  const thumbUrl = copyCoverUrl(book, current, activeIndex);
  // The star goes on one copy only: the first whose picture is the one shown in the library.
  const mainIndex = editions.findIndex((e, i) => copyCoverUrl(book, e, i) === mainUrl);
  const isMain = activeIndex === mainIndex;
  const useAsMain = () => {
    // The first copy may be borrowing the book's cover: let it keep that picture as its own.
    const first = editions[0];
    const keepFirst = first && !first.coverUrl && book.customCoverUrl && activeIndex !== 0
      ? { editions: editions.map((e, i) => (i === 0 ? { ...e, coverUrl: book.customCoverUrl } : e)) }
      : {};
    onUpdate({ ...keepFirst, customCoverUrl: thumbUrl });
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Copy className="w-4 h-4 text-orange-500" /> My copies ({editions.length})</span>
        <button onClick={onAddCopy} className="px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add another copy</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Copies">
        {editions.map((e, i) => {
          const url = copyCoverUrl(book, e, i);
          return (
            <div key={e.id || i} className="text-center">
              <Thumb url={url} title={copyLabel(e)} selected={i === activeIndex} onClick={() => onSelect(i)}>
                {i === mainIndex && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center" title="Main cover"><Star className="w-3 h-3 fill-white" /></span>}
              </Thumb>
              <p className="mt-1 w-20 text-[10px] text-slate-500 truncate">{e.note || copyLabel(e)}</p>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => onChangeCover(current.id)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 flex items-center gap-1 hover:bg-slate-50"><ImagePlus className="w-3.5 h-3.5" /> This copy's cover</button>
        {thumbUrl && !isMain && (
          <button onClick={useAsMain} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 flex items-center gap-1 hover:bg-slate-50"><Star className="w-3.5 h-3.5" /> Show this cover in my library</button>
        )}
        {editions.length > 1 && (
          <button onClick={remove} className="ml-auto px-2 py-1.5 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-red-600 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Remove this copy</button>
        )}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        maxLength={300} placeholder="A note about this copy (e.g. “2023 movie cover”, “signed”, “gift from Mom”)" aria-label="Note about this copy"
        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" />
    </div>
  );
}
