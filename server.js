import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 80;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

app.use(express.json({ limit: '10mb' }));

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
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    res.json({ success: true, user: newUser });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save user' });
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
    const libraryData = req.body;
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(libraryData, null, 2), 'utf8');
    res.json({ success: true });
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
  console.log(`Server running on port ${PORT}`);
});
