const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const { PageView, ErrorLog, Contact } = require('../models');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// New vs. returning (requested extension): a visitor counts as "returning"
// if the cookie-tracked visitorId has any PageView from BEFORE the query
// range started; otherwise "new". Two queries: which visitorIds were active
// in-range, then which of those already existed before `since`.
//
// Known limitation, worth flagging: this is only as reliable as the
// first-party cookie itself. Private/incognito browsing, cleared cookies,
// or a different device all reset a real person back to "new." That's an
// inherent limit of cookie-based tracking without a login system on the
// public site — a persistent identity would need real user accounts, which
// is out of scope here.
async function computeNewReturning(since) {
  const activeIds = await PageView.distinct('visitorId', { createdAt: { $gte: since }, visitorId: { $ne: '' } });
  if (activeIds.length === 0) return { newVisitors: 0, returningVisitors: 0 };
  const returningIds = await PageView.distinct('visitorId', { visitorId: { $in: activeIds }, createdAt: { $lt: since } });
  const returningCount = returningIds.length;
  return { newVisitors: activeIds.length - returningCount, returningVisitors: returningCount };
}

// Time-on-page (requested extension): NO client-side heartbeat/beacon
// exists (and building one would mean touching frontend/, which is out of
// scope for this branch — flagging that explicitly, not building it).
// Instead this is a server-side ESTIMATE: for each visitor, the gap between
// two consecutive pageviews (while under a 30-minute inactivity cutoff, so
// a gap that large is treated as a new session rather than "time spent")
// is used as a proxy for time spent on the earlier of the two pages.
//
// Important accuracy caveat to flag to the owner: this cannot measure the
// LAST page of any session (there's no next pageview to diff against, and
// no "user left" signal) — so single-page sessions and exits contribute
// zero data points, which skews the average upward (only pages that led to
// another pageview are measured). This is the same fundamental limitation
// classic pageview-only analytics tools have always had; a true, unbiased
// number requires a client-side engagement ping.
async function computeSessionStats(since) {
  const SESSION_GAP_MS = 30 * 60 * 1000;
  const raw = await PageView.find({ createdAt: { $gte: since }, visitorId: { $ne: '' } })
    .select('visitorId createdAt')
    .sort({ visitorId: 1, createdAt: 1 })
    .lean();

  let totalGapMs = 0;
  let gapCount = 0;
  let sessionCount = 0;
  let lastVisitor = null;
  let lastTime = null;

  for (const pv of raw) {
    if (pv.visitorId !== lastVisitor) {
      sessionCount++; // first pageview seen for this visitor in range = start of a session
      lastVisitor = pv.visitorId;
      lastTime = pv.createdAt;
      continue;
    }
    const gap = pv.createdAt - lastTime;
    if (gap > 0 && gap <= SESSION_GAP_MS) {
      totalGapMs += gap;
      gapCount++;
    } else if (gap > SESSION_GAP_MS) {
      sessionCount++; // long idle gap = treat as a new session, not time-on-page
    }
    lastTime = pv.createdAt;
  }

  return {
    sessionCount,
    avgTimeOnPageSeconds: gapCount > 0 ? Math.round(totalGapMs / gapCount / 1000) : null,
  };
}

