const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { Service } = require('../models');

router.get('/', async (req, res) => {
  try {
    const services = await Service.find({ active: true }).sort({ order: 1 });
    res.json(services);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', auth, requireRole('editor'), async (req, res) => {
  try { res.status(201).json(await Service.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    const s = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', auth, requireRole('editor'), async (req, res) => {
  try { await Service.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
