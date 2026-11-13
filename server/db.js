// Database layer. Uses SQLite through Node's built-in `node:sqlite` module,
// so there is nothing extra to install. Everything lives in one file: DATA_DIR/library.db
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 7;

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
    if (current < 5) {
      db.exec(`
        -- Family reading challenges ("Read 10 books this summer") and who has joined them.
        CREATE TABLE challenges (
          id         TEXT PRIMARY KEY,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          name       TEXT NOT NULL,
          target     INTEGER NOT NULL,
          starts_on  TEXT NOT NULL,
          ends_on    TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE challenge_members (
          challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          joined_at    TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (challenge_id, user_id)
        );
      `);
    }
    if (current < 6) {
      db.exec(`
        -- Each account is Family or Friend. Only Family use the family features (shared shelves, challenges).
        -- Accounts that already existed stay Family, as before.
        ALTER TABLE users ADD COLUMN circle TEXT NOT NULL DEFAULT 'family';
        ALTER TABLE invites ADD COLUMN circle TEXT NOT NULL DEFAULT 'family';
      `);
    }
    if (current < 7) {
      db.exec(`
        -- Activity feed: "Mom finished Rebecca ★★★★★"
        CREATE TABLE activity (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type       TEXT NOT NULL,
          book_id    TEXT,
          book       TEXT NOT NULL,
          detail     TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX activity_by_time ON activity(created_at);
        -- "I think you'd like this": a book sent from one person to another.
        CREATE TABLE recommendations (
          id         TEXT PRIMARY KEY,
          from_user  TEXT REFERENCES users(id) ON DELETE CASCADE,
          to_user    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          book       TEXT NOT NULL,
          note       TEXT,
          status     TEXT NOT NULL DEFAULT 'new',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        -- Book clubs / buddy reads, who's in them, and their discussion.
        CREATE TABLE clubs (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          book       TEXT NOT NULL,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE club_members (
          club_id   TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
          user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          joined_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (club_id, user_id)
        );
        CREATE TABLE club_posts (
          id         TEXT PRIMARY KEY,
          club_id    TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text       TEXT NOT NULL,
          page       INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        -- Book lists ("Best beach reads"), private or shared.
        CREATE TABLE lists (
          id          TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name        TEXT NOT NULL,
          description TEXT,
          is_public   INTEGER NOT NULL DEFAULT 0,
          items       TEXT NOT NULL DEFAULT '[]',
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        -- Minutes read per day (reading log) and days with any reading (streaks).
        CREATE TABLE reading_log (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          day     TEXT NOT NULL,
          minutes INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, day)
        );
        CREATE TABLE reading_days (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          day     TEXT NOT NULL,
          PRIMARY KEY (user_id, day)
        );
        -- "I'm getting this as a gift" marks on family wishlists (never shown to the wishlist's owner).
        CREATE TABLE gift_claims (
          book_id    TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
          claimed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
