// Database layer. Uses SQLite through Node's built-in `node:sqlite` module,
// so there is nothing extra to install. Everything lives in one file: DATA_DIR/library.db
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 4;

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'library.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get();
  if (current >= SCHEMA_VERSION) return;

  db.exec('BEGIN');
  try {
    if (current < 1) {
      db.exec(`
        CREATE TABLE users (
          id            TEXT PRIMARY KEY,
          email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          display_name  TEXT NOT NULL,
          role          TEXT NOT NULL DEFAULT 'Member',
          color         TEXT NOT NULL,
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL
        );
        CREATE INDEX sessions_user ON sessions(user_id);

        -- Each book belongs to exactly one user. The book's details (title, author,
        -- editions, cover, status...) are stored as JSON in "data" so new fields can be
        -- added later without changing the table.
        CREATE TABLE books (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          data       TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX books_user ON books(user_id);
      `);
    }
    if (current < 2) {
      db.exec(`
        -- Books someone chose to hide from an author's bibliography (box sets, junk entries...).
        CREATE TABLE hidden_author_books (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          author_key TEXT NOT NULL,
          book_id    TEXT NOT NULL,
          PRIMARY KEY (user_id, author_key, book_id)
        );
      `);
    }
    if (current < 3) {
      db.exec(`
        -- Library-wide settings (e.g. the Hardcover connection), set by the Owner.
        CREATE TABLE settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    }
    if (current < 4) {
      db.exec(`
        -- Invite codes the Owner hands out; each lets one person create an account.
        CREATE TABLE invites (
          code       TEXT PRIMARY KEY,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          note       TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL,
          used_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
          used_at    TEXT
        );
      `);
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
