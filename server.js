// Entry point: starts the Personal Library server.
//
// Settings (environment variables):
//   PORT                port to listen on (default 80)
//   DATA_DIR            folder where the database is saved (default ./data; /data in Docker)
//   ALLOW_REGISTRATION  "false" to stop new people from creating accounts (the first account can always be created)
//   GOOGLE_BOOKS_API_KEY optional; raises Google Books' daily lookup limit
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './server/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 80;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';

const server = createServer({
  dataDir: DATA_DIR,
  distDir: path.join(__dirname, 'dist'),
  allowRegistration: ALLOW_REGISTRATION,
  googleApiKey: process.env.GOOGLE_BOOKS_API_KEY || ''
});

server.listen(PORT, () => {
  console.log(`Personal Library running on port ${PORT}, saving data in ${DATA_DIR}`);
});

// Shut down cleanly when Docker stops the container, so the database closes properly.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
