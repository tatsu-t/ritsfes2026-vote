// ローカル動作確認用サーバー。Vercelにはデプロイされない(vercel.jsonからは参照しない)。
const PORT = process.env.DEV_PORT || 3500;

process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || `http://localhost:${PORT}/__mock_kv`;
process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'dev-local-token';
process.env.APP_PASSWORD = process.env.APP_PASSWORD || 'devpass123';

const path = require('path');
const express = require('express');
const { createMockKvRouter } = require('./mock-kv');

const app = express();
app.use(express.json());
app.use('/__mock_kv', createMockKvRouter());

function mount(route, handlerPath) {
  const handler = require(handlerPath);
  app.all(route, (req, res) => handler(req, res));
}

mount('/api/vote', '../api/vote.js');
mount('/api/results', '../api/results.js');
mount('/api/admin', '../api/admin.js');
mount('/api/status', '../api/status.js');
mount('/api/auth', '../api/auth.js');

const ROOT = path.join(__dirname, '..');
for (const page of ['vote', 'results', 'admin']) {
  app.get('/' + page, (req, res) => res.sendFile(path.join(ROOT, page + '.html')));
}
app.use(express.static(ROOT));

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}/  (password: ${process.env.APP_PASSWORD})`);
});
