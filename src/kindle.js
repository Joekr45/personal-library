// Reading Kindle's "My Clippings.txt" (on the Kindle itself, in the "documents" folder).
// Each clipping looks like:
//   Pride and Prejudice (Austen, Jane)
//   - Your Highlight on page 12 | Location 180-182 | Added on Monday, January 1, 2024 10:00:00 AM
//
//   It is a truth universally acknowledged…
//   ==========
import { mainTitle, surname } from './matching.js';

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const pad = (n) => String(n).padStart(2, '0');
const dateOf = (line) => {
  const m = line.match(/Added on \w+,?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i) || line.match(/Added on \w+,?\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (!m) return null;
  const [month, day] = MONTHS[String(m[1]).toLowerCase()] ? [MONTHS[m[1].toLowerCase()], m[2]] : [MONTHS[String(m[2]).toLowerCase()], m[1]];
  return month ? `${m[3]}-${pad(month)}-${pad(day)}` : null;
};

// → [{ title, author, kind: 'highlight' | 'note', text, page, location, addedOn }]
export function parseClippings(text) {
  const out = [];
  for (const block of String(text || '').replace(/^﻿/, '').split(/\r?\n==========\r?\n?/)) {
    const lines = block.replace(/^﻿/, '').split(/\r?\n/);
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length < 2) continue;
    const head = lines[0].trim();
    const meta = lines[1].trim();
    const body = lines.slice(2).join('\n').trim();
    if (!body || /bookmark|marque|lesezeichen|marcador|segnalibro/i.test(meta)) continue;
    // "Title (Last, First)" — the last brackets hold the author.
    const m = head.match(/^(.*)\(([^()]*)\)\s*$/);
    let title = (m ? m[1] : head).trim();
    let author = m ? m[2].trim() : '';
    if (/^[^,]+,\s*[^,]+$/.test(author)) author = author.split(/,\s*/).reverse().join(' ');
    const kind = /note|notiz|nota/i.test(meta.split('|')[0]) ? 'note' : 'highlight';
    const page = Number((meta.match(/page\s+(\d+)/i) || meta.match(/seite\s+(\d+)/i) || meta.match(/página\s+(\d+)/i) || [])[1]) || null;
    const location = (meta.match(/location\s+([\d-]+)/i) || [])[1] || null;
    out.push({ title, author, kind, text: body, page, location, addedOn: dateOf(meta) });
  }
  return out;
}

// Group clippings by book and attach each Kindle note to the highlight at the same spot.
export function groupClippings(clippings) {
  const books = new Map();
  for (const c of clippings) {
    const key = `${mainTitle(c.title)}|${surname(c.author)}`;
    if (!books.has(key)) books.set(key, { title: c.title, author: c.author, quotes: [] });
    const book = books.get(key);
    if (c.kind === 'note') {
      const spot = c.location ? String(c.location).split('-').pop() : null;
      const target = [...book.quotes].reverse().find(q => q.location && spot && String(q.location).split('-').pop() === spot);
      if (target) { target.note = target.note ? `${target.note}\n${c.text}` : c.text; continue; }
    }
    // Kindle keeps old copies when you widen a highlight; keep the longest.
    const dup = book.quotes.find(q => q.text.includes(c.text) || c.text.includes(q.text));
    if (dup) { if (c.text.length > dup.text.length) Object.assign(dup, { text: c.text, location: c.location || dup.location, page: c.page || dup.page }); continue; }
    book.quotes.push({ text: c.text, page: c.page, location: c.location, addedOn: c.addedOn, note: c.kind === 'note' ? 'My note' : null });
  }
  return [...books.values()];
}

// Find the library book a Kindle title belongs to (Kindle titles often have "(Series Book 2)" etc.).
export function matchBook(group, books) {
  const t = mainTitle(group.title);
  const s = surname(group.author);
  const owned = books.filter(b => mainTitle(b.workTitle) === t);
  return owned.find(b => !s || surname(b.author) === s) || (owned.length === 1 ? owned[0] : null);
}

// Quotes not already saved on the book.
export const newQuotes = (group, book) => {
  const have = new Set((book.quotes || []).map(q => q.text.trim()));
  return group.quotes.filter(q => !have.has(q.text.trim()));
};
