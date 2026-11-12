# Personal Library

A self-hosted book-tracking web app: scan a book's barcode (or type the ISBN), and it's added to your shelves with cover art, author and edition details.

- **Frontend:** React + Vite (`App.jsx`, `src/main.jsx`, `index.html`)
- **Backend:** a small Node server (`server.js` + `server/`) with no third-party dependencies. It handles accounts, sign-in and each person's books, and serves the app.
- **Data:** one SQLite database file, `library.db`, saved in the folder set by `DATA_DIR` (`/data` in Docker). Back up that folder to back up everything.

## Accounts

- The first account created becomes the library's **Owner**; everyone after that is a **Member**.
- Each account has its own books. Nobody can see or change another person's books.
- Passwords are stored securely hashed (scrypt); sign-in uses a secure cookie that lasts 90 days.
- To stop new people from signing up, set the environment variable `ALLOW_REGISTRATION=false`.

## Reading life

- On a book's page: **star rating** (1–5, halves allowed), **started/finished dates** (filled in automatically when you mark a book Reading or Completed) and **notes**.
- **My Year** (menu): books finished this year, a **yearly goal** with "ahead/behind schedule", books per month, pages, average rating, top author, and **Up next in your series**.
- Book lists have a **sort menu** (title, author, recently added, recently finished, rating, year published — remembered on each device) and **filters** (shelf, language, format, rating).

## Shopping & family

- **Own it?** (top bar): scan or type an ISBN in a shop to see whether you already own the book (any edition or language), whether it's on your wishlist, and whether someone in the family has it. Nothing is added unless you choose to.
- **Shopping list** (Wishlist page): wishlist grouped by author with series numbers, **Got it!** buttons, and copy/share as text.
- **Lending** (book page): lend a book to someone, mark it returned, keep the history; **Lent Out** in the menu lists what's out.
- **Family Shelves**: each person can turn on **Share my library with the family** in Settings. Others can then browse the books on their shelves (not notes or wishlists), and see "Also on Mom's shelf" on book pages and in Own it?.

## Settings

- **My books:** download your books as a spreadsheet (CSV, Goodreads-style columns).
- **Home screen:** install the app on a phone so it opens full-screen like a normal app (needs an `https://` address; on plain `http://` it works as a bookmark).
- **Change my password.**
- **Owner only:** family accounts (book counts, set a new password for someone, remove an account), turn new sign-ups on/off, and backups.

## Backups

Every day the server saves a copy of the database to `DATA_DIR/backups` (keeping the last 7). The owner can also make one on demand or download a full copy from Settings. Covers are in `DATA_DIR/covers`. Backing up the whole `/mnt/user/appdata/personal-library` folder (e.g. with the Appdata Backup plugin) covers everything.

## Adding books

The **Add** button opens one window with three ways to add a book:

- **Scan** the barcode with the phone/computer camera.
- **Type ISBN** (10 or 13 digits, from the copyright page or near the barcode).
- **Find by Title** (title and/or author), then pick the right match.

Lookups are done by the server, which asks **Open Library** and **Google Books** at the same time and combines the answers (Google often has new releases before Open Library). Optional: set `GOOGLE_BOOKS_API_KEY` to raise Google's daily limit.

Older mass-market paperbacks often have a 12-digit **store barcode (UPC)** on the back instead of the ISBN barcode. The app recognises these and explains where to find the real ISBN.

## Author search

**Authors** in the menu: search any author (or tap an author's name on any book) to see everything they've written.
Books you own are shown first, in colour with your own cover; books you don't own are greyed out, and wishlist books carry a heart.
Tap a grey book to add it to your wishlist, say you own it (the usual cover/language card opens), or **hide** it from the list if it isn't a real book.

The bibliography combines Open Library (works in English, one entry per book; translations and box sets/study guides are left out) with Google Books (for new releases). Hidden entries are remembered per person.

## Series (with Hardcover)

Series information comes from **Hardcover** (hardcover.app), which knows series far better than the free catalogs.
The library **Owner** connects it once: **Settings → Hardcover** → paste the API code from https://hardcover.app/account/api.
The code is stored only on the server (in the database), never sent to browsers.

When connected:
- New books are put in their series automatically (by ISBN, or title + author).
- The **Series** page has a **Find series for N books** button to fill in books added earlier.
- Each series is shown in reading order (#1, #2, #3…), with books you don't have greyed out; tap one to add it to your wishlist or say you own it.

Without Hardcover the Series page still works from series you type in (Edit), and shows gaps in the numbering.

## Covers

Whenever a book is added (scan, ISBN, title search or typed in) you can **Change cover**: the app shows every cover it can find for that book, labelled by edition (language, year, publisher), with **This edition** first. You can also use a **photo of your own copy** or **paste a link** to a picture. Every book's page has a **Change cover** button too.

The chosen cover is downloaded and **saved on the server** (`DATA_DIR/covers`), so it never disappears or changes. Only the book's owner can see its saved cover.

Camera scanning needs a browser that allows camera access (on phones this usually means an `https://` address) and uses the browser's built-in barcode reader where available (Android/Chrome), falling back to ZXing elsewhere.

## How updates reach the server

1. A change is merged into the `main` branch on GitHub.
2. GitHub Actions (`.github/workflows/docker-image.yml`) builds a Docker image and publishes it as
   `ghcr.io/joekr45/personal-library:latest`.
3. On Unraid, click **Update** on the container (or "Check for Updates" on the Docker tab).

## Installing on Unraid

Docker tab → **Add Container**, then fill in:

| Field | Value |
|---|---|
| Name | `personal-library` |
| Repository | `ghcr.io/joekr45/personal-library:latest` |
| Port | Container port `80` → Host port `8085` |
| Path | Container path `/data` → Host path `/mnt/user/appdata/personal-library` |

Your data lives in `/mnt/user/appdata/personal-library` and survives updates and restarts.

## Running it on a computer for development

Requires Node.js 22.13 or newer.

```
npm install
npm test               # run the server's automated checks
npm run build
DATA_DIR=./data PORT=3000 npm start
```

Then open http://localhost:3000. For live-reloading while editing the screens, run `npm run dev:server` and `npm run dev` in two terminals and open http://localhost:3000.
