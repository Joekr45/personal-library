// Printable book labels with a QR code that opens the book in the app.
import { qrSvg } from './qr.js';

// Common US label sheets (Letter paper). All sizes in inches.
export const SHEETS = {
  small: { name: 'Small: 30 per page (Avery 5160 / 8160)', cols: 3, rows: 10, w: 2.625, h: 1, top: 0.5, left: 0.1875, gapX: 0.125, gapY: 0 },
  large: { name: 'Large: 10 per page (Avery 5163 / 8163)', cols: 2, rows: 5, w: 4, h: 2, top: 0.5, left: 0.15625, gapX: 0.1875, gapY: 0 }
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const bookLink = (origin, book) => `${origin}/?book=${encodeURIComponent(book.id)}`;

// The whole printable page as an HTML document.
export function labelsHtml(books, { sheet = 'small', origin, owner = '', showLocation = true, startAt = 1 } = {}) {
  const s = SHEETS[sheet] || SHEETS.small;
  const perPage = s.cols * s.rows;
  const cells = [...Array(Math.max(0, Math.min(perPage - 1, startAt - 1))).fill(null), ...books];
  const pages = [];
  for (let i = 0; i < cells.length; i += perPage) pages.push(cells.slice(i, i + perPage));
  const big = sheet === 'large';
  const label = (b, i) => {
    const col = i % s.cols;
    const row = Math.floor(i / s.cols);
    const pos = `left:${s.left + col * (s.w + s.gapX)}in;top:${s.top + row * (s.h + s.gapY)}in;width:${s.w}in;height:${s.h}in`;
    if (!b) return `<div class="label" style="${pos}"></div>`;
    const where = showLocation && b.shelfLocation ? `<div class="where">${esc(b.shelfLocation)}</div>` : '';
    const series = b.series ? `<div class="series">${esc(b.series)}${b.seriesNumber ? ` #${esc(b.seriesNumber)}` : ''}</div>` : '';
    return `<div class="label" style="${pos}"><div class="qr">${qrSvg(bookLink(origin, b), { margin: 1 })}</div><div class="text">`
      + `${owner ? `<div class="owner">${esc(owner)}</div>` : ''}<div class="title">${esc(b.workTitle)}</div><div class="author">${esc(b.author)}</div>${big ? series : ''}${where}</div></div>`;
  };
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Book labels</title><style>
@page { size: letter; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; }
.page { position: relative; width: 8.5in; height: 11in; page-break-after: always; overflow: hidden; }
.page:last-child { page-break-after: auto; }
.label { position: absolute; display: flex; align-items: center; gap: ${big ? 0.15 : 0.08}in; padding: ${big ? '0.15in 0.2in' : '0.06in 0.12in'}; overflow: hidden; }
.qr { flex: none; width: ${big ? 1.6 : 0.82}in; height: ${big ? 1.6 : 0.82}in; }
.qr svg { width: 100%; height: 100%; display: block; }
.text { min-width: 0; line-height: 1.15; }
.owner { font-size: ${big ? 8 : 6}pt; text-transform: uppercase; letter-spacing: .06em; color: #777; }
.title { font-weight: 700; font-size: ${big ? 13 : 8}pt; display: -webkit-box; -webkit-line-clamp: ${big ? 3 : 2}; -webkit-box-orient: vertical; overflow: hidden; }
.author { font-size: ${big ? 10 : 6.5}pt; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.series, .where { font-size: ${big ? 9 : 6}pt; color: #777; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hint { font: 13px sans-serif; padding: 12px 16px; background: #fff7ed; border-bottom: 1px solid #fed7aa; }
@media print { .hint { display: none; } }
@media screen { body { background: #e5e7eb; } .page { background: #fff; margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.15); } .label { outline: 1px dashed #d1d5db; } }
</style></head><body>
<div class="hint">In the print window choose <b>Letter</b> paper, <b>Scale 100%</b> (or "Actual size") and <b>no margins</b>, then print on the label sheet. The dashed lines don't print.</div>
${pages.map(p => `<div class="page">${p.map(label).join('')}</div>`).join('\n')}
</body></html>`;
}
