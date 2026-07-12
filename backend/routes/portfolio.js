const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { Portfolio } = require('../models');

// GET /api/portfolio — public
router.get('/', async (req, res) => {
  try {
    const { category, featured } = req.query;
    const filter = {};
    // Coerced to String explicitly: Express's query parser (qs) turns
    // ?category[$ne]= into an OBJECT ({ $ne: '' }), which — if assigned to
    // filter.category unmodified — would be interpreted by Mongoose as a
    // query operator, letting a crafted query string manipulate this
    // filter. String() collapses that back down to a harmless string.
    if (category) filter.category = String(category);
    if (featured === 'true') filter.featured = true;
    const projects = await Portfolio.find(filter).sort({ order: 1, createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const project = await Portfolio.findOne({ slug: req.params.slug });
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin CRUD
router.post('/', auth, requireRole('editor'), async (req, res) => {
  try {
    const project = await Portfolio.create(req.body);
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    const project = await Portfolio.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    await Portfolio.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
