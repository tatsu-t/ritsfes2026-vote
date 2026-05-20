const VENUES = [
  {id:'c1_1',name:'中1 1組',grade:'中学1年'},
  {id:'c1_2',name:'中1 2組',grade:'中学1年'},
  {id:'c1_3',name:'中1 3組',grade:'中学1年'},
  {id:'c1_4',name:'中1 4組',grade:'中学1年'},
  {id:'c1_5',name:'中1 5組',grade:'中学1年'},
  {id:'c2_1',name:'中2 1組',grade:'中学2年'},
  {id:'c2_2',name:'中2 2組',grade:'中学2年'},
  {id:'c2_3',name:'中2 3組',grade:'中学2年'},
  {id:'c2_4',name:'中2 4組',grade:'中学2年'},
  {id:'c2_5',name:'中2 5組',grade:'中学2年'},
  {id:'c2_6',name:'中2 6組',grade:'中学2年'},
  {id:'c3_1',name:'中3 1組',grade:'中学3年'},
  {id:'c3_2',name:'中3 2組',grade:'中学3年'},
  {id:'c3_3',name:'中3 3組',grade:'中学3年'},
  {id:'c3_4',name:'中3 4組',grade:'中学3年'},
  {id:'c3_5',name:'中3 5組',grade:'中学3年'},
  {id:'c3_6',name:'中3 6組',grade:'中学3年'},
  {id:'h1_a',name:'高1 Aクラス',grade:'高校1年'},
  {id:'h1_b',name:'高1 Bクラス',grade:'高校1年'},
  {id:'h1_c',name:'高1 Cクラス',grade:'高校1年'},
  {id:'h1_d',name:'高1 Dクラス',grade:'高校1年'},
  {id:'h1_e',name:'高1 Eクラス',grade:'高校1年'},
  {id:'h1_f',name:'高1 Fクラス',grade:'高校1年'},
  {id:'h1_g',name:'高1 Gクラス',grade:'高校1年'},
  {id:'h1_h',name:'高1 Hクラス',grade:'高校1年'},
  {id:'h1_i',name:'高1 Iクラス',grade:'高校1年'},
  {id:'h1_j',name:'高1 Jクラス',grade:'高校1年'},
  {id:'h2_a',name:'高2 Aクラス',grade:'高校2年'},
  {id:'h2_b',name:'高2 Bクラス',grade:'高校2年'},
  {id:'h2_c',name:'高2 Cクラス',grade:'高校2年'},
  {id:'h2_d',name:'高2 Dクラス',grade:'高校2年'},
  {id:'h2_e',name:'高2 Eクラス',grade:'高校2年'},
  {id:'h2_f',name:'高2 Fクラス',grade:'高校2年'},
  {id:'h2_g',name:'高2 Gクラス',grade:'高校2年'},
  {id:'h2_h',name:'高2 Hクラス',grade:'高校2年'},
  {id:'h2_i',name:'高2 Iクラス',grade:'高校2年'},
  {id:'h3_a',name:'高3 Aクラス',grade:'高校3年'},
  {id:'h3_b',name:'高3 Bクラス',grade:'高校3年'},
  {id:'h3_c',name:'高3 Cクラス',grade:'高校3年'},
  {id:'h3_d',name:'高3 Dクラス',grade:'高校3年'},
  {id:'h3_e',name:'高3 Eクラス',grade:'高校3年'},
  {id:'h3_f',name:'高3 Fクラス',grade:'高校3年'},
  {id:'h3_g',name:'高3 Gクラス',grade:'高校3年'},
  {id:'h3_h',name:'高3 Hクラス',grade:'高校3年'},
  {id:'h3_i',name:'高3 Iクラス',grade:'高校3年'},
];

function getKVConfig() {
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

async function kvHgetall(key) {
  const { url, token } = getKVConfig();
  if (!url || !token) return null;
  const res = await fetch(`${url}/hgetall/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return json.result || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const results = await Promise.all(
      VENUES.map(async (v) => {
        const data = await kvHgetall(`vote:${v.id}:scores`);
        return {
          venueId:      v.id,
          venueName:    v.name,
          grade:        v.grade,
          total:        data ? parseInt(data.total         || '0') : 0,
          sum:          data ? parseInt(data.sum           || '0') : 0,
          studentTotal: data ? parseInt(data.student_total || '0') : 0,
          studentSum:   data ? parseInt(data.student_sum   || '0') : 0,
          visitorTotal: data ? parseInt(data.visitor_total || '0') : 0,
          visitorSum:   data ? parseInt(data.visitor_sum   || '0') : 0,
        };
      })
    );
    return res.status(200).json(results);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
};
