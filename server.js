require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
const SQLiteStore = require('connect-sqlite3')(session);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: './database' }),
  secret: 'olive-designs-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
}));

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const paymentRoutes = require('./routes/payments');
const { requireRole } = require('./middleware/auth');
const aiFlipRoutes = require('./routes/ai-flip');

app.use('/', authRoutes);
app.use('/api', projectRoutes);
app.use('/api', paymentRoutes);
app.use('/', aiFlipRoutes);

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect(req.session.role === 'designer' ? '/dashboard/designer' : '/dashboard/customer');
  res.sendFile('landing.html', { root: './views' });
});

app.get('/dashboard/customer', requireRole('customer'), (req, res) => res.sendFile('dashboard-customer.html', { root: './views' }));
app.get('/dashboard/designer', requireRole('designer'), (req, res) => res.sendFile('dashboard-designer.html', { root: './views' }));
app.get('/project/new', requireRole('customer'), (req, res) => res.sendFile('project-new.html', { root: './views' }));
app.get('/project/:id', (req, res) => res.sendFile('project-detail.html', { root: './views' }));
app.get('/designers', (req, res) => res.sendFile('designers.html', { root: './views' }));
app.get('/designer/:id', (req, res) => res.sendFile('designer-profile.html', { root: './views' }));
app.get('/notifications', (req, res) => res.sendFile('notifications.html', { root: './views' }));
app.get('/checkout/:id', requireRole('customer'), (req, res) => res.sendFile('checkout.html', { root: './views' }));

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, userId: req.session.userId, role: req.session.role, fullName: req.session.fullName });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Olive Designs running at http://localhost:${PORT}`));