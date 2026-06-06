// api/auth.js — パスワード認証 & セッショントークン管理
const crypto = require('crypto');

// トークンの有効期限（ミリ秒）: 12時間
const TOKEN_TTL = 12 * 60 * 60 * 1000;

// ページ種別
const VALID_PAGES = ['vote', 'results', 'admin'];

// 簡易トークン生成: ページ名 + 有効期限 + HMAC 署名
function makeToken(page) {
  const secret = process.env.APP_PASSWORD || 'changeme';
  const expires = Date.now() + TOKEN_TTL;
  const payload = `${page}:${expires}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // Base64URL エンコードで URL パラメータにも使えるように
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyToken(token, page) {
  try {
    const secret = process.env.APP_PASSWORD || 'changeme';
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [p, expires, sig] = decoded.split(':');
    if (p !== page) return false;
    if (Date.now() > Number(expires)) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${p}:${expires}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/auth?token=xxx&page=yyy — トークン検証
  if (req.method === 'GET') {
    const { token, page } = req.query;
    if (!token || !page || !VALID_PAGES.includes(page)) {
      return res.status(400).json({ valid: false });
    }
    return res.status(200).json({ valid: verifyToken(token, page) });
  }

  // POST /api/auth — パスワード照合 → トークン発行
  if (req.method === 'POST') {
    const { password, page } = req.body || {};
    const correct = process.env.APP_PASSWORD;

    if (!correct) {
      // 環境変数未設定の場合は開発用に通過させる（本番では必ず設定すること）
      console.warn('WARNING: APP_PASSWORD is not set');
    }

    if (!page || !VALID_PAGES.includes(page)) {
      return res.status(400).json({ ok: false, error: '無効なページです' });
    }

    if (!correct || password !== correct) {
      // タイミング攻撃対策のため少し遅延
      await new Promise(r => setTimeout(r, 300));
      return res.status(401).json({ ok: false });
    }

    const token = makeToken(page);
    return res.status(200).json({ ok: true, token });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
