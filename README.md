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
