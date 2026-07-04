const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { pool } = require('./server');
const { annotateVotes } = require('./fraud');

const BUCKET_MS = 5 * 60 * 1000; // 5分バケット
const DEVICE_HISTOGRAM_BUCKETS = ['1', '2-5', '6-20', '21+'];
// server.jsのDEVICE_UID_REと同じパターン
const DEVICE_UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX_LENGTH = 500;

// server.jsのisAuthorizedと同じ考え方: 長さが違う場合は先に弾いてからtimingSafeEqualで比較する
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requestAuth(res) {
  res.set('WWW-Authenticate', 'Basic realm="vote-log-admin"');
  return res.status(401).json({ error: 'unauthorized' });
}

function requireBasicAuth(req, res, next) {
  const adminUser = process.env.ADMIN_USER || '';
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminUser || !adminPassword) {
    return res.status(503).json({ error: 'admin not configured' });
  }

  const header = req.get('Authorization') || '';
  const prefix = 'Basic ';
  if (!header.startsWith(prefix)) {
    return requestAuth(res);
  }

  let decoded;
  try {
    decoded = Buffer.from(header.slice(prefix.length), 'base64').toString('utf8');
  } catch {
    return requestAuth(res);
  }

  const sepIndex = decoded.indexOf(':');
  if (sepIndex === -1) {
    return requestAuth(res);
  }

  const user = decoded.slice(0, sepIndex);
  const pass = decoded.slice(sepIndex + 1);

  if (safeEqual(user, adminUser) && safeEqual(pass, adminPassword)) {
    return next();
  }

  return requestAuth(res);
}

const app = express();
app.use(express.json());
app.use(requireBasicAuth);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/admin/api/summary', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM votes');
    const annotated = annotateVotes(rows);

    const totalVotes = rows.length;
    const suspiciousCount = annotated.filter((v) => v.suspicionScore >= 2).length;

    const scoreDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const vote of rows) {
      if (Object.prototype.hasOwnProperty.call(scoreDistribution, vote.score)) {
        scoreDistribution[vote.score] += 1;
      }
    }

    const timelineMap = new Map();
    for (const vote of rows) {
      const ts = new Date(vote.created_at).getTime();
      const bucketMs = Math.floor(ts / BUCKET_MS) * BUCKET_MS;
      const bucketIso = new Date(bucketMs).toISOString();
      timelineMap.set(bucketIso, (timelineMap.get(bucketIso) || 0) + 1);
    }
    const timeline = Array.from(timelineMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([bucket, count]) => ({ bucket, count }));

    const deviceCounts = new Map();
    for (const vote of rows) {
      if (vote.device_uid === null || vote.device_uid === undefined) continue;
      deviceCounts.set(vote.device_uid, (deviceCounts.get(vote.device_uid) || 0) + 1);
    }
    const deviceHistogram = { '1': 0, '2-5': 0, '6-20': 0, '21+': 0 };
    for (const count of deviceCounts.values()) {
      if (count === 1) deviceHistogram['1'] += 1;
      else if (count <= 5) deviceHistogram['2-5'] += 1;
      else if (count <= 20) deviceHistogram['6-20'] += 1;
      else deviceHistogram['21+'] += 1;
    }
    const deviceVoteCounts = DEVICE_HISTOGRAM_BUCKETS.map((bucket) => ({
      bucket,
      count: deviceHistogram[bucket],
    }));

    res.status(200).json({
      totalVotes,
      suspiciousCount,
      scoreDistribution,
      timeline,
      deviceVoteCounts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/admin/api/votes', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM votes');
    const annotated = annotateVotes(rows);

    const suspiciousOnlyRaw = req.query.suspiciousOnly;
    const suspiciousOnly = Boolean(suspiciousOnlyRaw) && suspiciousOnlyRaw !== '0' && suspiciousOnlyRaw !== 'false';

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = 200;
    if (limit > 1000) limit = 1000;

    const filtered = suspiciousOnly ? annotated.filter((v) => v.suspicionScore >= 1) : annotated;

    filtered.sort((a, b) => {
      if (b.suspicionScore !== a.suspicionScore) return b.suspicionScore - a.suspicionScore;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const result = filtered.slice(0, limit).map((v) => ({
      id: v.id,
      venueId: v.venue_id,
      voterType: v.voter_type,
      score: v.score,
      tapX: v.tap_x,
      tapY: v.tap_y,
      viewportW: v.viewport_w,
      viewportH: v.viewport_h,
      deviceUid: v.device_uid,
      createdAt: v.created_at,
      timeDeltaSec: v.timeDeltaSec,
      posDelta: v.posDelta,
      reasons: v.reasons,
      suspicionScore: v.suspicionScore,
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/admin/api/devices', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT v.device_uid AS deviceUid, COUNT(*) AS voteCount,
              MIN(v.created_at) AS firstSeen, MAX(v.created_at) AS lastSeen,
              COALESCE(dn.note, '') AS note
       FROM votes v LEFT JOIN device_notes dn ON dn.device_uid = v.device_uid
       WHERE v.device_uid IS NOT NULL
       GROUP BY v.device_uid, dn.note
       ORDER BY voteCount DESC`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

app.put('/admin/api/devices/:deviceUid/note', async (req, res) => {
  const { deviceUid } = req.params;
  if (!DEVICE_UID_RE.test(deviceUid)) {
    return res.status(400).json({ error: 'invalid device_uid' });
  }

  const { note } = req.body || {};
  if (typeof note !== 'string') {
    return res.status(400).json({ error: 'invalid note' });
  }
  const trimmedNote = note.length > NOTE_MAX_LENGTH ? note.slice(0, NOTE_MAX_LENGTH) : note;

  try {
    await pool.execute(
      `INSERT INTO device_notes (device_uid, note) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE note = VALUES(note), updated_at = CURRENT_TIMESTAMP(3)`,
      [deviceUid, trimmedNote]
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
});

function startAdminServer() {
  const PORT = process.env.ADMIN_PORT || 4001;
  app.listen(PORT, () => {
    console.log(`vote-log-admin-server listening on port ${PORT}`);
  });
}

module.exports = { startAdminServer };
