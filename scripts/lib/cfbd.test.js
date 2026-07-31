const { test } = require('node:test');
const assert = require('node:assert');
const { cfbdGet } = require('./cfbd');

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test('returns parsed JSON on 200', async () => {
  const out = await cfbdGet('/recruiting/players', { year: 2027 },
    { key: 'k', fetchImpl: ok([{ name: 'A' }]) });
  assert.deepStrictEqual(out, [{ name: 'A' }]);
});

test('sends bearer token and encodes query params', async () => {
  let seenUrl, seenHeaders;
  await cfbdGet('/recruiting/players', { team: 'Penn State' }, {
    key: 'secret',
    fetchImpl: async (url, opts) => {
      seenUrl = url; seenHeaders = opts.headers;
      return { ok: true, status: 200, json: async () => [] };
    }
  });
  assert.match(seenUrl, /team=Penn\+State|team=Penn%20State/);
  assert.strictEqual(seenHeaders.Authorization, 'Bearer secret');
});

test('retries once on 429 then succeeds', async () => {
  let calls = 0;
  const out = await cfbdGet('/x', {}, {
    key: 'k', backoffMs: 0,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 429, text: async () => 'slow down' };
      return { ok: true, status: 200, json: async () => ['ok'] };
    }
  });
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(out, ['ok']);
});

test('throws after a second 429', async () => {
  await assert.rejects(cfbdGet('/x', {}, {
    key: 'k', backoffMs: 0,
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'nope' })
  }), /429/);
});

test('throws immediately on 401 without retrying', async () => {
  let calls = 0;
  await assert.rejects(cfbdGet('/x', {}, {
    key: 'bad', backoffMs: 0,
    fetchImpl: async () => { calls++; return { ok: false, status: 401, text: async () => 'unauthorized' }; }
  }), /401/);
  assert.strictEqual(calls, 1);
});

test('throws when no key is configured', async () => {
  await assert.rejects(cfbdGet('/x', {}, { key: '', fetchImpl: ok([]) }), /CFBD_API_KEY/);
});
