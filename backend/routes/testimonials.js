const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { Testimonial } = require('../models');

router.get('/', async (req, res) => {
  try {
    const filter = { approved: true };
    if (req.query.featured === 'true') filter.featured = true;
    const t = await Testimonial.find(filter).sort({ createdAt: -1 });
    res.json(t);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/testimonials/submit — PUBLIC: visitors submit their own review.
// Per explicit decision: unapproved by default. This does NOT reuse the
// admin POST '/' route below — that one trusts req.body wholesale (fine,
// since it's admin-only). This route only accepts a fixed whitelist of
// fields and forces `approved: false` and `featured: false` server-side
// regardless of what's in the request body, so a public submission can
// never self-approve or self-feature itself onto the live site. It stays
// invisible to GET '/' (which only returns approved: true) until an admin
// approves it via the existing PUT '/:id' route in the dashboard.
// Rate-limited separately in server.js to reduce spam risk on a public
// write endpoint.
router.post('/submit', async (req, res) => {
  try {
    const { name, role, company, text, rating, initials } = req.body;

    if (!name || !role || !text) {
      return res.status(400).json({ error: 'name, role, and text are required' });
    }
    if (String(name).length > 200 || String(role).length > 200) {
      return res.status(400).json({ error: 'name and role must be 200 characters or fewer' });
    }
    if (String(text).length > 2000) {
      return res.status(400).json({ error: 'text must be 2000 characters or fewer' });
    }

    const numericRating = parseInt(rating);
    const safeRating = (numericRating >= 1 && numericRating <= 5) ? numericRating : 5;

    await Testimonial.create({
      name: String(name).trim(),
      role: String(role).trim(),
      company: company ? String(company).trim().slice(0, 200) : '',
      text: String(text).trim(),
      rating: safeRating,
      initials: initials ? String(initials).trim().slice(0, 3) : '',
      approved: false, // forced — never trust client input for this
      featured: false, // forced — never trust client input for this
    });

    // Deliberately not returning the created document (it's unapproved,
    // not yet public) — just a confirmation message.
    res.status(201).json({
      success: true,
      message: 'Thank you! Your review has been submitted and will appear once approved.',
    });
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