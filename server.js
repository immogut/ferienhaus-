/**
 * Ferienhaus am Saaler Bodden – Webserver
 * Express-App mit öffentlichem One-Pager und passwortgeschütztem
 * Admin-Bereich zur Pflege des Buchungskalenders.
 *
 * Umgebungsvariablen (Railway → Variables):
 *   ADMIN_PASSWORD  Passwort für den Admin-Bereich (PFLICHT in Produktion)
 *   SESSION_SECRET  Zufälliger String für Session-Cookies
 *   BOOKING_EMAIL   E-Mail-Adresse für Buchungsanfragen
 *   DATA_DIR        Datenverzeichnis (Railway-Volume, z.B. /data)
 *   PORT            wird von Railway automatisch gesetzt
 */

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'aendern-bitte';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const BOOKING_EMAIL = process.env.BOOKING_EMAIL || 'info@ferienhaus-saaler-bodden.de';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bookings.json');

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD ist nicht gesetzt – bitte als Umgebungsvariable konfigurieren!');
}

// ---------- Datenhaltung (JSON-Datei) ----------
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    // Beim allerersten Start: mitgelieferte Startdaten übernehmen (z. B. auf ein Railway-Volume)
    const seedFile = path.join(__dirname, 'data', 'bookings.json');
    if (seedFile !== DATA_FILE && fs.existsSync(seedFile)) {
      fs.copyFileSync(seedFile, DATA_FILE);
      console.log('Startdaten aus data/bookings.json übernommen.');
    } else {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ bookings: [] }, null, 2));
    }
  }
}
function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { bookings: [] };
  }
}
function writeData(data) {
  ensureDataFile();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- Middleware ----------
app.set('trust proxy', 1); // Railway läuft hinter einem Proxy
app.use(express.json());
app.use(
  session({
    name: 'fsb.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      maxAge: 1000 * 60 * 60 * 8, // 8 Stunden
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Nicht angemeldet' });
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Einfache Bremse gegen Passwort-Raten
const loginAttempts = new Map();
function throttle(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (now < entry.until) return false;
  return true;
}
function registerAttempt(ip, success) {
  const entry = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  entry.count += 1;
  if (entry.count >= 5) {
    entry.until = Date.now() + 15 * 60 * 1000; // 15 Minuten Sperre
    entry.count = 0;
  }
  loginAttempts.set(ip, entry);
}

// ---------- Öffentliche API ----------
app.get('/api/config', (req, res) => {
  res.json({ bookingEmail: BOOKING_EMAIL });
});

// Belegte Zeiträume (öffentlich, ohne interne Notizen)
app.get('/api/bookings', (req, res) => {
  const data = readData();
  res.json(data.bookings.map(({ id, start, end, status }) => ({ id, start, end, status: status || 'belegt' })));
});

// ---------- Auth ----------
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (!throttle(ip)) {
    return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' });
  }
  const { password } = req.body || {};
  if (password && safeEqual(password, ADMIN_PASSWORD)) {
    registerAttempt(ip, true);
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  registerAttempt(ip, false);
  res.status(401).json({ error: 'Falsches Passwort' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ---------- Admin-API (geschützt) ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get('/api/admin/bookings', requireAuth, (req, res) => {
  res.json(readData().bookings);
});

app.post('/api/admin/bookings', requireAuth, (req, res) => {
  const { start, end, note, status } = req.body || {};
  if (!DATE_RE.test(start || '') || !DATE_RE.test(end || '')) {
    return res.status(400).json({ error: 'Ungültiges Datum (Format JJJJ-MM-TT)' });
  }
  if (end <= start) {
    return res.status(400).json({ error: 'Abreise muss nach der Anreise liegen' });
  }
  const st = ['belegt', 'angefragt'].includes(status) ? status : 'belegt';
  const data = readData();
  const overlap = data.bookings.find((b) => start < b.end && end > b.start);
  if (overlap) {
    return res
      .status(409)
      .json({ error: `Überschneidung mit vorhandenem Eintrag (${overlap.start} – ${overlap.end})` });
  }
  const booking = {
    id: crypto.randomUUID(),
    start,
    end,
    status: st,
    note: String(note || '').slice(0, 200),
    createdAt: new Date().toISOString(),
  };
  data.bookings.push(booking);
  data.bookings.sort((a, b) => a.start.localeCompare(b.start));
  writeData(data);
  res.status(201).json(booking);
});

// Status ändern (z. B. angefragt → belegt)
app.patch('/api/admin/bookings/:id', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!['belegt', 'angefragt'].includes(status)) {
    return res.status(400).json({ error: 'Ungültiger Status' });
  }
  const data = readData();
  const booking = data.bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  booking.status = status;
  writeData(data);
  res.json(booking);
});

app.delete('/api/admin/bookings/:id', requireAuth, (req, res) => {
  const data = readData();
  const before = data.bookings.length;
  data.bookings = data.bookings.filter((b) => b.id !== req.params.id);
  if (data.bookings.length === before) {
    return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  }
  writeData(data);
  res.json({ ok: true });
});

// ---------- Seiten ----------
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Ferienhaus-Website läuft auf Port ${PORT}`);
  console.log(`Datenablage: ${DATA_FILE}`);
});
