const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { ApiKey } = require('../models');
const { encrypt } = require('../utils/keyCrypto');

// ── B6: API key pool — storage/CRUD only ──
// This is the admin-managed key pool: bulk-add, list (masked), deactivate,
// delete. It intentionally does NOT contain rotation-during-a-chat-request
// or failover logic — that lives in routes/chat.js, owned by the API-agent
// worker. That worker should query ApiKey (filtering active:true and
// provider) and use utils/keyCrypto.decrypt() to get a usable key, then
// update lastUsed / failCount on that document as it sees fit. Coordinate
// schema changes here with them before altering field names.
//
// A raw key value is NEVER returned in any response from this file — every
// response is built through mask(), and encryptedKey is also excluded at
// the query level (select: false in the schema) and stripped again by the
// model's toJSON transform, so it's never accidentally leaked.

function mask(doc) {
  return {
    _id: doc._id,
    provider: doc.provider,
    last4: doc.last4,
    active: doc.active,
    lastUsed: doc.lastUsed,
    failCount: doc.failCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// GET /api/apikeys — admin: list all keys (masked), optional ?provider= filter
router.get('/', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.provider) filter.provider = String(req.query.provider).toLowerCase().trim();
    const keys = await ApiKey.find(filter).sort({ createdAt: -1 });
    res.json(keys.map(mask));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/apikeys/bulk — admin: paste a batch of keys for one provider
// Body: { provider: "groq", keys: "key1\nkey2\nkey3" }  (newline OR comma separated)
router.post('/bulk', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { provider, keys } = req.body;

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return res.status(400).json({ error: 'provider is required (e.g. "groq", "openai")' });
    }
    if (!keys || typeof keys !== 'string') {
      return res.status(400).json({ error: 'keys is required — a string, one key per line or comma-separated' });
    }

    const rawList = keys
      .split(/[\n,]+/)
      .map(k => k.trim())
      .filter(Boolean);

    if (rawList.length === 0) {
      return res.status(400).json({ error: 'No valid keys found in input' });
    }

    const providerNormalized = provider.toLowerCase().trim();
    const docs = rawList.map(rawKey => ({
      provider: providerNormalized,
      encryptedKey: encrypt(rawKey),
      last4: rawKey.slice(-4),
      active: true,
    }));

    const created = await ApiKey.insertMany(docs);
    res.status(201).json({
      added: created.length,
      provider: providerNormalized,
      keys: created.map(mask),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/apikeys/:id — activate/deactivate a key (no server restart needed)
// Body: { active: true|false }
router.patch('/:id', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { active } = req.body;
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active (boolean) is required' });
    }
    const key = await ApiKey.findByIdAndUpdate(req.params.id, { active }, { new: true });
    if (!key) return res.status(404).json({ error: 'Not found' });
    res.json(mask(key));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/apikeys/:id — permanently remove a key from the pool
router.delete('/:id', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const deleted = await ApiKey.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;