# Personal Library

A self-hosted book-tracking web app: scan a book's barcode (or type the ISBN), and it's added to your shelves with cover art, author and edition details.

- **Frontend:** React + Vite (`App.jsx`, `src/main.jsx`, `index.html`)
- **Backend:** a small Node server (`server.js` + `server/`) with no third-party dependencies. It handles accounts, sign-in and each person's books, and serves the app.
- **Data:** one SQLite database file, `library.db`, saved in the folder set by `DATA_DIR` (`/data` in Docker). Back up that folder to back up everything.

## Accounts

- The first account created becomes the library's **Owner**; everyone after that is a **Member**.
- Every account is **Family** or **Friend**. Family can share shelves (Family Shelves, "Also on Mom's shelf") and use Family Challenges. Friends have their own library and all the personal features, but don't see the family features and are never shown to the family. The Owner chooses when creating an invite ("This person is: Family / A friend") and can change it any time in Settings → Accounts. Accounts that existed before this setting stay Family; people who sign up without an invite (when "anyone" is allowed) start as Friend.
- Each account has its own books. Nobody can see or change another person's books.
- Passwords are stored securely hashed (scrypt); sign-in uses a secure cookie that lasts 90 days.
- **Sign-ups are invite-only by default.** The Owner creates invite codes in Settings → Family accounts (each works once, valid 1/7/30 days) and sends the link (`https://your-server/?invite=CODE`), which fills in the code. Settings also lets the Owner switch to "anyone" or "nobody". Server default can be set with `SIGNUP_MODE=invite|open|closed`.

## Reading life

