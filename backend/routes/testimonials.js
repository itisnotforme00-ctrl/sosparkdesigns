const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { Testimonial } = require('../models');

router.get('/', async (req, res) => {
  try {
    const filter = { approved: true };
    if (req.query.featured === 'true') filter.featured = true;
    const t = await Testimonial.find(filter).sort({ createdAt: -1 });
    res.json(t);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', auth, async (req, res) => {
  try { res.status(201).json(await Testimonial.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const t = await Testimonial.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(t);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try { await Testimonial.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
