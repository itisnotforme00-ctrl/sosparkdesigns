const jwt = require('jsonwebtoken');

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

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised — token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || JWT_FALLBACK_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
