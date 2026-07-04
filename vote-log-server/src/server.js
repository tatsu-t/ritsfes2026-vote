const crypto = require('crypto');
const express = require('express');
const mysql = require('mysql2/promise');

// api/vote.jsのVALID_IDSと同期させること
const VALID_VENUE_IDS = [
  'c1_1','c1_2','c1_3','c1_4','c1_5',
  'c2_1','c2_2','c2_3','c2_4','c2_5','c2_6',
  'c3_1','c3_2','c3_3','c3_4','c3_5','c3_6',
  'h1_a','h1_b','h1_c','h1_d','h1_e','h1_f','h1_g','h1_h','h1_i','h1_j',
  'h2_a','h2_b','h2_c','h2_d','h2_e','h2_f','h2_g','h2_h','h2_i',
  'h3_a','h3_b','h3_c','h3_d','h3_e','h3_f','h3_g','h3_h','h3_i',
  'test_1',
];

const DEVICE_UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

const app = express();
app.use(express.json({ limit: '10kb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// api/auth.jsのトークン方式(ペイロード:有効期限:HMAC署名 のbase64url)を踏襲した使い捨てデバッグトークン検証。
// AUTH_SECRET自体を知らなくても、AUTH_SECRETでHMAC署名した「debug:<期限>:<署名>」を発行できる。
function verifyDebugToken(token) {
  try {
    const secret = process.env.AUTH_SECRET || '';
    if (!secret) return false;
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [tag, expires, sig] = decoded.split(':');
    if (tag !== 'debug' || !expires || !sig) return false;
    if (Date.now() > Number(expires)) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${tag}:${expires}`).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

function isAuthorized(req) {
  const header = req.get('Authorization') || '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  const token = header.slice(prefix.length);
  const secret = process.env.AUTH_SECRET || '';
  if (secret) {
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(secret);
    if (tokenBuf.length === secretBuf.length && crypto.timingSafeEqual(tokenBuf, secretBuf)) {
      return true;
    }
  }
  return verifyDebugToken(token);
}

// 0〜100000の範囲外や非整数はnullにclampする
function clampInt(value, min, max) {
  if (!Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function sanitizeUserAgent(value) {
  if (typeof value !== 'string') return null;
  return value.slice(0, 512);
}

function sanitizeDeviceUid(value) {
  if (typeof value !== 'string' || !DEVICE_UID_RE.test(value)) return null;
  return value;
}

app.post('/log-vote', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const {
    venueId, score, voterType,
    tapX, tapY, viewportW, viewportH, userAgent, deviceUid,
  } = req.body || {};

  if (!VALID_VENUE_IDS.includes(venueId)) {
    return res.status(400).json({ error: '無効な会場IDです' });
  }
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: '無効なスコアです' });
  }
  if (voterType !== '在校生' && voterType !== '来場者') {
    return res.status(400).json({ error: '無効な投票者タイプです' });
  }

  const safeTapX = clampInt(tapX, 0, 100000);
  const safeTapY = clampInt(tapY, 0, 100000);
  const safeViewportW = clampInt(viewportW, 0, 100000);
  const safeViewportH = clampInt(viewportH, 0, 100000);
  const safeUserAgent = sanitizeUserAgent(userAgent);
  const safeDeviceUid = sanitizeDeviceUid(deviceUid);

  try {
    await pool.execute(
      `INSERT INTO votes
        (venue_id, voter_type, score, tap_x, tap_y, viewport_w, viewport_h, user_agent, device_uid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [venueId, voterType, score, safeTapX, safeTapY, safeViewportW, safeViewportH, safeUserAgent, safeDeviceUid]
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal' });
  }
});

function startVoteServer() {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`vote-log-server listening on port ${PORT}`);
  });
}

module.exports = { startVoteServer, pool };
