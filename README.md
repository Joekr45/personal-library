# Personal Library

A self-hosted book-tracking web app: scan a book's barcode (or type the ISBN), and it's added to your shelves with cover art, author and edition details.

- **Frontend:** React + Vite (`App.jsx`, `src/main.jsx`, `index.html`)
- **Backend:** a small Express server (`server.js`) that serves the app and saves data
- **Data:** two JSON files, `users.json` and `library.json`, saved in the folder set by `DATA_DIR` (`/data` in Docker)

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

```
npm install
npm run build
DATA_DIR=./data PORT=3000 node server.js
```

Then open http://localhost:3000.
