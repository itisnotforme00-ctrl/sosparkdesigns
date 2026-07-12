const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { BlogPost } = require('../models');

// GET /api/blog — public, published only
router.get('/', async (req, res) => {
  try {
    const { tag } = req.query;
    const filter = { published: true };
    // Coerced to String — see routes/portfolio.js for why (NoSQL operator
    // injection via qs bracket-notation query strings, e.g. tags[$ne]).
    if (tag) filter.tags = String(tag);
    const posts = await BlogPost.find(filter).sort({ publishedAt: -1, createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/blog/admin — admin: list ALL posts including unpublished drafts.
// Must be registered BEFORE GET '/:slug' below — otherwise Express would
// match "/admin" as a slug value and this route would never be reached.
// Same pattern as testimonials.js's GET /admin (moderation-queue visibility
// for the admin dashboard, not achievable via the public route alone).
router.get('/admin', auth, requireRole('editor'), async (req, res) => {
  try {
    const posts = await BlogPost.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/blog/:slug — public, single post. Filtered to published:true so
// an unpublished draft's slug can't be guessed/leaked to the public before
// its author intends it to go live.
router.get('/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, published: true });
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin CRUD — same auth pattern as portfolio.js (auth + requireRole('editor'))

router.post('/', auth, requireRole('editor'), async (req, res) => {
  try {
    const body = { ...req.body };
    // Auto-set publishedAt the first time a post goes live, so the admin
    // doesn't have to manually pick a timestamp — matches how most CMSes
    // behave. Doesn't override an explicitly provided publishedAt.
    if (body.published && !body.publishedAt) body.publishedAt = new Date();
    const post = await BlogPost.create(body);
    res.status(201).json(post);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    const existing = await BlogPost.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const body = { ...req.body };
    // Auto-set publishedAt the moment a draft flips to published, if it
    // doesn't already have one. Checking existing.publishedAt (not just
    // body.publishedAt) matters: the admin form has no publishedAt field,
    // so body.publishedAt is always undefined — without this check, EVERY
    // edit to an already-published post would silently reset its publish
    // date to right now. Once set, it's preserved across future edits,
    // including unpublish/republish cycles.
    if (body.published && !existing.publishedAt && !body.publishedAt) {
      body.publishedAt = new Date();
    }

    const post = await BlogPost.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    res.json(post);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    const deleted = await BlogPost.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
