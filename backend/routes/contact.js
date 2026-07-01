const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { Contact } = require('../models');

// POST /api/contact — submit form
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

    const contact = await Contact.create({ name, email, company, service, budget, message });
    res.status(201).json({ success: true, id: contact._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/contact — admin: list all messages
router.get('/', auth, async (req, res) => {
  try {
    const messages = await Contact.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/contact/:id — mark read/replied
router.patch('/:id', auth, async (req, res) => {
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
router.delete('/:id', auth, async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
