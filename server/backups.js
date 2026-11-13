// Automatic backups of the database: one copy a day in DATA_DIR/backups, keeping the last 7.
// Uses SQLite's "VACUUM INTO", which makes a clean, consistent copy even while the app is running.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const KEEP = 7;
const FILE_PATTERN = /^library-(\d{4}-\d{2}-\d{2})\.db$/;
// Made automatically just before a restore, so the restore itself can be undone.
const SAFETY_PATTERN = /^library-before-restore-(\d{13})\.db$/;
const KEEP_SAFETY = 3;

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

export function createBackups({ db, dataDir }) {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const daily = () => fs.readdirSync(dir)
    .filter(f => FILE_PATTERN.test(f))
    .sort()
    .reverse()
    .map(f => ({ file: f, date: f.match(FILE_PATTERN)[1], bytes: fs.statSync(path.join(dir, f)).size }));
  const safety = () => fs.readdirSync(dir)
    .filter(f => SAFETY_PATTERN.test(f))
    .sort()
    .reverse()
    .map(f => {
      const at = new Date(Number(f.match(SAFETY_PATTERN)[1]));
      return { file: f, date: at.toISOString().slice(0, 10), at: at.toISOString(), beforeRestore: true, bytes: fs.statSync(path.join(dir, f)).size };
    });
  const list = () => [...daily(), ...safety()];

  // Make today's backup (replacing an earlier one from today) and delete the oldest beyond 7.
  const backupNow = () => {
    const date = new Date().toISOString().slice(0, 10);
    const target = path.join(dir, `library-${date}.db`);
    fs.rmSync(target, { force: true });
    db.exec(`VACUUM INTO ${sqlString(target)}`);
    for (const old of daily().slice(KEEP)) fs.rmSync(path.join(dir, old.file), { force: true });
    return daily()[0];
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
      if (!daily().some(b => b.date === today)) backupNow();
    } catch (err) {
      console.error('Backup failed:', err.message);
    }
    setInterval(() => {
      try { backupNow(); } catch (err) { console.error('Backup failed:', err.message); }
    }, 24 * 60 * 60 * 1000).unref();
  };

  // Put the library back to how it was in one of the backups. A safety copy of the library as it
  // is now is made first. Everyone stays signed in (unless their account didn't exist back then).
  const restore = (file) => {
    if (!list().some(b => b.file === file)) throw new Error('That backup was not found.');
    const source = path.join(dir, file);
    db.exec(`VACUUM INTO ${sqlString(path.join(dir, `library-before-restore-${Date.now()}.db`))}`);
    for (const old of safety().slice(KEEP_SAFETY)) fs.rmSync(path.join(dir, old.file), { force: true });
    db.exec(`ATTACH DATABASE ${sqlString(source)} AS bk`);
    try {
      const tables = db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
        .map(r => r.name).filter(n => n !== 'sessions');
      const inBackup = new Set(db.prepare("SELECT name FROM bk.sqlite_master WHERE type = 'table'").all().map(r => r.name));
      const columns = (schema, table) => db.prepare(`PRAGMA ${schema}.table_info("${table}")`).all().map(c => c.name);
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec('BEGIN');
      try {
        for (const t of tables) {
          db.exec(`DELETE FROM main."${t}"`);
          if (!inBackup.has(t)) continue; // an older backup: newer features start empty
          const old = new Set(columns('bk', t));
          const cols = columns('main', t).filter(c => old.has(c)).map(c => `"${c}"`).join(', ');
          if (cols) db.exec(`INSERT INTO main."${t}" (${cols}) SELECT ${cols} FROM bk."${t}"`);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      } finally {
        db.exec('PRAGMA foreign_keys = ON');
      }
    } finally {
      db.exec('DETACH DATABASE bk');
    }
    db.exec('DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)');
  };

  return { list, backupNow, freshCopy, start, restore };
}
