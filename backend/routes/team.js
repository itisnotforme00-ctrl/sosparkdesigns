const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { Team } = require('../models');

router.get('/', async (req, res) => {
  try {
    const members = await Team.find({ active: true }).sort({ order: 1 });
    res.json(members);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', auth, requireRole('editor'), async (req, res) => {
  try { res.status(201).json(await Team.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    const m = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!m) return res.status(404).json({ error: 'Not found' });
    res.json(m);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', auth, requireRole('editor'), async (req, res) => {
  try { await Team.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
