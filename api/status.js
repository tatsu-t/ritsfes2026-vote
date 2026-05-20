// api/status.js — 各会場の受付状態を管理

function getKVConfig() {
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return { url, token };
}

async function kvGet(key) {
  const { url, token } = getKVConfig();
  if (!url || !token) return null;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return json.result;
}

async function kvSet(key, value) {
  const { url, token } = getKVConfig();
  if (!url || !token) return;
  await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function kvMget(keys) {
  const { url, token } = getKVConfig();
  if (!url || !token) return keys.map(() => null);
  const res = await fetch(`${url}/mget/${keys.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  // 配列形式で返る
  if (Array.isArray(json.result)) return json.result;
  return keys.map(() => null);
}

const VENUE_IDS = [
  'c1_1','c1_2','c1_3','c1_4','c1_5',
  'c2_1','c2_2','c2_3','c2_4','c2_5','c2_6',
  'c3_1','c3_2','c3_3','c3_4','c3_5','c3_6',
  'h1_a','h1_b','h1_c','h1_d','h1_e','h1_f','h1_g','h1_h','h1_i','h1_j',
  'h2_a','h2_b','h2_c','h2_d','h2_e','h2_f','h2_g','h2_h','h2_i',
  'h3_a','h3_b','h3_c','h3_d','h3_e','h3_f','h3_g','h3_h','h3_i',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: 全会場または特定会場のステータスを取得
  if (req.method === 'GET') {
    const venueId = req.query.venueId;
    try {
      if (venueId) {
        // 特定会場
        const val = await kvGet(`status:${venueId}`);
        return res.status(200).json({ venueId, isOpen: val === 'open' });
      } else {
        // 全会場まとめて取得
        const keys = VENUE_IDS.map(id => `status:${id}`);
        const vals = await kvMget(keys);
        const result = {};
        VENUE_IDS.forEach((id, i) => {
          result[id] = vals[i] === 'open';
        });
        return res.status(200).json(result);
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'サーバーエラー' });
    }
  }

  // POST: ステータスを更新
  if (req.method === 'POST') {
    const { venueId, action } = req.body || {};
    // action: 'open' | 'close' | 'open_all' | 'close_all'
    try {
      if (action === 'open_all') {
        await Promise.all(VENUE_IDS.map(id => kvSet(`status:${id}`, 'open')));
        return res.status(200).json({ ok: true });
      }
      if (action === 'close_all') {
        await Promise.all(VENUE_IDS.map(id => kvSet(`status:${id}`, 'closed')));
        return res.status(200).json({ ok: true });
      }
      if (!venueId || !VENUE_IDS.includes(venueId)) {
        return res.status(400).json({ error: '無効な会場IDです' });
      }
      if (action === 'open') {
        await kvSet(`status:${venueId}`, 'open');
        return res.status(200).json({ ok: true });
      }
      if (action === 'close') {
        await kvSet(`status:${venueId}`, 'closed');
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: '無効なアクションです' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'サーバーエラー' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