- On a book's page: **star rating** (1–5, halves allowed), **started/finished dates** (filled in automatically when you mark a book Reading or Completed) and **notes**.
- **My progress** (book page, while you're Reading it): the page you're on, the number of pages, **+10 / +25** buttons and a progress bar (also shown on the book's card). At the last page an **I finished it!** button marks it Finished.
- **My Shelves**: put books on your own shelves (e.g. "Beach reads", "Signed copies", "Book club") from a book's page. They're listed in the menu with counts; on a shelf's page you can **rename** or **remove** the shelf (the books stay). Searching also matches shelf names. Your own Goodreads shelves come along when you import, and the spreadsheet export includes them.
- **Re-reads**: on a Finished book, **Read it again** keeps the earlier read in the history and starts a new one. The book page shows "Read 2 times", and every finish counts in My Year and in challenges.
- **My quotes** (book page): save lines with their page number; **My Quotes** in the menu lists every quote, searchable, with a copy button.
- **Year in review** (on My Year, for any year): books, pages, authors, re-reads, favourite, longest book, first and latest, most-read author and busiest month, with a **Share** button.
- **My Year** (menu): books finished this year, a **yearly goal** with "ahead/behind schedule", books per month, pages, average rating, top author, and **Up next in your series**.
- Book lists have a **sort menu** (title, author, recently added, recently finished, rating, year published — remembered on each device) and **filters** (shelf, language, format, rating).

## Keeping your library safe

- **Undo**: after deleting a book, an **Undo** button appears for a few seconds.
- **Recently deleted** (Settings → My books): deleted books are kept for 30 days, with their notes, dates and covers. Put them back or delete them for good.
- **Find duplicates** (Settings → My books): books that are in the library twice (same ISBN, or same title and author). Pick the copy to keep and **Merge**: editions, notes, dates, ratings, quotes, shelves and more from every copy are combined; the extra copies go to Recently deleted. "Not duplicates" hides a pair on this device.
- **Select** (above any book list): tap books to select them, then change them all at once: reading status (dates fill in), add to a shelf, location, I own these / to wishlist, or delete.
- **Restore a backup** (Settings → Backups, Owner only): puts everyone's library back to that day. A copy of the library as it was just before is saved first and listed as "Just before a restore", so a restore can be undone the same way.

## Finding your way around

- **Home** (first screen): what you're reading (with progress), today's reading minutes with quick +10/+20/+30 buttons and your streak, your yearly goal, anything that needs you (recommendations, overdue loans, wishlist books available or on sale, new books from your authors), and recent activity from family & friends. Typing in the search box jumps to All Books.
- **Menu sections** (My Books, My Shelves, My Reading, People, Discover) fold and unfold with a tap on their title; each device remembers which are folded. A folded section shows a red dot if something inside needs you.
- **Settings → Menu**: untick items you don't use to hide them (per person, on every device).
- **Book page tabs**: My Reading (progress, dates, rating, notes, mood), About (description, genres, people you know, edition details), Review & Quotes, and Shelves & More (shelves, lending, collector details, borrow/buy, recommend, lists). The app remembers the last tab you used.

## About each book

- **About this book** (book page): the description, genres and average rating from other readers are filled in from Open Library and Google Books the first time you open a book (or all at once: **Settings → My books → Fill in descriptions & genres**). Below it, ratings and shared reviews from people you know.
- **My review**: separate from private notes; tick "Share with family & friends" to show it to others.
- **How it felt**: moods (dark, funny, hopeful…), pace (slow/medium/fast) and content warnings. Filters can use genre, mood and pace.
- **Did not finish**: a fourth reading status, with its own menu section (shown once you have one).
- **Reading updates**: while reading, post the page you're on with a thought ("Page 120: so creepy!"); they form a timeline on the book and appear in the activity feed.

## People (family and friends)

- **Activity** (menu): what everyone is starting, finishing, rating, reviewing and posting about, plus **Recommended for you** (with Add to wishlist / No thanks). Turn your own activity off in **Settings → Activity feed**; notes and private reviews are never shared.
- **Recommend to someone** (book page): send a book with a note; it lands in their Activity page.
- **Book Clubs** (menu): read a book together. See where each member is (from their own copy) and discuss it; posts about a page you haven't reached are hidden until you tap them.
- **Lists** (menu): ranked lists with notes ("Books to read before the movie"). Private by default; **Share** shows a list to everyone. Add books from any book page.
- **Discover** (menu): books people you know rated 4★+, and books in your favourite genres.
- **Follow** an author (Authors page): their new books appear in **New for You** even if you don't own any yet.
- **Reading Log** (menu): big +5/+10/+15/+30 minute buttons, a daily goal with stars, a reading streak (days you logged minutes, posted an update, moved your page or finished a book), and for family, this week's **family reading-time board**.
- **Gift Ideas** (menu, family only): tick "Share my wishlist with the family"; others can secretly mark "I'll get this" so nobody buys the same book. The wishlist's owner never sees the marks.

## Shopping & family

- **Own it?** (top bar): scan or type an ISBN in a shop to see whether you already own the book (any edition or language), whether it's on your wishlist, and whether someone in the family has it. Nothing is added unless you choose to.
- **Wishlist alerts** (Wishlist page): once a day the server checks whether wishlist books are available at your library on Libby right now (needs your library in Settings) and what the ebook costs on Google Play. Set **Let me know when the ebook is under $…** on a wishlist book's page. "Check now" runs it on demand.
- **Whole Shelf** (Add a book): scan one barcode after another without stopping; they collect in a list (books you already have and repeats are skipped), then **Add all** at once.
- **Shopping list** (Wishlist page): wishlist grouped by author with series numbers, **Got it!** buttons, and copy/share as text.
- **Lending** (book page): lend a book to someone (optionally with a **due back** date), mark it returned, keep the history; **Lent Out** in the menu lists what's out.
- **Overdue reminders**: books past their due date (or out for 30+ days with no date) show in a red box on All Books and Lent Out, and the Lent Out count turns red. **Send a reminder** opens the phone's share sheet (or copies a friendly message) to send by text or email.
- **Collector details** (book page): signed, first edition, condition, where/when bought and price. "Signed" / "1st edition" shows on the card, and the filters have a **Collector** option.
- **Borrow or buy** (book page): links to WorldCat (libraries near you), Bookshop.org, Amazon, Goodreads and Hardcover. Add your library in **Settings → My public library (Libby)** to get a **Borrow (Libby)** button.
- **Family Challenges** (menu): anyone can start a challenge (e.g. "10 books this summer"), and others can join. Each person's finished books between the dates are counted (re-reads too) on a shared progress board; only the counts are shown.
- **Family Shelves**: each person can turn on **Share my library with the family** in Settings. Others can then browse the books on their shelves (not notes or wishlists), and see "Also on Mom's shelf" on book pages and in Own it?.

## Discovery & import

- **New for You** (menu): new and upcoming English books from your 15 most-collected authors (Google Books) and from series you collect (Hardcover), leaving out books you already have. Add to wishlist or mark "Not interested" (remembered).
- **Import from Goodreads** (Settings → My books): choose your Goodreads export file; read books come in as finished with ratings, reviews and dates, "currently reading" as Reading, and "want to read" as wishlist (or on your shelf, or skipped). Series are taken from Goodreads titles; books you already have are skipped.

## Settings

- **Appearance:** Light, Dark or Match device (remembered on each device).

- **My books:** download your books as a spreadsheet (CSV, Goodreads-style columns).
- **Home screen:** install the app on a phone so it opens full-screen like a normal app (needs an `https://` address; on plain `http://` it works as a bookmark).
- **Change my password.**
- **Owner only:** family accounts (book counts, set a new password for someone, remove an account), turn new sign-ups on/off, and backups.

## Installing and updating on Unraid (one click)

The repository includes an Unraid template (`unraid/personal-library.xml`). Install it once from the Unraid terminal:

```
mkdir -p /boot/config/plugins/dockerMan/templates-user && wget -qO /boot/config/plugins/dockerMan/templates-user/my-personal-library.xml https://raw.githubusercontent.com/Joekr45/personal-library/main/unraid/personal-library.xml
```

Then remove the old container (`docker rm -f personal-library` — your books are safe in the appdata folder), go to **Docker → Add Container**, choose **personal-library** from the Template list and click **Apply**.
From then on, updates are on the Docker page: **Check for Updates**, then **apply update** next to Personal Library.

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
