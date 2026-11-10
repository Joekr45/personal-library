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

app.use(express.json());

// Ensure data directory and users.json file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]), 'utf8');
}

// 1. Get all registered users
app.get('/api/users', (req, res) => {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    res.json(JSON.parse(data || '[]'));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read users' });
  }
});

// 2. Register a new user
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

// 3. Serve the built React frontend
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
