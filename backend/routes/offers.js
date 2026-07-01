const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { Offer } = require('../models');

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const offers = await Offer.find({
      active: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    });
    res.json(offers);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', auth, async (req, res) => {
  try { res.status(201).json(await Offer.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const o = await Offer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!o) return res.status(404).json({ error: 'Not found' });
    res.json(o);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try { await Offer.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
