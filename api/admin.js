const VENUE_IDS = [
  'c1_1','c1_2','c1_3','c1_4','c1_5',
  'c2_1','c2_2','c2_3','c2_4','c2_5','c2_6',
  'c3_1','c3_2','c3_3','c3_4','c3_5','c3_6',
  'h1_a','h1_b','h1_c','h1_d','h1_e','h1_f','h1_g','h1_h','h1_i','h1_j',
  'h2_a','h2_b','h2_c','h2_d','h2_e','h2_f','h2_g','h2_h','h2_i',
  'h3_a','h3_b','h3_c','h3_d','h3_e','h3_f','h3_g','h3_h','h3_i',
];

function getKVConfig() {
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { confirm } = req.body || {};
  if (confirm !== 'RESET_ALL')
    return res.status(400).json({ error: '確認コードが違います' });

  const { url, token } = getKVConfig();
  if (!url || !token) return res.status(200).json({ ok: true });

  try {
    const keys = VENUE_IDS.map(id => `vote:${id}:scores`);
    await fetch(`${url}/del/${keys.map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
};
