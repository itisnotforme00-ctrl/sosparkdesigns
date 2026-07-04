const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { Setting } = require('../models');

// ── Site settings (feature 1) ──
// A generic key/value config store so content/toggles can change after
// launch without editing code and redeploying. GET is public (no auth) so
// it can be read by any consumer — a future admin UI, or frontend/ pages if
// that scope is ever picked up by someone else — without needing a token
// just to render public config. Mutations require 'super_admin': per the
// feature request, an editor can manage content but must NOT be able to
// change site settings.

// GET /api/settings — all settings, optionally filtered by ?group=
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.group) filter.group = String(req.query.group).toLowerCase().trim();
    const settings = await Setting.find(filter).sort({ group: 1, key: 1 });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/settings/:key — single setting by key
router.get('/:key', async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: req.params.key });
    if (!setting) return res.status(404).json({ error: 'Not found' });
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/settings — create a new setting (super_admin only)
router.post('/', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { key, value, type, group, label } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }
    const existing = await Setting.findOne({ key });
    if (existing) return res.status(409).json({ error: 'A setting with this key already exists — use PUT to update it' });

    const setting = await Setting.create({
      key: String(key).trim(),
      value,
      type: type || 'text',
      group: group || 'general',
      label: label || '',
      updatedBy: req.admin.username,
    });
    res.status(201).json(setting);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/settings/:key — update (or upsert) a setting's value (super_admin only)
router.put('/:key', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { value, type, group, label } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'value is required' });
    }
    const update = { value, updatedBy: req.admin.username };
    if (type)  update.type = type;
    if (group) update.group = group;
    if (label !== undefined) update.label = label;

    const setting = await Setting.findOneAndUpdate(
      { key: req.params.key },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
    res.json(setting);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/settings/:key — remove a setting (super_admin only)
router.delete('/:key', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const deleted = await Setting.findOneAndDelete({ key: req.params.key });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
