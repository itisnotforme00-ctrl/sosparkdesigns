const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const auth     = require('../middleware/auth');
const { Admin } = require('../models');

// ── DEFAULT ADMIN (auto-created on first boot if no admin exists) ──
// Username: admin  |  Password: soaspark2024
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'soaspark2024';

async function ensureDefaultAdmin() {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
      await Admin.create({ username: DEFAULT_USERNAME, passwordHash, role: 'admin' });
      console.log('✅  Default admin created — username: admin | password: soaspark2024');
    }
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
}
// Run after DB connects
setTimeout(ensureDefaultAdmin, 3000);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const admin = await Admin.findOne({ username: username.toLowerCase().trim() });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

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

// POST /api/auth/setup — manual admin creation
router.post('/setup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 8)
      return res.status(400).json({ error: 'Username + password (8+ chars) required' });

    const exists = await Admin.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    await Admin.create({ username: username.toLowerCase(), passwordHash });
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
