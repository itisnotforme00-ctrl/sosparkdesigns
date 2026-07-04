// ══════════════════════════════════════════════════════════════════
// FILE: backend/routes/auth.js  —  the ROUTER
// Larger (~3.3 KB). Defines the actual auth ENDPOINTS: POST /login,
// POST /setup, GET /me, plus the default-admin auto-seeding logic.
// Exports an Express ROUTER, mounted like:
//   app.use('/api/auth', require('./routes/auth'));
// This file does NOT verify tokens on other routes — that's the OTHER
// auth.js, at backend/middleware/auth.js (the gatekeeper, ~1.8 KB). If
// you're looking for the JWT-verification guard and it's not below,
// you're in the wrong file.
// Last line of this file is: module.exports = router;
// (middleware/auth.js instead ends with: module.exports = authMiddleware;)
// ══════════════════════════════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const auth     = require('../middleware/auth');
const { Admin } = require('../models');

// ── DEFAULT ADMIN (auto-created on first boot if no admin exists) ──
// Username: admin  |  Password: soaspark2024
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'soaspark2024';

async function ensureDefaultAdmin() {
  const count = await Admin.countDocuments();
  if (count === 0) {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    await Admin.create({ username: DEFAULT_USERNAME, passwordHash, role: 'super_admin' });
    console.log('✅  Default admin created — username: admin | password: soaspark2024');
  }
  // Note: no longer swallows its own errors here — see ensureDefaultAdminWithRetry
  // below, which needs to know whether an attempt actually failed.
}

// ── B2 fix (original) ──
// Previously this fired from a fixed setTimeout(fn, 3000), which raced a slow
// cold-start Mongo connection (e.g. Atlas waking up, retry/backoff in
// server.js taking >3s). If the timeout fired before Mongo was actually
// connected, ensureDefaultAdmin() would fail its countDocuments() call and
// the seed would silently never happen.
//
// ── B2b fix (this session — a real bug in the original B2 fix) ──
// The original fix hooked mongoose.connection.once('open', ensureDefaultAdmin).
// 'open' is a ONE-TIME event: Mongoose only ever emits it once, on the first
// successful connection for a connection object's lifetime. That's fine IF
// ensureDefaultAdmin() succeeds the instant 'open' fires. But if the
// connection technically opens while the deployment isn't fully ready to
// serve writes yet (e.g. an Atlas cluster still finishing primary election
// right as the socket opens), Admin.countDocuments() or Admin.create() can
// throw at that exact moment. Because .once() had ALREADY permanently
// removed the listener the instant 'open' fired — regardless of whether the
// handler succeeded or failed — that failure meant ensureDefaultAdmin()
// would never run again for the rest of that process's life, even once the
// connection fully stabilized moments later. This is precisely the scenario
// you described: it "fired" once, failed partway, and had no path to retry.
//
// Fix, two parts:
//  1. Listen on 'connected' instead of 'open', using .on() (not .once()).
//     Unlike 'open', Mongoose emits 'connected' every time the connection
//     (re)establishes — including after a disconnect/reconnect cycle — so a
//     failed attempt gets another real chance on the next reconnect, and
//     this is self-healing indefinitely rather than a single shot.
//  2. ensureDefaultAdminWithRetry() also retries a few times with backoff
//     immediately, so a purely transient failure right at connection time
//     doesn't need to wait for a full reconnect cycle to resolve.
//  ensureDefaultAdmin() is idempotent (a no-op once count > 0), so firing it
//  repeatedly across reconnects is harmless — just one extra countDocuments()
//  read each time.
async function ensureDefaultAdminWithRetry(maxAttempts = 5, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await ensureDefaultAdmin();
      return; // succeeded (created, or one already existed) — done
    } catch (err) {
      console.error(`Admin seed attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt === maxAttempts) {
        console.error(
          '⚠️   Default admin seed did not succeed after multiple attempts. ' +
          'Run "node backend/scripts/checkAdmin.js" to check the Admin collection directly, ' +
          'and "node backend/scripts/checkAdmin.js --seed" to create the default admin manually if it\'s empty.'
        );
        return;
      }
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
}

function scheduleDefaultAdminSeed() {
  if (mongoose.connection.readyState === 1) {
    ensureDefaultAdminWithRetry();
  }
  // Persistent listener (not .once()) — re-attempts on every future
  // (re)connect too, not just the first one. See B2b comment above.
  mongoose.connection.on('connected', ensureDefaultAdminWithRetry);
}
scheduleDefaultAdminSeed();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const admin = await Admin.findOne({ username: username.toLowerCase().trim() });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    // feature 4: a deactivated admin shouldn't be able to log in and get a
    // fresh token in the first place (middleware/auth.js also blocks
    // already-issued tokens for deactivated accounts, but rejecting here
    // gives a clearer message than a confusing later 401).
    if (admin.active === false) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact a super admin.' });
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET || 'sosparkdesign_fallback_secret_change_in_prod',
      { expiresIn: '7d' }
    );

    res.json({ token, username: admin.username, role: admin.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/setup — first-run bootstrap admin creation ONLY
//
// ── Security fix, flagged explicitly (not part of the original task list) ──
// This endpoint was previously open to ANYONE, at ANY time, with zero
// authentication — meaning anyone who discovered POST /api/auth/setup could
// create a fully working admin account on a live site. That was already a
// real vulnerability before this session; it just becomes actively
// dangerous now that we're formalizing multi-admin management, so I'm
// fixing it here rather than leaving it as a silent side door next to the
// new RBAC system.
//
// New behavior: this route only works when there are ZERO admins in the
// database (first-run bootstrap, e.g. a fresh install before
// ensureDefaultAdmin() has even run, or if someone deliberately wiped the
// Admin collection). Once at least one admin exists, use POST /api/admins
// instead — that route requires an authenticated super_admin.
//
// Flag for the owner: if any existing tooling or documentation relies on
// hitting /api/auth/setup after admins already exist, that will now return
// 403 instead of creating an account. That's intentional, but wanted to
// call it out since it's a behavior change beyond the requested features.
router.post('/setup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 8)
      return res.status(400).json({ error: 'Username + password (8+ chars) required' });

    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
      return res.status(403).json({
        error: 'Setup is only available on first run, before any admin exists. Use an existing super_admin account and POST /api/admins to add more admins.',
      });
    }

    const exists = await Admin.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    await Admin.create({ username: username.toLowerCase(), passwordHash, role: 'super_admin' });
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({ username: req.admin.username, role: req.admin.role });
});

module.exports = router;