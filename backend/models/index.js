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

// ── Admin User (RBAC — feature 4) ──
// Role hierarchy, enforced by middleware/permissions.js:
//   super_admin — full access: manage admins/roles, site settings, API keys, all content
//   editor      — manage content (portfolio/services/team/testimonials/faq/offers/blog/videos),
//                 cannot manage admins, cannot change site settings or API keys
//   support     — read + respond to contact messages only, plus analytics viewing
//   viewer      — read-only: dashboard stats + analytics, no mutations anywhere
//
// 'admin' is kept in the enum as a LEGACY ALIAS for 'super_admin' — existing
// deployments already have a seeded admin with role: 'admin' from before this
// feature existed, and this schema change must not silently lock that account
// out or downgrade its permissions. middleware/permissions.js treats 'admin'
// and 'super_admin' as equal rank. New accounts (via /api/admins or a fresh
// /api/auth/setup bootstrap) are created with 'super_admin' going forward.
const adminSchema = new Schema({
  username:     { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['admin', 'super_admin', 'editor', 'support', 'viewer'], default: 'editor' },
  active:       { type: Boolean, default: true }, // deactivated admins can't log in, without deleting the account/history
  invitedBy:    { type: String, default: null },  // username of the super_admin who created this account, for audit purposes
}, { timestamps: true });

adminSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash; // never leak the hash, even to the admin panel itself
    return ret;
  },
});

// ── Site Settings (feature 1 — editable config without redeploy) ──
const settingSchema = new Schema({
  key:       { type: String, required: true, unique: true, trim: true },
  value:     { type: Schema.Types.Mixed, required: true },
  type:      { type: String, enum: ['text', 'richtext', 'boolean', 'number', 'json', 'image'], default: 'text' },
  group:     { type: String, default: 'general', trim: true, lowercase: true },
  label:     { type: String, default: '' },
  updatedBy: { type: String, default: '' },
}, { timestamps: true });

// ── Page View (feature 2 — server-side visitor analytics) ──
const pageViewSchema = new Schema({
  path:           { type: String, required: true, index: true },
  referrer:       { type: String, default: '' },
  referrerSource: { type: String, default: 'direct', index: true },
  country:        { type: String, default: 'Unknown', index: true },
  device:         { type: String, default: 'unknown' },
  browser:        { type: String, default: 'unknown' },
  visitorId:      { type: String, default: '', index: true },
  statusCode:     { type: Number, default: 200 },
}, { timestamps: true });

pageViewSchema.index({ createdAt: -1 });

// ── Error Log (feature 1 — dashboard error visibility) ──
const errorLogSchema = new Schema({
  message:    { type: String, required: true },
  stack:      { type: String, default: '' },
  path:       { type: String, default: '' },
  method:     { type: String, default: '' },
  statusCode: { type: Number, default: 500 },
}, { timestamps: true });

errorLogSchema.index({ createdAt: -1 });

// ── Blog Post ──
const blogPostSchema = new Schema({
  title:       { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  excerpt:     { type: String, required: true },
  content:     { type: String, required: true }, // Markdown — see routes/blog.js
  coverImage:  { type: String, default: '' },
  tags:        [String],
  author:      { type: String, default: 'Soahim Rahman Tasin' },
  published:   { type: Boolean, default: false },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

// ── API Key Pool (B6) ──
const apiKeySchema = new Schema({
  provider:     { type: String, required: true, trim: true, lowercase: true },
  encryptedKey: { type: String, required: true, select: false },
  last4:        { type: String, required: true },
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

// ── Video (new — server-stored uploads AND YouTube-linked videos) ──
//
// One schema, two source types, distinguished by `source`:
//   'upload'  — the actual video file lives on this server's disk, under
//               middleware/upload.js's UPLOAD_DIR. `filename` is a
//               server-generated random name (NEVER the client's original
//               filename — see middleware/upload.js for why). `originalName`
//               is kept only as a display label, never used to touch the
//               filesystem.
//   'youtube' — no file is stored here at all. Only the extracted 11-char
//               YouTube video ID + the original URL are kept. `thumbnail`
//               defaults to YouTube's own predictable thumbnail CDN URL
//               (img.youtube.com/vi/<id>/hqdefault.jpg) so no YouTube API
//               key/quota is needed just to show a preview image.
//
// Deleting a Video document with source:'upload' also deletes the actual
// file from disk (see routes/videos.js DELETE handler) — without that,
// every delete would silently leak disk space forever.
const videoSchema = new Schema({
  title:        { type: String, required: true, trim: true },
  slug:         { type: String, required: true, unique: true, lowercase: true },
  description:  { type: String, default: '' },
  source:       { type: String, enum: ['upload', 'youtube'], required: true },

  // 'upload' fields (empty/default for 'youtube' videos)
  filename:     { type: String, default: '' },
  originalName: { type: String, default: '' },
  mimeType:     { type: String, default: '' },
  fileSize:     { type: Number, default: 0 },

  // 'youtube' fields (empty/default for 'upload' videos)
  youtubeId:    { type: String, default: '' },
  youtubeUrl:   { type: String, default: '' },

  thumbnail:    { type: String, default: '' },
  category:     { type: String, default: '', trim: true },
  tags:         [String],
  featured:     { type: Boolean, default: false },
  active:       { type: Boolean, default: true },
  order:        { type: Number, default: 0 },
  uploadedBy:   { type: String, default: '' },
}, { timestamps: true });

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
  BlogPost:    mongoose.model('BlogPost',    blogPostSchema),
  Setting:     mongoose.model('Setting',     settingSchema),
  PageView:    mongoose.model('PageView',    pageViewSchema),
  ErrorLog:    mongoose.model('ErrorLog',    errorLogSchema),
  Video:       mongoose.model('Video',       videoSchema),
};
