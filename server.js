import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 80;
// Where users.json and library.json are saved. In Docker this is /data,
// which must be mapped to a folder on the host (e.g. Unraid appdata) so it survives updates.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

app.use(express.json({ limit: '10mb' }));

// Write a file safely: write to a temporary file first, then rename it into place.
// If the server stops mid-write, the original file is left intact instead of half-written.
function writeJsonSafely(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// Ensure data directory and data files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]), 'utf8');
}
if (!fs.existsSync(LIBRARY_FILE)) {
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify({}), 'utf8');
}

// 1. User Auth Endpoints
app.get('/api/users', (req, res) => {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    res.json(JSON.parse(data || '[]'));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read users' });
  }
});

app.post('/api/register', (req, res) => {
  try {
    const newUser = req.body;
    if (!newUser || !newUser.email || !newUser.password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(data || '[]');
    const existingIndex = users.findIndex(u => u.email.toLowerCase() === newUser.email.toLowerCase());
    if (existingIndex >= 0) {
      users[existingIndex] = newUser;
    } else {
      users.push(newUser);
    }
    writeJsonSafely(USERS_FILE, users);
    res.json({ success: true, user: newUser });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save user' });
  }
});
app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(data || '[]');
    const user = users.find(
      u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to authenticate user' });
  }
});
// 2. Shared Library Sync Endpoints
app.get('/api/library', (req, res) => {
  try {
    const data = fs.readFileSync(LIBRARY_FILE, 'utf8');
    res.json(JSON.parse(data || '{}'));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load library data' });
  }
});

app.post('/api/library', (req, res) => {
  try {
    const incomingData = req.body;
    let currentData = {};
    try {
      currentData = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8') || '{}');
    } catch (e) {
      currentData = {};
    }

    const mergedData = { ...currentData, ...incomingData };
    writeJsonSafely(LIBRARY_FILE, mergedData);
    res.json({ success: true, library: mergedData });
  } catch (err) {
    res.status(500).json({ error: 'Failed to persist library data' });
  }
});

// 3. Serve Built React Frontend
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}, saving data in ${DATA_DIR}`);
});
