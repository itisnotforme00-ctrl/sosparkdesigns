const crypto   = require('crypto');
const mongoose = require('mongoose');
const { PageView } = require('../models');

// ── Server-side visitor analytics (feature 2) ──
//
// Deliberately does NOT use a client-side tracking snippet. server.js
// serves frontend/ through this same Express app via express.static, so
// every real page load already passes through here — logging it as
// middleware gets full visitor analytics with zero changes to frontend/,
// which is off-limits for this project. Tradeoff: no in-page metrics like
// scroll depth or time-on-page are possible this way, since those require
// JS running in the browser after the page loads. If that's wanted later,
// it needs a real snippet added to frontend/ by whoever owns that scope.

const VISITOR_COOKIE = 'ss_vid';
const SKIP_PREFIXES = ['/api/', '/admin/'];
const STATIC_EXT_RE = /\.(css|js|mjs|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|json|xml|txt|webmanifest)$/i;

function shouldSkip(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return true;
  if (SKIP_PREFIXES.some(p => req.path.startsWith(p))) return true;
  if (STATIC_EXT_RE.test(req.path)) return true;
  return false;
}

// Reads/sets a long-lived first-party cookie for unique-visitor and
// active-user counts, without adding the cookie-parser dependency — just a
// small manual parse, since this is the only cookie this app uses.
function getOrSetVisitorId(req, res) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([^;]+)`));
  if (match) return match[1];

  const vid = crypto.randomUUID();
  const oneYear = 60 * 60 * 24 * 365;
  // HttpOnly: not needed by any client-side JS, so keep it out of reach of
  // an XSS payload. Secure: only sent over HTTPS in production — omitted in
  // dev so plain http://localhost testing still works.
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${VISITOR_COOKIE}=${vid}; Path=/; Max-Age=${oneYear}; SameSite=Lax; HttpOnly${secureFlag}`);
  return vid;
}

function classifyReferrer(referrerRaw, requestHost) {
  if (!referrerRaw) return 'direct';
  let host;
  try {
    host = new URL(referrerRaw).hostname.replace(/^www\./, '');
  } catch {
    return 'other';
  }
  if (requestHost && host === requestHost.replace(/^www\./, '')) return 'internal';
  if (/(^|\.)google\./.test(host)) return 'google';
  if (/(^|\.)bing\./.test(host)) return 'bing';
  if (/(^|\.)duckduckgo\./.test(host)) return 'duckduckgo';
  if (/(^|\.)facebook\.|(^|\.)fb\./.test(host)) return 'facebook';
  if (/(^|\.)instagram\./.test(host)) return 'instagram';
  if (/(^|\.)(twitter\.|x\.com)/.test(host)) return 'twitter/x';
  if (/(^|\.)linkedin\./.test(host)) return 'linkedin';
  if (/(^|\.)youtube\./.test(host)) return 'youtube';
  return 'other';
}

function parseUserAgent(uaRaw) {
  const ua = uaRaw || '';
  let device = 'desktop';
  if (/mobile/i.test(ua) && !/ipad/i.test(ua)) device = 'mobile';
  else if (/tablet|ipad/i.test(ua)) device = 'tablet';

  let browser = 'other';
  if (/edg\//i.test(ua)) browser = 'edge';
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'chrome';
  else if (/firefox\//i.test(ua)) browser = 'firefox';
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'safari';

  return { device, browser };
}

function getCountry(req) {
  // Populated by CDN/proxy layers like Cloudflare (cf-ipcountry). No paid
  // GeoIP lookup is wired in here — if the deployment isn't behind a proxy
  // that sets this, country will show as 'Unknown', which is honest rather
  // than guessed. Swapping in a GeoIP library (e.g. geoip-lite) later is a
  // drop-in change to this one function.
  return req.headers['cf-ipcountry'] || req.headers['x-country-code'] || 'Unknown';
}

async function logPageView(req, res, visitorId) {
  if (mongoose.connection.readyState !== 1) return; // don't let analytics failures cascade; DB-down is already surfaced elsewhere

  const referrerSource = classifyReferrer(req.headers.referer || req.headers.referrer || '', req.hostname);
  const { device, browser } = parseUserAgent(req.headers['user-agent']);

  await PageView.create({
    path: req.path,
    referrer: (req.headers.referer || req.headers.referrer || '').slice(0, 500),
    referrerSource,
    country: getCountry(req),
    device,
    browser,
    visitorId,
    statusCode: res.statusCode,
  });
}

function analyticsLogger(req, res, next) {
  if (shouldSkip(req)) return next();

  const visitorId = getOrSetVisitorId(req, res);

  res.on('finish', () => {
    logPageView(req, res, visitorId).catch(err => {
      console.error('Analytics logging error:', err.message);
    });
  });

  next();
}

module.exports = analyticsLogger;