// GET /api/analytics/overview?days=30
// Visitor analytics page data: totals, daily timeseries, top pages,
// referrer sources, countries, devices/browsers, new-vs-returning, and an
// estimated time-on-page (see computeSessionStats above for the caveat).
// Any logged-in role can view analytics (viewer is the read-only-everywhere
// role), so this only requires 'viewer' rank — support/editor/super_admin/
// admin all qualify too.
router.get('/overview', auth, requireRole('viewer'), async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const since = daysAgo(days);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalViews,
      viewsLast24h,
      uniqueVisitorIds,
      activeVisitorIds,
      topPages,
      referrerBreakdown,
      countryBreakdown,
      deviceBreakdown,
      browserBreakdown,
      dailyTimeseries,
      newReturning,
      sessionStats,
    ] = await Promise.all([
      PageView.countDocuments({ createdAt: { $gte: since } }),
      PageView.countDocuments({ createdAt: { $gte: oneDayAgo } }),
      PageView.distinct('visitorId', { createdAt: { $gte: since } }),
      PageView.distinct('visitorId', { createdAt: { $gte: fiveMinAgo } }),
      PageView.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$path', views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 10 },
      ]),
      PageView.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$referrerSource', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      PageView.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      PageView.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$device', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      PageView.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$browser', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      PageView.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          views: { $sum: 1 },
          visitors: { $addToSet: '$visitorId' },
        } },
        { $project: { _id: 1, views: 1, uniqueVisitors: { $size: '$visitors' } } },
        { $sort: { _id: 1 } },
      ]),
      computeNewReturning(since),
      computeSessionStats(since),
    ]);

    res.json({
      rangeDays: days,
      totalViews,
      viewsLast24h,
      uniqueVisitors: uniqueVisitorIds.length,
      activeUsers: activeVisitorIds.length, // visitorIds seen in the last 5 minutes — see also GET /active for lightweight polling
      newVisitors: newReturning.newVisitors,
      returningVisitors: newReturning.returningVisitors,
      avgTimeOnPageSeconds: sessionStats.avgTimeOnPageSeconds, // ESTIMATE — see computeSessionStats comment for accuracy caveat
      sessionCount: sessionStats.sessionCount,
      topPages: topPages.map(p => ({ path: p._id, views: p.views })),
      referrers: referrerBreakdown.map(r => ({ source: r._id, count: r.count })),
      countries: countryBreakdown.map(c => ({ country: c._id, count: c.count })),
      devices: deviceBreakdown.map(d => ({ device: d._id, count: d.count })),
      browsers: browserBreakdown.map(b => ({ browser: b._id, count: b.count })),
      dailyTimeseries: dailyTimeseries.map(d => ({ date: d._id, views: d.views, uniqueVisitors: d.uniqueVisitors })),
    });
  } catch (err) {
    console.error('Analytics overview error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/analytics/active
// Lightweight endpoint for real-time polling (e.g. a dashboard widget
// refreshing every 10-15s) without re-running the full /overview payload
// each time. "Active" = a visitorId with a pageview in the last 5 minutes.
router.get('/active', auth, requireRole('viewer'), async (req, res) => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeVisitorIds = await PageView.distinct('visitorId', { createdAt: { $gte: fiveMinAgo } });
    res.json({ activeUsers: activeVisitorIds.length, asOf: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/analytics/errors?limit=50
// Recent server error log entries. Gated to 'editor' and above (not
// 'viewer'/'support') since stack traces can reveal internal implementation
// details that aren't appropriate for the lowest-privilege roles.
router.get('/errors', auth, requireRole('editor'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const errors = await ErrorLog.find().sort({ createdAt: -1 }).limit(limit);
    res.json(errors);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/analytics/dashboard
// Single combined-stats endpoint for the "Full Website Monitoring
// Dashboard" overview (feature 1): traffic, active users, error count,
// unread messages. Uptime and DB state are already covered by /api/health
// and intentionally not duplicated here.
router.get('/dashboard', auth, requireRole('viewer'), async (req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [viewsLast24h, activeVisitorIds, errorsLast24h, unreadMessages] = await Promise.all([
      PageView.countDocuments({ createdAt: { $gte: oneDayAgo } }),
      PageView.distinct('visitorId', { createdAt: { $gte: fiveMinAgo } }),
      ErrorLog.countDocuments({ createdAt: { $gte: oneDayAgo } }),
      Contact.countDocuments({ read: false }),
    ]);

    res.json({
      viewsLast24h,
      activeUsers: activeVisitorIds.length,
      errorsLast24h,
      unreadMessages,
    });
  } catch (err) {
    console.error('Analytics dashboard error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
