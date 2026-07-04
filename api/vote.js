const VALID_IDS = [
  'c1_1','c1_2','c1_3','c1_4','c1_5',
  'c2_1','c2_2','c2_3','c2_4','c2_5','c2_6',
  'c3_1','c3_2','c3_3','c3_4','c3_5','c3_6',
  'h1_a','h1_b','h1_c','h1_d','h1_e','h1_f','h1_g','h1_h','h1_i','h1_j',
  'h2_a','h2_b','h2_c','h2_d','h2_e','h2_f','h2_g','h2_h','h2_i',
  'h3_a','h3_b','h3_c','h3_d','h3_e','h3_f','h3_g','h3_h','h3_i',
  'test_1',
];

function getKVConfig() {
  // Upstashが設定する環境変数名に対応（複数パターン試みる）
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

async function kvHincrby(key, field, value) {
  const { url, token } = getKVConfig();
  if (!url || !token) return;
  await fetch(`${url}/hincrby/${encodeURIComponent(key)}/${encodeURIComponent(field)}/${value}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

const VOTE_LOG_API_URL = process.env.VOTE_LOG_API_URL;
const VOTE_LOG_API_SECRET = process.env.VOTE_LOG_API_SECRET;

// tatsunote2上の生ログサーバーへ非同期転送。失敗しても投票結果には影響させない
async function forwardVoteLog(payload) {
  if (!VOTE_LOG_API_URL || !VOTE_LOG_API_SECRET) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    await fetch(VOTE_LOG_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VOTE_LOG_API_SECRET}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    console.error(err);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    venueId, score, voterType,
    tapX, tapY, viewportW, viewportH, userAgent, deviceUid,
  } = req.body || {};

  if (!VALID_IDS.includes(venueId))
    return res.status(400).json({ error: '無効な会場IDです' });
  if (!Number.isInteger(score) || score < 1 || score > 5)
    return res.status(400).json({ error: '無効なスコアです' });
  if (voterType !== '在校生' && voterType !== '来場者')
    return res.status(400).json({ error: '無効な投票者タイプです' });

  const key = `vote:${venueId}:scores`;
  try {
    const kvPromise = Promise.all([
      kvHincrby(key, 'total', 1),
      kvHincrby(key, 'sum', score),
      voterType === '在校生'
        ? kvHincrby(key, 'student_total', 1)
        : kvHincrby(key, 'visitor_total', 1),
      voterType === '在校生'
        ? kvHincrby(key, 'student_sum', score)
        : kvHincrby(key, 'visitor_sum', score),
    ]);
    const logPromise = forwardVoteLog({
      venueId, score, voterType,
      tapX, tapY, viewportW, viewportH, userAgent, deviceUid,
    });
    await Promise.all([kvPromise, logPromise]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
};
