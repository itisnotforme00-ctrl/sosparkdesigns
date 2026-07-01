require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const path      = require('path');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

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
