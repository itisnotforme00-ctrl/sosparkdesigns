const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { Testimonial } = require('../models');

// GET /api/testimonials — public, approved only
router.get('/', async (req, res) => {
  try {
    const filter = { approved: true };
    if (req.query.featured === 'true') filter.featured = true;
    const t = await Testimonial.find(filter).sort({ createdAt: -1 });
    res.json(t);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/testimonials/admin — admin: ALL testimonials (pending + approved),
// for moderation. Same pattern as routes/blog.js's GET /admin. Registered
// above any '/:id'-shaped route on purpose — there isn't one currently, but
// keeping the ordering discipline consistent avoids Express ever matching
// "admin" as an :id param if one gets added later.
router.get('/admin', auth, requireRole('editor'), async (req, res) => {
  try {
    const t = await Testimonial.find().sort({ createdAt: -1 });
    res.json(t);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/testimonials/submit — public visitor submission.
// Whitelisted fields only. approved/featured are FORCED false server-side
// regardless of what's in the request body (a crafted body trying to set
// approved: true directly is ignored). Rate-limited in server.js
// (5/hour/IP) as a second layer against spam.
router.post('/submit', async (req, res) => {
  try {
    const { name, role, company, text, rating, initials } = req.body;
    if (!name || !text) {
      return res.status(400).json({ error: 'name and text are required' });
    }
    const testimonial = await Testimonial.create({
      name,
      role,
      company,
      text,
      rating,
      initials,
      approved: false,
      featured: false,
    });
    res.status(201).json({ success: true, id: testimonial._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', auth, requireRole('editor'), async (req, res) => {
  try { res.status(201).json(await Testimonial.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    const t = await Testimonial.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(t);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', auth, requireRole('editor'), async (req, res) => {
  try { await Testimonial.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
