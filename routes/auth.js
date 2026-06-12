const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database/db');

router.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.role === 'designer' ? '/dashboard/designer' : '/dashboard/customer');
  }
  res.sendFile('login.html', { root: './views' });
});

router.get('/signup', (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.role === 'designer' ? '/dashboard/designer' : '/dashboard/customer');
  }
  res.sendFile('signup.html', { root: './views' });
});

router.post('/signup', async (req, res) => {
  const { email, password, full_name, role } = req.body;
  if (!email || !password || !full_name || !role) return res.status(400).json({ error: 'All fields are required.' });
  if (!['customer', 'designer'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered.' });
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)').run(email, hash, role, full_name);
    const userId = result.lastInsertRowid;
    if (role === 'designer') db.prepare('INSERT INTO designer_profiles (user_id) VALUES (?)').run(userId);
    req.session.userId = userId;
    req.session.role = role;
    req.session.fullName = full_name;
    res.json({ success: true, role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.fullName = user.full_name;
    res.json({ success: true, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;