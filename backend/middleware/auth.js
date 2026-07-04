// ══════════════════════════════════════════════════════════════════
// FILE: backend/middleware/auth.js  —  the GATEKEEPER
// Small (~1.8 KB). Verifies a JWT on incoming requests and blocks
// unauthenticated ones. Exports a single MIDDLEWARE FUNCTION, used like:
//   const auth = require('../middleware/auth');
//   router.get('/something', auth, handler)
// This file does NOT define /login, /setup, or /me — that's the OTHER
// auth.js, at backend/routes/auth.js (the router, ~3.3 KB). If you're
// looking for login logic and it's not below, you're in the wrong file.
// Last line of this file is: module.exports = authMiddleware;
// (routes/auth.js instead ends with: module.exports = router;)
// ══════════════════════════════════════════════════════════════════

const jwt = require('jsonwebtoken');
const { Admin } = require('../models');

// ── B5 fix ──
// routes/auth.js signs tokens with:
//   process.env.JWT_SECRET || 'sosparkdesign_fallback_secret_change_in_prod'
// but this file previously called jwt.verify(token, process.env.JWT_SECRET)
// with NO fallback. If JWT_SECRET was ever unset, login would still succeed
// (token signed with the fallback secret) but every single authenticated
// request afterward would fail verification, because jwt.verify(token,
// undefined) throws immediately. That's a strictly worse failure mode than
// "insecure fallback" — it's "auth is completely broken but login looked
// fine." Using the same fallback constant here makes the two consistent, so
// a missing JWT_SECRET degrades to "working but insecure" instead of
// "silently non-functional."
//
// Tradeoff / flag for the owner: this does NOT make the fallback secret any
// safer — anyone with the source (or this fallback string) could forge
// admin tokens if JWT_SECRET is unset in production. The real fix is
// ensuring JWT_SECRET is always set; B4's env-var validation now warns
// loudly at boot and at /api/health if it isn't. This change only makes
// misconfiguration behave consistently instead of half-working.
const JWT_FALLBACK_SECRET = 'sosparkdesign_fallback_secret_change_in_prod';

// ── RBAC fix (feature 4 — multi-admin & roles) ──
// Flagging this behavior change explicitly, same as B5: this middleware
// used to trust the JWT payload alone for req.admin (id/username/role),
// which was fine when there was only ever one editable admin account. Now
// that admins can be deactivated or have their role changed by a
// super_admin (routes/admins.js), trusting a 7-day-old JWT payload means a
// deactivated admin — or an editor who got demoted to viewer — would keep
// their OLD permissions until their token happened to expire. That defeats
// the point of the access-control feature.
//
// Fix: re-look-up the admin by id on every authenticated request and use
// their CURRENT active/role values, not the ones baked into the token at
// login time. Tradeoff: this adds one DB read per authenticated request
// (acceptable for an admin panel's traffic volume) and means the admin
// panel becomes fully dependent on Mongo being up for every action, not
// just login — if the DB drops mid-session, requests fail with 503 rather
// than continuing to work on a stale cached token.
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised — token required' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || JWT_FALLBACK_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const admin = await Admin.findById(decoded.id);
    if (!admin || admin.active === false) {
      return res.status(401).json({ error: 'Account not found or deactivated' });
    }
    req.admin = { id: admin._id.toString(), username: admin.username, role: admin.role };
    next();
  } catch (err) {
    return res.status(503).json({ error: 'Could not verify account — database unavailable' });
  }
}

module.exports = authMiddleware;