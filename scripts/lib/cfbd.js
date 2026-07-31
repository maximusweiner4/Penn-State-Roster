const BASE = 'https://api.collegefootballdata.com';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Free tier is 1,000 calls/month. Four calls/day is ~124/month.
async function cfbdGet(path, params = {}, opts = {}) {
  const {
    key = process.env.CFBD_API_KEY,
    fetchImpl = globalThis.fetch,
    backoffMs = 2000
  } = opts;

  if (!key) throw new Error('CFBD_API_KEY is not set');

  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' };

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl(url, { headers });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt === 0) { await sleep(backoffMs); continue; }
    const body = await res.text().catch(() => '');
    throw new Error(`CFBD ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
}

module.exports = { cfbdGet, BASE };
