import React from 'react';
import { ExternalLink, Library } from 'lucide-react';
import { toIsbn13 } from '../shared/isbn.js';

// Links to borrow or buy a book: your library (Libby), WorldCat, and a few shops and book sites.
export function findItLinks(book, prefs) {
  const isbn = (book.editions || []).map(e => toIsbn13(e.isbn)).find(Boolean) || '';
  const words = `${book.workTitle} ${String(book.author || '').split(',')[0]}`.trim();
  const q = encodeURIComponent(isbn || words);
  const qWords = encodeURIComponent(words);
  const links = [];
  if (prefs?.libbyLibrary) {
    links.push({ id: 'libby', label: 'Borrow (Libby)', primary: true, url: `https://libbyapp.com/search/${encodeURIComponent(prefs.libbyLibrary)}/search/query-${qWords}/page-1` });
  }
  links.push(
    { id: 'worldcat', label: 'Libraries near me', url: `https://search.worldcat.org/search?q=${q}` },
    { id: 'bookshop', label: 'Bookshop.org', url: `https://bookshop.org/search?keywords=${q}` },
    { id: 'amazon', label: 'Amazon', url: `https://www.amazon.com/s?k=${q}&i=stripbooks` },
    { id: 'goodreads', label: 'Goodreads', url: `https://www.goodreads.com/search?q=${q}` },
    { id: 'hardcover', label: 'Hardcover', url: `https://hardcover.app/search?q=${qWords}` }
  );
  return links;
}

export default function FindItLinks({ book, prefs }) {
  const links = findItLinks(book, prefs);
  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Library className="w-4 h-4 text-orange-500" /> Borrow or buy</div>
      <div className="flex flex-wrap gap-1.5">
        {links.map(l => (
          <a key={l.id} href={l.url} target="_blank" rel="noreferrer"
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 border ${l.primary ? 'bg-orange-500 border-orange-500 text-white hover:bg-orange-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
            {l.label} <ExternalLink className="w-3 h-3" />
          </a>
        ))}
      </div>
      {!prefs?.libbyLibrary && <p className="text-[10px] text-slate-400">Tip: add your public library in Settings to get a “Borrow (Libby)” button.</p>}
    </div>
  );
}
