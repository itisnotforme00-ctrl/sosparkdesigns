const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const auth     = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { Admin } = require('../models');

// ── Multi-admin management (feature 4) ──
// Everything in this file is super_admin only. There's no email/invite-link
// infrastructure in this app, so "invite" here means a super_admin directly
// creates the account with a password they choose and share with the new
// admin out of band — not an emailed invite link. Adding real email invites
// would need a mail provider wired in, which is a separate piece of work.

// GET /api/admins — list all admin accounts (never includes passwordHash — see adminSchema.toJSON)
router.get('/', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const admins = await Admin.find().sort({ createdAt: 1 });
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admins — create a new admin account with a chosen role
router.post('/', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const allowedRoles = ['super_admin', 'editor', 'support', 'viewer'];

    if (!username || !password || password.length < 8) {
      return res.status(400).json({ error: 'Username + password (8+ chars) required' });
    }
    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${allowedRoles.join(', ')}` });
    }

    const exists = await Admin.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(409).json({ error: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await Admin.create({
      username: username.toLowerCase().trim(),
      passwordHash,
      role,
      invitedBy: req.admin.username,
    });
    res.status(201).json(admin);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/admins/:id — update an admin's role and/or active status
router.patch('/:id', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { role, active } = req.body;
    const allowedRoles = ['super_admin', 'editor', 'support', 'viewer'];
    const update = {};

    if (role !== undefined) {
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${allowedRoles.join(', ')}` });
      }
      update.role = role;
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean' });
      }
      update.active = active;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Provide role and/or active to update' });
    }

    // Safety guard: don't let the last remaining super_admin (or 'admin',
    // its legacy alias) demote or deactivate themselves and lock everyone
    // out of super_admin-only actions (including this very endpoint).
    const target = await Admin.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Not found' });

    const isDemotingOrDeactivatingASuperAdmin =
      (target.role === 'super_admin' || target.role === 'admin') &&
      ((update.role && update.role !== 'super_admin' && update.role !== 'admin') || update.active === false);

    if (isDemotingOrDeactivatingASuperAdmin) {
      const otherActiveSuperAdmins = await Admin.countDocuments({
        _id: { $ne: target._id },
        role: { $in: ['super_admin', 'admin'] },
        active: { $ne: false },
      });
      if (otherActiveSuperAdmins === 0) {
        return res.status(409).json({ error: 'Cannot demote or deactivate the last remaining super_admin' });
      }
    }

    const admin = await Admin.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    res.json(admin);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/admins/:id — permanently remove an admin account
router.delete('/:id', auth, requireRole('super_admin'), async (req, res) => {
  try {
    if (req.params.id === req.admin.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const target = await Admin.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Not found' });

    if (target.role === 'super_admin' || target.role === 'admin') {
      const otherActiveSuperAdmins = await Admin.countDocuments({
        _id: { $ne: target._id },
        role: { $in: ['super_admin', 'admin'] },
        active: { $ne: false },
      });
      if (otherActiveSuperAdmins === 0) {
        return res.status(409).json({ error: 'Cannot delete the last remaining super_admin' });
      }
    }

    await Admin.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
