const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { Contact } = require('../models');

// POST /api/contact — submit form. Public, unauthenticated.
//
// Hardening note (added this session): explicit length caps on every
// free-text field. Previously only `email` had any shape validation — name,
// company, service, budget, and message could each be arbitrarily long
// (bounded only by the global 1mb JSON body limit in server.js, which is
// far too generous for a contact form). A public write endpoint with no
// per-field limits is an easy vector for storage-bloat abuse even without
// malicious intent (e.g. a broken client retry-looping a huge payload).
router.post('/', async (req, res) => {
  try {
    const { name, email, company, service, budget, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (String(name).length > 200) {
      return res.status(400).json({ error: 'name must be 200 characters or fewer' });
    }
    if (String(email).length > 320) { // 320 = the theoretical max valid email length (RFC 5321)
      return res.status(400).json({ error: 'email must be 320 characters or fewer' });
    }
    if (String(message).length > 5000) {
      return res.status(400).json({ error: 'message must be 5000 characters or fewer' });
    }
    if (company && String(company).length > 200) {
      return res.status(400).json({ error: 'company must be 200 characters or fewer' });
    }
    if (service && String(service).length > 200) {
      return res.status(400).json({ error: 'service must be 200 characters or fewer' });
    }
    if (budget && String(budget).length > 100) {
      return res.status(400).json({ error: 'budget must be 100 characters or fewer' });
    }

    const contact = await Contact.create({
      name: String(name).trim(),
      email: String(email).trim(),
      company: company ? String(company).trim() : '',
      service: service ? String(service).trim() : '',
      budget: budget ? String(budget).trim() : '',
      message: String(message).trim(),
    });
    res.status(201).json({ success: true, id: contact._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/contact — admin: list all messages
router.get('/', auth, requireRole('support'), async (req, res) => {
  try {
    const messages = await Contact.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/contact/:id — mark read/replied
router.patch('/:id', auth, requireRole('support'), async (req, res) => {
  try {
    const { read, replied } = req.body;
    const msg = await Contact.findByIdAndUpdate(req.params.id, { read, replied }, { new: true });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/contact/:id — admin delete
router.delete('/:id', auth, requireRole('editor'), async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;