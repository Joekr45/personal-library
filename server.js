// Entry point: starts the Personal Library server.
//
// Settings (environment variables):
//   PORT                port to listen on (default 80)
//   DATA_DIR            folder where the database is saved (default ./data; /data in Docker)
//   SIGNUP_MODE         who can create accounts: "invite" (default: needs an invite code from the Owner),
//                       "open" (anyone) or "closed" (nobody). The first account can always be created,
//                       and the Owner can change this in Settings.
//   ALLOW_REGISTRATION  older setting: "false" is the same as SIGNUP_MODE=closed
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
  signupMode: process.env.SIGNUP_MODE || (ALLOW_REGISTRATION ? 'invite' : 'closed'),
  googleApiKey: process.env.GOOGLE_BOOKS_API_KEY || '',
  startBackups: true
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
