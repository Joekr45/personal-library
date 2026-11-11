// Automatic backups of the database: one copy a day in DATA_DIR/backups, keeping the last 7.
// Uses SQLite's "VACUUM INTO", which makes a clean, consistent copy even while the app is running.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const KEEP = 7;
const FILE_PATTERN = /^library-(\d{4}-\d{2}-\d{2})\.db$/;

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

export function createBackups({ db, dataDir }) {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const list = () => fs.readdirSync(dir)
    .filter(f => FILE_PATTERN.test(f))
    .sort()
    .reverse()
    .map(f => ({ file: f, date: f.match(FILE_PATTERN)[1], bytes: fs.statSync(path.join(dir, f)).size }));

  // Make today's backup (replacing an earlier one from today) and delete the oldest beyond 7.
  const backupNow = () => {
    const date = new Date().toISOString().slice(0, 10);
    const target = path.join(dir, `library-${date}.db`);
    fs.rmSync(target, { force: true });
    db.exec(`VACUUM INTO ${sqlString(target)}`);
    for (const old of list().slice(KEEP)) fs.rmSync(path.join(dir, old.file), { force: true });
    return list()[0];
  };

  // A fresh copy for downloading; the caller deletes it afterwards.
  const freshCopy = () => {
    const target = path.join(os.tmpdir(), `personal-library-${crypto.randomUUID()}.db`);
    db.exec(`VACUUM INTO ${sqlString(target)}`);
    return target;
  };

  // Back up once at start (if there's no backup for today yet) and then every 24 hours.
  const start = () => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (!list().some(b => b.date === today)) backupNow();
    } catch (err) {
      console.error('Backup failed:', err.message);
    }
    setInterval(() => {
      try { backupNow(); } catch (err) { console.error('Backup failed:', err.message); }
    }, 24 * 60 * 60 * 1000).unref();
  };

  return { list, backupNow, freshCopy, start };
}
