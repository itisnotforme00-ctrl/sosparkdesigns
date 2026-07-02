require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const path      = require('path');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ── B4: Env-var validation on boot ──
// The root cause documented in the project brief (a placeholder MONGODB_URI
// silently breaking login for hours) happened because nothing checked env
// values against known placeholder patterns from .env.example. This check
// runs once at boot, logs loudly to the console, and is also exposed via
// /api/health so the admin panel (or anyone curling it) can see it without
// SSH access to the server's console output. This is intentionally the
// highest-leverage fix in this PR — it converts silent multi-hour failures
// into immediate, obvious ones.
function checkEnvPlaceholders() {
  const issues = [];

  const mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri) {
    issues.push('MONGODB_URI is not set — falling back to local mongodb://127.0.0.1:27017/sosparkdesign.');
  } else if (/YOUR_PASSWORD/i.test(mongoUri)) {
    issues.push('MONGODB_URI still contains the placeholder "YOUR_PASSWORD" — replace it with your real MongoDB credentials.');
  }

  const jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret) {
    issues.push('JWT_SECRET is not set — auth is falling back to an insecure built-in default. Set a real secret before production use.');
  }

  const groqSingle = process.env.GROQ_API_KEY || '';
  const groqMulti  = process.env.GROQ_API_KEYS || '';
  if (!groqSingle && !groqMulti) {
    issues.push('No GROQ_API_KEY or GROQ_API_KEYS set — the chat feature will not work.');
  } else if (/your_groq_key_here/i.test(groqSingle) || /your_groq_key_here/i.test(groqMulti)) {
    issues.push('GROQ_API_KEY / GROQ_API_KEYS still contains the placeholder "your_groq_key_here" — replace it with a real key.');
  }

  if (!process.env.API_KEY_ENCRYPTION_SECRET) {
    issues.push('API_KEY_ENCRYPTION_SECRET is not set — the API key pool (admin panel) is falling back to JWT_SECRET (or an insecure default) to encrypt stored provider keys. Set a dedicated secret for production.');
  }

  return issues;
}

const envIssues = checkEnvPlaceholders();
if (envIssues.length > 0) {
  console.error('\n⚠️   ENVIRONMENT CONFIGURATION WARNINGS:');
  envIssues.forEach(issue => console.error('    - ' + issue));
  console.error('    Fix these in .env and restart the server — see /api/health for the same list.\n');
}

// ── Security ──
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ── Rate limiting ──
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use('/api/chat', rateLimit({ windowMs: 60 * 1000, max: 60 }));

// ── Middleware ──
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files ──
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// ── MongoDB with retry + IPv4 fallback ──
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sosparkdesign';

async function connectMongo(retries = 4, delay = 1500) {
  for (let i = 1; i <= retries; i++) {
    try {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 10000,
        family: 4, // Force IPv4 — fixes ECONNREFUSED on many systems
      });
      console.log('✅  MongoDB connected:', mongoose.connection.host);
      return;
    } catch (err) {
      console.error(`❌  MongoDB attempt ${i}/${retries} failed: ${err.message}`);
      if (i === retries) {
        console.error('⚠️   Running WITHOUT database — admin panel will show diagnostic.');
        return;
      }
      // Exponential backoff
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i - 1)));
    }
  }
}

connectMongo();

// ── DB status endpoint (for admin panel diagnostics) ──
app.get('/api/health', (req, res) => {
  const state = mongoose.connection.readyState;
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({
    db: states[state] || 'unknown',
    dbState: state,
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
    envWarnings: envIssues, // B4 — same placeholder/missing-var checks run at boot
  });
});

// ── API Routes ──
app.use('/api/chat',         require('./routes/chat'));
app.use('/api/contact',      require('./routes/contact'));
app.use('/api/portfolio',    require('./routes/portfolio'));
app.use('/api/services',     require('./routes/services'));
app.use('/api/team',         require('./routes/team'));
app.use('/api/testimonials', require('./routes/testimonials'));
app.use('/api/faq',          require('./routes/faq'));
app.use('/api/offers',       require('./routes/offers'));
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/apikeys',      require('./routes/apikeys')); // B6 — admin-only key pool CRUD

// ── SPA catch-alls ──
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, '../admin/dashboard.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀  SoSpark Design → http://localhost:${PORT}`));
