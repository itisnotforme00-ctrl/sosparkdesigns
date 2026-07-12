require('dotenv').config();
const dns             = require('dns');
const express         = require('express');
const mongoose        = require('mongoose');
const cors            = require('cors');
const path            = require('path');
const helmet          = require('helmet');
const rateLimit       = require('express-rate-limit');
const analyticsLogger = require('./middleware/analyticsLogger');
const { UPLOAD_DIR }  = require('./middleware/upload'); // also ensures the upload dir exists at boot
const { ErrorLog, Portfolio } = require('./models');

// ── DNS override ──
// Required on this deployment's network: the standard mongodb+srv://
// connection string does a DNS SRV lookup to discover the Atlas cluster's
// real hosts, and that lookup fails against this ISP's default resolver.
// Pointing Node's DNS resolution at Google's public DNS fixes it. This must
// run before mongoose.connect() below (SRV resolution happens at connect
// time), and before anything else in this file that might trigger a DNS
// lookup. Keep this in place in any future version of server.js — it's an
// operational requirement of this deployment's network, not a
// temporary/debug workaround.
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();

// ── Trust proxy ──
// REQUIRED for express-rate-limit (and any other IP-based logic) to see the
// real client IP instead of a reverse proxy's IP, if this app is deployed
// behind one (Nginx, a load balancer, Cloudflare, Render/Heroku's router,
// etc). Without this, EVERY rate limiter in this file silently either
// throttles all visitors as a single IP, or breaks outright — including the
// login brute-force limiter below, which defeats its whole purpose.
//
// Deliberately NOT set to `true` unconditionally — that trusts the
// left-most X-Forwarded-For hop unconditionally, which is spoofable by the
// client itself if there's no proxy actually in front of the app. Set
// TRUST_PROXY_HOPS in .env to the exact number of proxies you have in front
// of this app (usually 1). Defaults to not trusting any proxy, which is the
// safe default for direct/local deployment.
const trustProxyHops = parseInt(process.env.TRUST_PROXY_HOPS, 10);
if (!Number.isNaN(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// ── B4: Env-var validation on boot ──
// The root cause documented in the project brief (a placeholder MONGODB_URI
// silently breaking login for hours) happened because nothing checked env
// values against known placeholder patterns from .env.example. This check
// runs once at boot, logs loudly to the console, and is also exposed via
// /api/health so the admin panel (or anyone curling it) can see it without
// SSH access to the server's console output.
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

  if (Number.isNaN(trustProxyHops) || trustProxyHops <= 0) {
    issues.push('TRUST_PROXY_HOPS is not set — if this app runs behind any reverse proxy/load balancer, rate limiting will not see real client IPs. Set TRUST_PROXY_HOPS to the number of proxies in front of this app (usually 1) if applicable.');
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

// Dedicated, much tighter limiter for login — the generic 200/15min limit
// above is shared across ALL API traffic and is nowhere near strict enough
// to stop credential-stuffing against admin accounts on its own.
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
}));

// Public write endpoints — spam-prone in a way GET endpoints aren't.
app.use('/api/testimonials/submit', rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false }));
app.use('/api/contact', rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }));

// Video uploads are expensive (disk + bandwidth) even from a trusted admin
// session — worth throttling independent of the role check itself.
app.use('/api/videos/upload', rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }));

// ── Middleware ──
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
// Raised from the previous 10kb: that limit only left room for roughly
// 150-175 pasted API keys before B6's own "bulk-add large batches" feature
// started rejecting legitimate requests with an opaque 413. 1mb comfortably
// covers thousands of keys or a long-form blog post; actual video files
// never pass through this parser at all (multer reads multipart/form-data
// directly, off the request stream, bypassing express.json entirely).
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Visitor analytics (feature 2) ──
// Must run before express.static below, since it only attaches a
// res.on('finish') listener and calls next() — it doesn't consume the
// response, so static file serving still works exactly as before.
app.use(analyticsLogger);

// ── SEO: clean URLs, no .html extension in the address bar ──
app.get(/^\/([^/.]+)\.html$/, (req, res) => {
  const name = req.params[0];
  const clean = name === 'index' ? '/' : `/${name}`;
  const queryIndex = req.url.indexOf('?');
  const query = queryIndex !== -1 ? req.url.slice(queryIndex) : '';
  res.redirect(301, clean + query);
});

// ── Static files ──
app.use(express.static(path.join(__dirname, '../frontend'), { extensions: ['html'], index: 'index.html' }));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// ── Uploaded video files ──
// express.static (via the underlying 'send' module) already supports HTTP
// Range requests out of the box, so video scrubbing/seeking works with no
// extra streaming code here. Only files that exist on disk under UPLOAD_DIR
// are servable — there's no directory listing, and filenames are always the
// server-generated random names from middleware/upload.js, never
// user-supplied paths.
app.use('/uploads/videos', express.static(UPLOAD_DIR));

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

// ── SEO: sitemap.xml + robots.txt ──
const SITE_URL = (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

const STATIC_PAGES = ['/', '/about', '/services', '/portfolio', '/team', '/faq', '/reviews', '/contact'];

app.get('/sitemap.xml', async (req, res) => {
  try {
    const { Portfolio } = require('./models');
    const staticUrls = STATIC_PAGES.map(p => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n');

    let portfolioUrls = '';
    if (mongoose.connection.readyState === 1) {
      const projects = await Portfolio.find().select('slug updatedAt').lean();
      portfolioUrls = projects
        .map(p => `  <url><loc>${SITE_URL}/portfolio/${p.slug}</loc><lastmod>${p.updatedAt.toISOString().slice(0,10)}</lastmod></url>`)
        .join('\n');
    }

    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls}\n${portfolioUrls}\n</urlset>`);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});

app.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

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
app.use('/api/blog',         require('./routes/blog'));
app.use('/api/services',     require('./routes/services'));
app.use('/api/team',         require('./routes/team'));
app.use('/api/testimonials', require('./routes/testimonials'));
app.use('/api/faq',          require('./routes/faq'));
app.use('/api/offers',       require('./routes/offers'));
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/apikeys',      require('./routes/apikeys'));    // B6 — admin-only key pool CRUD
app.use('/api/analytics',    require('./routes/analytics'));  // feature 2 — visitor analytics + dashboard stats
app.use('/api/settings',     require('./routes/settings'));   // feature 1 — editable content/config without redeploy
app.use('/api/admins',       require('./routes/admins'));     // feature 4 — multi-admin & role management
app.use('/api/videos',       require('./routes/videos'));     // new — server-stored + YouTube-linked videos

// ── SPA catch-alls ──
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, '../admin/dashboard.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// ── Global error handler ──
// feature 1: also persist errors to ErrorLog so the monitoring dashboard has
// a real error feed/count, not just console output. Best-effort and
// non-blocking — a failure to log an error must never prevent the actual
// error response from being sent, and must never crash the handler itself.
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (mongoose.connection.readyState === 1) {
    ErrorLog.create({
      message: err.message || 'Unknown error',
      stack: err.stack || '',
      path: req.originalUrl || req.path || '',
      method: req.method,
      statusCode: err.status || 500,
    }).catch(logErr => console.error('Failed to persist error log:', logErr.message));
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀  SoSpark Design → http://localhost:${PORT}`));
