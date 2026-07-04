// ── Role-based access control (feature 4) ──
//
// Must be used AFTER the `auth` middleware (../middleware/auth.js), since it
// reads req.admin.role, which auth.js sets from the verified JWT payload.
//
// Role rank, lowest to highest. 'admin' is a legacy alias for 'super_admin'
// (see models/index.js comment on adminSchema for why it still exists) —
// they carry equal rank here so existing seeded accounts aren't silently
// downgraded by this feature.
const ROLE_RANK = {
  viewer: 0,
  support: 1,
  editor: 2,
  admin: 3,
  super_admin: 3,
};

// requireRole('editor') passes for 'editor', 'admin', and 'super_admin'
// (anything ranked >= editor), and blocks 'viewer' and 'support'.
function requireRole(minRole) {
  const minRank = ROLE_RANK[minRole];
  if (minRank === undefined) {
    throw new Error(`requireRole: unknown role "${minRole}"`);
  }
  return (req, res, next) => {
    const role = req.admin && req.admin.role;
    const rank = ROLE_RANK[role];
    if (rank === undefined || rank < minRank) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

module.exports = { requireRole, ROLE_RANK };
