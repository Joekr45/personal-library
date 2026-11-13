// Working without signal.
// - A copy of your library is kept on this device, so the app still opens (and "Own it?" still
//   works) with no connection.
// - Changes made while offline wait in an "outbox" and are sent when the connection is back.

const SNAPSHOT = 'pl_offline_library';
const OUTBOX = 'pl_offline_outbox';
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

export const isNetworkError = (err) => err && err.status === 0;

export const saveSnapshot = (user, books) => write(SNAPSHOT, { user, books, savedAt: new Date().toISOString() });
export const loadSnapshot = () => read(SNAPSHOT, null);
export const pendingChanges = () => read(OUTBOX, []);
export const clearOffline = () => { try { localStorage.removeItem(SNAPSHOT); localStorage.removeItem(OUTBOX); } catch { /* fine */ } };

// Remember a change to send later: { type: 'create', tempId, book } | { type: 'update', id, changes } | { type: 'delete', id }
export function queueChange(op) {
  const box = pendingChanges();
  // Several edits to the same book become one.
  const last = box[box.length - 1];
  if (op.type === 'update' && last?.type === 'update' && last.id === op.id) last.changes = { ...last.changes, ...op.changes };
  else if (op.type === 'update' && box.some(o => o.type === 'create' && o.tempId === op.id)) {
    const create = box.find(o => o.type === 'create' && o.tempId === op.id);
    create.book = { ...create.book, ...op.changes };
  } else if (op.type === 'delete' && box.some(o => o.type === 'create' && o.tempId === op.id)) {
    // Added and deleted while offline: nothing to send.
    write(OUTBOX, box.filter(o => o.tempId !== op.id && o.id !== op.id));
    return;
  } else box.push({ ...op, at: Date.now() });
  write(OUTBOX, box);
}

// Send the waiting changes, oldest first. Stops (keeping the rest) if the connection drops again.
// Returns { sent, failed, idMap } — idMap maps temporary ids of offline-added books to real ones.
export async function sendPending(api) {
  const box = pendingChanges();
  const idMap = {};
  let sent = 0;
  let failed = 0;
  while (box.length) {
    const op = box[0];
    const id = idMap[op.id] || op.id;
    try {
      if (op.type === 'create') {
        const saved = await api.createBook(op.book);
        idMap[op.tempId] = saved.id;
      } else if (op.type === 'update') {
        if (!String(id).startsWith('temp-')) await api.updateBook(id, op.changes);
      } else if (op.type === 'delete') {
        if (!String(id).startsWith('temp-')) await api.deleteBook(id);
      }
      sent++;
    } catch (err) {
      if (isNetworkError(err)) break; // still offline: try again later
      failed++; // the server refused it (e.g. the book was deleted elsewhere): drop it
    }
    box.shift();
    write(OUTBOX, box);
  }
  return { sent, failed, idMap, remaining: box.length };
}
