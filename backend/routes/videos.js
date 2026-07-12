const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { uploadVideo, UPLOAD_DIR } = require('../middleware/upload');
const { Video } = require('../models');

// Extracts an 11-char YouTube video ID from any common URL shape
// (watch?v=, youtu.be/, /embed/, /shorts/). Returns null if none match —
// callers must treat that as "not a valid YouTube URL", not guess further.
function extractYoutubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function uniqueSlug(base) {
  let slug = base || 'video';
  let n = 1;
  while (await Video.exists({ slug })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

// GET /api/videos — public, active only
router.get('/', async (req, res) => {
  try {
    const { category, featured } = req.query;
    const filter = { active: true };
    if (category) filter.category = String(category); // coerced — see portfolio.js/blog.js for why
    if (featured === 'true') filter.featured = true;
    const videos = await Video.find(filter).sort({ order: 1, createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/videos/admin — editor+: all videos including inactive ones.
// Registered before GET '/:slug' so "admin" is never matched as a slug.
router.get('/admin', auth, requireRole('editor'), async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/videos/:slug — public, single active video
router.get('/:slug', async (req, res) => {
  try {
    const video = await Video.findOne({ slug: req.params.slug, active: true });
    if (!video) return res.status(404).json({ error: 'Not found' });
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/videos/upload — editor+, multipart/form-data.
// File field name must be "video"; text fields (title, description,
// category, tags, featured) travel alongside it in the same multipart body.
router.post('/upload', auth, requireRole('editor'), (req, res) => {
  uploadVideo.single('video')(req, res, async (err) => {
    if (err) {
      // multer's own errors (oversized file, disallowed mimetype) surface
      // here, not in the outer try/catch below, since they happen during
      // the upload stream itself, before this route's own logic runs.
      return res.status(400).json({ error: err.message });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file provided (field name must be "video")' });
      }
      const { title, description, category, tags, featured } = req.body;
      if (!title) {
        // Don't leave an orphaned file on disk if the rest of the
        // submission is invalid — the upload already succeeded before this
        // check runs, so clean it up explicitly.
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'title is required' });
      }

      const slug = await uniqueSlug(slugify(title));
      const video = await Video.create({
        title,
        slug,
        description: description || '',
        source: 'upload',
        filename: req.file.filename,       // server-generated, safe
        originalName: req.file.originalname, // display only, never used as a path
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        category: category || '',
        tags: tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : [],
        featured: featured === 'true' || featured === true,
        uploadedBy: req.admin.username,
      });
      res.status(201).json(video);
    } catch (createErr) {
      // DB write failed after the file was already saved — remove the
      // orphaned file rather than leaking disk space with no matching record.
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: createErr.message });
    }
  });
});

// POST /api/videos/youtube — editor+, link a YouTube video. No file is
// stored server-side for this source type.
router.post('/youtube', auth, requireRole('editor'), async (req, res) => {
  try {
    const { title, description, url, category, tags, featured, thumbnail } = req.body;
    if (!title || !url) {
      return res.status(400).json({ error: 'title and url are required' });
    }
    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) {
      return res.status(400).json({ error: 'Could not extract a YouTube video ID from that URL' });
    }

    const slug = await uniqueSlug(slugify(title));
    const video = await Video.create({
      title,
      slug,
      description: description || '',
      source: 'youtube',
      youtubeId,
      youtubeUrl: url,
      // Predictable, keyless YouTube thumbnail CDN URL — overridable via an
      // explicit `thumbnail` field if a custom image is preferred instead.
      thumbnail: thumbnail || `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      category: category || '',
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : []),
      featured: !!featured,
      uploadedBy: req.admin.username,
    });
    res.status(201).json(video);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/videos/:id — editor+, METADATA ONLY. Deliberately does not allow
// swapping the underlying file or source type — delete + re-add covers that
// case, avoiding orphaned files/half-migrated records.
router.put('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    const allowed = ['title', 'description', 'category', 'tags', 'featured', 'active', 'order', 'thumbnail'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const video = await Video.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!video) return res.status(404).json({ error: 'Not found' });
    res.json(video);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/videos/:id — editor+. For source:'upload' videos, also
// deletes the actual file from disk — without this, every delete silently
// leaks storage forever.
router.delete('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'Not found' });

    if (video.source === 'upload' && video.filename) {
      const filePath = path.join(UPLOAD_DIR, video.filename);
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          console.error(`Failed to delete video file ${filePath}:`, unlinkErr.message);
        }
      });
    }

    await Video.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
