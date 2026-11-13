// Overdue lent books: past their "due back" date, or out for 30+ days when no date was set.
import { today, formatDate } from './reading.js';
import { currentLoan } from './matching.js';

export const LONG_LOAN_DAYS = 30;
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

export function loanStatus(loan, now = today()) {
  if (!loan || loan.returnedOn) return null;
  const daysOut = loan.lentOn ? daysBetween(loan.lentOn, now) : null;
  if (loan.dueOn) {
    const late = daysBetween(loan.dueOn, now);
    return { daysOut, overdue: late > 0, daysLate: Math.max(0, late), dueIn: -late };
  }
  return { daysOut, overdue: daysOut !== null && daysOut >= LONG_LOAN_DAYS, daysLate: 0, dueIn: null };
}

export function overdueBooks(books, now = today()) {
  return books
    .map(book => ({ book, loan: currentLoan(book) }))
    .filter(({ loan }) => loan && loanStatus(loan, now)?.overdue)
    .map(x => ({ ...x, status: loanStatus(x.loan, now) }))
    .sort((a, b) => (b.status.daysOut || 0) - (a.status.daysOut || 0));
}

export const reminderText = (book, loan, from) =>
  `Hi ${loan.to}! Just a friendly reminder about "${book.workTitle}" by ${book.author}` +
  `${loan.lentOn ? `, which I lent you on ${formatDate(loan.lentOn)}` : ''}. ` +
  `No rush, but could you bring it back when you're done?${from ? ` Thanks! – ${from}` : ' Thanks!'}`;

// Share sheet on phones; copy to the clipboard elsewhere. Returns 'shared' | 'copied' | 'failed'.
export async function shareOrCopy(text, title) {
  try {
    if (navigator.share) { await navigator.share({ title, text }); return 'shared'; }
  } catch (err) {
    if (err?.name === 'AbortError') return 'failed';
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}
