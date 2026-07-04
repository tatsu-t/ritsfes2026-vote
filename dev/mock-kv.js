const express = require('express');

// Upstash Redis REST APIのうち、api/*.jsが実際に使うコマンドだけを模したインメモリ実装。
// 本番コードは無改造でこのモックに向けられるようにパス形式をUpstashに合わせている。
function createMockKvRouter() {
  const router = express.Router();
  const hashes = {}; // key -> { field: 'stringValue' }
  const strings = {}; // key -> 'stringValue'

  router.post('/hincrby/:key/:field/:value', (req, res) => {
    const { key, field, value } = req.params;
    if (!hashes[key]) hashes[key] = {};
    const next = (parseInt(hashes[key][field] || '0', 10) || 0) + parseInt(value, 10);
    hashes[key][field] = String(next);
    res.json({ result: next });
  });

  router.get('/hgetall/:key', (req, res) => {
    const hash = hashes[req.params.key] || {};
    const flat = [];
    for (const [field, value] of Object.entries(hash)) flat.push(field, value);
    res.json({ result: flat });
  });

  router.get('/get/:key', (req, res) => {
    const has = Object.prototype.hasOwnProperty.call(strings, req.params.key);
    res.json({ result: has ? strings[req.params.key] : null });
  });

  router.post('/set/:key/:value', (req, res) => {
    strings[req.params.key] = req.params.value;
    res.json({ result: 'OK' });
  });

  router.get(/^\/mget\/(.+)$/, (req, res) => {
    const keys = req.params[0].split('/');
    res.json({
      result: keys.map((k) => (Object.prototype.hasOwnProperty.call(strings, k) ? strings[k] : null)),
    });
  });

  router.post(/^\/del\/(.+)$/, (req, res) => {
    const keys = req.params[0].split('/');
    let count = 0;
    keys.forEach((k) => {
      if (hashes[k] !== undefined) { delete hashes[k]; count++; }
      if (strings[k] !== undefined) { delete strings[k]; count++; }
    });
    res.json({ result: count });
  });

  return router;
}

module.exports = { createMockKvRouter };
