// ============================================
// SoSpark Design — Mongoose Models
// ============================================

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Portfolio Project ──
const portfolioSchema = new Schema({
  title:       { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  category:    { type: String, required: true, enum: ['Branding', 'Web Design', 'Web Development', 'Graphic Design', 'Video', 'Page Management'] },
  description: { type: String, required: true },
  coverImage:  { type: String, default: '' },
  images:      [String],
  tags:        [String],
  client:      { type: String, default: '' },
  year:        { type: Number, default: () => new Date().getFullYear() },
  featured:    { type: Boolean, default: false },
  order:       { type: Number, default: 0 },
}, { timestamps: true });

// ── Service ──
const serviceSchema = new Schema({
  title:       { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  icon:        { type: String, default: '✦' },
  shortDesc:   { type: String, required: true },
  longDesc:    { type: String, required: true },
  features:    [String],
  startingAt:  { type: String, default: '' },
  order:       { type: Number, default: 0 },
  active:      { type: Boolean, default: true },
}, { timestamps: true });

// ── Team Member ──
const teamSchema = new Schema({
  name:        { type: String, required: true, trim: true },
  role:        { type: String, required: true },
  bio:         { type: String, required: true },
  photo:       { type: String, default: '' },
  socials: {
    instagram: { type: String, default: '' },
    linkedin:  { type: String, default: '' },
    twitter:   { type: String, default: '' },
    behance:   { type: String, default: '' },
  },
  order:       { type: Number, default: 0 },
  active:      { type: Boolean, default: true },
}, { timestamps: true });

// ── Testimonial / Review ──
const testimonialSchema = new Schema({
  name:        { type: String, required: true, trim: true },
  role:        { type: String, required: true },
  company:     { type: String, default: '' },
  text:        { type: String, required: true },
  rating:      { type: Number, min: 1, max: 5, default: 5 },
  avatar:      { type: String, default: '' },
  initials:    { type: String, default: '' },
  featured:    { type: Boolean, default: false },
  approved:    { type: Boolean, default: true },
}, { timestamps: true });

// ── FAQ ──
const faqSchema = new Schema({
  question:  { type: String, required: true, trim: true },
  answer:    { type: String, required: true },
  category:  { type: String, default: 'General' },
  order:     { type: Number, default: 0 },
  active:    { type: Boolean, default: true },
}, { timestamps: true });

// ── Offer / Promo ──
const offerSchema = new Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  badge:       { type: String, default: 'Limited' },
  active:      { type: Boolean, default: true },
  expiresAt:   { type: Date, default: null },
}, { timestamps: true });

// ── Contact Message ──
const contactSchema = new Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, lowercase: true, trim: true },
  company:     { type: String, default: '' },
  service:     { type: String, default: '' },
  budget:      { type: String, default: '' },
  message:     { type: String, required: true },
  read:        { type: Boolean, default: false },
  replied:     { type: Boolean, default: false },
}, { timestamps: true });

// ── Admin User ──
const adminSchema = new Schema({
  username:     { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['admin', 'editor'], default: 'admin' },
}, { timestamps: true });

// ── API Key Pool (B6) ──
// Storage/CRUD half of bulk API key management. The rotation-and-failover
// logic that actually USES these keys during a chat request belongs to the
// API-agent worker in routes/chat.js — this model and its routes only
// manage the pool (add in bulk, list masked, deactivate, delete).
//
// `encryptedKey` is never returned in any API response — see the toJSON
// transform below, plus routes/apikeys.js never selects it into its
// responses in the first place (defense in depth). Only `last4` (a masked
// preview) is ever shown, even to the admin panel, per the brief.
const apiKeySchema = new Schema({
  provider:     { type: String, required: true, trim: true, lowercase: true }, // e.g. 'groq', 'openai'
  encryptedKey: { type: String, required: true, select: false }, // AES-256-GCM ciphertext, see utils/keyCrypto.js
  last4:        { type: String, required: true }, // masked preview only, e.g. "xk3f"
  active:       { type: Boolean, default: true },
  lastUsed:     { type: Date, default: null },
  failCount:    { type: Number, default: 0 },
}, { timestamps: true });

apiKeySchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.encryptedKey;
    return ret;
  },
});

module.exports = {
  Portfolio:   mongoose.model('Portfolio',   portfolioSchema),
  Service:     mongoose.model('Service',     serviceSchema),
  Team:        mongoose.model('Team',        teamSchema),
  Testimonial: mongoose.model('Testimonial', testimonialSchema),
  FAQ:         mongoose.model('FAQ',         faqSchema),
  Offer:       mongoose.model('Offer',       offerSchema),
  Contact:     mongoose.model('Contact',     contactSchema),
  Admin:       mongoose.model('Admin',       adminSchema),
  ApiKey:      mongoose.model('ApiKey',      apiKeySchema),
};
