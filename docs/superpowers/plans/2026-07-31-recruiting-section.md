# Recruiting Section Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `RECRUITING` top-level section to psudepthchart.com showing Penn State's incoming recruiting classes, fed by the CollegeFootballData API through a daily CI job.

**Architecture:** A Node fetcher (`scripts/fetch-recruits.js`) calls CFBD, normalizes the data, and commits `scripts/recruits.json`. A separate GitHub Actions workflow runs it daily. `index.html` gains a section switch and a lazy-loaded card grid. Class visibility is derived from `roster.json` rather than the calendar, so no dates are hardcoded.

**Tech Stack:** Node 24 (global `fetch`, built-in `node:test` runner — no new dependencies), vanilla JS in `index.html`, Tailwind via CDN, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-31-recruiting-tab-design.md`

**Prerequisite (human, blocking Task 8+):** Register a free key at collegefootballdata.com/key and add it as repo secret `CFBD_API_KEY`. Tasks 1-7 can be completed without it.

---

## A note on testing strategy

Tasks 1-8 (the fetcher) are pure Node and get strict TDD with `node --test`.

Tasks 9-17 (the UI) live inside a 3,262-line `index.html` monolith with no
browser test harness, and introducing one is out of scope. Those tasks specify
**explicit manual verification steps with expected observations** instead. This
is a real gap, not an oversight — do not claim a UI task passes without
performing its stated check.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `scripts/lib/normalize.js` | create | Pure functions: height, position, name normalization |
| `scripts/lib/sort.js` | create | Total, null-safe recruit ordering |
| `scripts/lib/roster-match.js` | create | Decide which classes/recruits are already on the roster |
| `scripts/lib/cfbd.js` | create | CFBD HTTP client: auth, 429 retry, error surfacing |
| `scripts/fetch-recruits.js` | create | Orchestration, validation guard, atomic write |
| `scripts/recruits.json` | create | Seed + committed output |
| `scripts/lib/*.test.js` | create | Unit tests |
| `.github/workflows/update-recruits.yml` | create | Daily CI |
| `.github/workflows/update-roster.yml` | modify | Rebase-before-push race fix |
| `index.html` | modify | Section switch, recruiting render, guards, `esc()` |
| `service-worker.js` | modify | `CACHE_NAME` v5 only — no precache |

Splitting the fetcher into `lib/` modules keeps each file small enough to hold
in context and makes the pure logic testable without network access. This is a
new subtree, so it does not disturb the existing flat `scripts/` convention.

---

## Chunk 1: Fetcher

### Task 1: Test infrastructure and seed file

**Files:**
- Modify: `scripts/package.json`
- Create: `scripts/recruits.json`

- [ ] **Step 1: Add the test script**

In `scripts/package.json`, add to `"scripts"`:

```json
"test": "node --test lib/"
```

- [ ] **Step 2: Verify the runner works with zero tests**

Run: `cd scripts && npm test`
Expected: exits 0, reports `tests 0`. (If it errors on the missing `lib/`
directory, create it with `mkdir lib` and re-run.)

- [ ] **Step 3: Create the seed file**

`scripts/recruits.json` — this must exist before the UI ships, or a missing
`CFBD_API_KEY` on first run leaves the client with a 404 and no defined render:

```json
{
  "updated": null,
  "classes": []
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/package.json scripts/recruits.json
git commit -m "chore: add node:test runner and seed recruits.json"
```

---

### Task 2: Height and position normalization

**Files:**
- Create: `scripts/lib/normalize.js`
- Test: `scripts/lib/normalize.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { heightToFeetInches, mapPosition, normalizeName } = require('./normalize');

test('heightToFeetInches converts inches to feet-inches', () => {
  assert.strictEqual(heightToFeetInches(75), '6-3');
  assert.strictEqual(heightToFeetInches(72), '6-0');
  assert.strictEqual(heightToFeetInches(69), '5-9');
});

test('heightToFeetInches passes through null and garbage as empty string', () => {
  assert.strictEqual(heightToFeetInches(null), '');
  assert.strictEqual(heightToFeetInches(undefined), '');
  assert.strictEqual(heightToFeetInches(0), '');
});

test('mapPosition maps CFBD vocabulary to roster vocabulary', () => {
  assert.strictEqual(mapPosition('OT'), 'OL');
  assert.strictEqual(mapPosition('SDE'), 'DE');
  assert.strictEqual(mapPosition('APB'), 'RB');
  assert.strictEqual(mapPosition('QB'), 'QB');
});

test('mapPosition passes unmapped positions through verbatim', () => {
  assert.strictEqual(mapPosition('XYZ'), 'XYZ');
});

test('mapPosition returns empty string for null', () => {
  assert.strictEqual(mapPosition(null), '');
});

test('normalizeName lowercases, strips punctuation and generational suffixes', () => {
  assert.strictEqual(normalizeName("Amar'e Glover"), 'amare glover');
  assert.strictEqual(normalizeName('John Smith Jr.'), 'john smith');
  assert.strictEqual(normalizeName('Robert Downey III'), 'robert downey');
  assert.strictEqual(normalizeName('  Zion   Tracy  '), 'zion tracy');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && npm test`
Expected: FAIL — `Cannot find module './normalize'`

- [ ] **Step 3: Implement**

`scripts/lib/normalize.js`. The position table's **values** must stay inside
the roster vocabulary confirmed in `scripts/roster.json`:
`QB RB WR TE OL DL DT DE LB CB S K P LS`.

```javascript
// CFBD position codes -> the vocabulary used in roster.json.
// Values MUST stay within: QB RB WR TE OL DL DT DE LB CB S K P LS
const POSITION_MAP = {
  QB: 'QB',
  RB: 'RB', APB: 'RB', FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  OT: 'OL', OG: 'OL', OC: 'OL', C: 'OL', OL: 'OL',
  DT: 'DT', NT: 'DT',
  DE: 'DE', SDE: 'DE', WDE: 'DE', EDGE: 'DE',
  DL: 'DL',
  LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB',
  CB: 'CB',
  S: 'S', SAF: 'S', FS: 'S', SS: 'S',
  K: 'K', PK: 'K',
  P: 'P',
  LS: 'LS'
};

function heightToFeetInches(inches) {
  if (!inches || typeof inches !== 'number' || inches <= 0) return '';
  return `${Math.floor(inches / 12)}-${inches % 12}`;
}

function mapPosition(pos) {
  if (!pos) return '';
  const key = String(pos).toUpperCase().trim();
  if (POSITION_MAP[key]) return POSITION_MAP[key];
  console.warn(`[fetch-recruits] unmapped position "${pos}" — passing through`);
  return pos;
}

function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[.'’,]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { heightToFeetInches, mapPosition, normalizeName, POSITION_MAP };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && npm test`
Expected: PASS, 6 tests. Unmapped-position test prints a warning — that is
intended behavior, not noise.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.js scripts/lib/normalize.test.js
git commit -m "feat: add height, position, and name normalization"
```

---

### Task 3: Null-safe total ordering

**Files:**
- Create: `scripts/lib/sort.js`
- Test: `scripts/lib/sort.test.js`

Unrated recruits are common in early classes. An unstable sort would scatter
them and produce spurious daily diffs, which in turn cause noise commits.

- [ ] **Step 1: Write the failing tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { sortCommits } = require('./sort');

const names = (a) => a.map(r => r.name);

test('sorts by rating descending', () => {
  const out = sortCommits([
    { name: 'B', rating: 0.91, stars: 4, ranking: 50 },
    { name: 'A', rating: 0.98, stars: 5, ranking: 10 }
  ]);
  assert.deepStrictEqual(names(out), ['A', 'B']);
});

test('null ratings sort last regardless of input order', () => {
  const out = sortCommits([
    { name: 'Unrated', rating: null, stars: null, ranking: null },
    { name: 'Rated', rating: 0.80, stars: 3, ranking: 900 }
  ]);
  assert.deepStrictEqual(names(out), ['Rated', 'Unrated']);
});

test('ties break by stars, then ranking, then name', () => {
  const out = sortCommits([
    { name: 'Zeta',  rating: 0.90, stars: 4, ranking: 100 },
    { name: 'Alpha', rating: 0.90, stars: 4, ranking: 100 },
    { name: 'Beta',  rating: 0.90, stars: 4, ranking: 50  },
    { name: 'Gamma', rating: 0.90, stars: 5, ranking: 999 }
  ]);
  assert.deepStrictEqual(names(out), ['Gamma', 'Beta', 'Alpha', 'Zeta']);
});

test('is deterministic across repeated shuffles', () => {
  const input = [
    { name: 'A', rating: null, stars: null, ranking: null },
    { name: 'B', rating: null, stars: 4,    ranking: null },
    { name: 'C', rating: 0.9,  stars: 4,    ranking: 1    }
  ];
  const first = names(sortCommits(input));
  for (let i = 0; i < 20; i++) {
    const shuffled = [...input].sort(() => Math.random() - 0.5);
    assert.deepStrictEqual(names(sortCommits(shuffled)), first);
  }
});

test('does not mutate its input', () => {
  const input = [{ name: 'B', rating: 0.1 }, { name: 'A', rating: 0.9 }];
  sortCommits(input);
  assert.deepStrictEqual(names(input), ['B', 'A']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && npm test`
Expected: FAIL — `Cannot find module './sort'`

- [ ] **Step 3: Implement**

```javascript
// Nulls always sort last. desc: higher is better. asc: lower is better.
function cmpDesc(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function cmpAsc(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function sortCommits(commits) {
  return [...commits].sort((x, y) =>
    cmpDesc(x.rating, y.rating) ||
    cmpDesc(x.stars, y.stars) ||
    cmpAsc(x.ranking, y.ranking) ||
    String(x.name || '').localeCompare(String(y.name || ''))
  );
}

module.exports = { sortCommits };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && npm test`
Expected: PASS, 11 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/sort.js scripts/lib/sort.test.js
git commit -m "feat: add null-safe deterministic recruit ordering"
```

---

### Task 4: Roster matching — replaces the calendar rule

**Files:**
- Create: `scripts/lib/roster-match.js`
- Test: `scripts/lib/roster-match.test.js`

This is the load-bearing decision from the spec review. A class hides only once
**every** commit appears in `roster.json`; partial matches are badged. No dates
are involved.

- [ ] **Step 1: Write the failing tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { annotateClass, shouldRenderClass } = require('./roster-match');

const roster = [{ name: 'Zion Tracy' }, { name: "Amar'e Glover" }];

test('annotateClass flags commits already on the roster', () => {
  const out = annotateClass(
    { year: 2026, commits: [{ name: 'Zion Tracy' }, { name: 'New Kid' }] },
    roster
  );
  assert.strictEqual(out.commits[0].onRoster, true);
  assert.strictEqual(out.commits[1].onRoster, false);
});

test('matching ignores punctuation and suffixes', () => {
  const out = annotateClass(
    { year: 2026, commits: [{ name: 'Amare Glover Jr.' }] },
    roster
  );
  assert.strictEqual(out.commits[0].onRoster, true);
});

test('shouldRenderClass hides a class fully absorbed into the roster', () => {
  const cls = annotateClass({ year: 2026, commits: [{ name: 'Zion Tracy' }] }, roster);
  assert.strictEqual(shouldRenderClass(cls), false);
});

test('shouldRenderClass shows a partially enrolled class', () => {
  const cls = annotateClass(
    { year: 2026, commits: [{ name: 'Zion Tracy' }, { name: 'New Kid' }] },
    roster
  );
  assert.strictEqual(shouldRenderClass(cls), true);
});

test('shouldRenderClass hides an empty class', () => {
  assert.strictEqual(shouldRenderClass({ year: 2028, commits: [] }), false);
});

test('an empty roster leaves every class visible', () => {
  const cls = annotateClass({ year: 2027, commits: [{ name: 'Anyone' }] }, []);
  assert.strictEqual(shouldRenderClass(cls), true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && npm test`
Expected: FAIL — `Cannot find module './roster-match'`

- [ ] **Step 3: Implement**

```javascript
const { normalizeName } = require('./normalize');

function annotateClass(cls, roster) {
  const onRoster = new Set((roster || []).map(p => normalizeName(p.name)));
  return {
    ...cls,
    commits: (cls.commits || []).map(c => ({
      ...c,
      onRoster: onRoster.has(normalizeName(c.name))
    }))
  };
}

// Hide a class only when it is empty, or when every commit has enrolled.
function shouldRenderClass(cls) {
  const commits = cls.commits || [];
  if (commits.length === 0) return false;
  return !commits.every(c => c.onRoster === true);
}

module.exports = { annotateClass, shouldRenderClass };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && npm test`
Expected: PASS, 17 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/roster-match.js scripts/lib/roster-match.test.js
git commit -m "feat: derive class visibility from roster instead of calendar"
```

---

### Task 5: CFBD client with 429 retry

**Files:**
- Create: `scripts/lib/cfbd.js`
- Test: `scripts/lib/cfbd.test.js`

- [ ] **Step 1: Write the failing tests**

Inject `fetch` so no network is touched.

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { cfbdGet } = require('./cfbd');

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test('returns parsed JSON on 200', async () => {
  const out = await cfbdGet('/recruiting/players', { year: 2027 }, {
    key: 'k', fetchImpl: ok([{ name: 'A' }])
  });
  assert.deepStrictEqual(out, [{ name: 'A' }]);
});

test('sends the bearer token and encodes query params', async () => {
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
  await assert.rejects(
    cfbdGet('/x', {}, {
      key: 'k', backoffMs: 0,
      fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'nope' })
    }),
    /429/
  );
});

test('throws immediately on 401 without retrying', async () => {
  let calls = 0;
  await assert.rejects(
    cfbdGet('/x', {}, {
      key: 'bad', backoffMs: 0,
      fetchImpl: async () => { calls++; return { ok: false, status: 401, text: async () => 'unauthorized' }; }
    }),
    /401/
  );
  assert.strictEqual(calls, 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && npm test`
Expected: FAIL — `Cannot find module './cfbd'`

- [ ] **Step 3: Implement**

```javascript
const BASE = 'https://api.collegefootballdata.com';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

    if (res.status === 429 && attempt === 0) {
      await sleep(backoffMs);
      continue;
    }
    const body = await res.text().catch(() => '');
    throw new Error(`CFBD ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
}

module.exports = { cfbdGet, BASE };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && npm test`
Expected: PASS, 22 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cfbd.js scripts/lib/cfbd.test.js
git commit -m "feat: add CFBD client with 429 backoff"
```

---

### Task 6: Change detection that does not churn `updated`

**Files:**
- Create: `scripts/lib/changed.js`
- Test: `scripts/lib/changed.test.js`

`update-roster.yml:51` commits only when `git diff --quiet` reports a change. A
fresh timestamp every run makes the diff permanently dirty — 365 noise commits
a year and no usable signal.

- [ ] **Step 1: Write the failing tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { buildOutput } = require('./changed');

const classes = [{ year: 2027, rank: 4, points: 271.5, commits: [{ name: 'A' }] }];

test('keeps the previous updated date when classes are unchanged', () => {
  const prev = { updated: '2026-07-01', classes };
  const out = buildOutput(classes, prev, '2026-07-31');
  assert.strictEqual(out.updated, '2026-07-01');
});

test('stamps a new date when classes change', () => {
  const prev = { updated: '2026-07-01', classes };
  const next = [{ ...classes[0], commits: [{ name: 'A' }, { name: 'B' }] }];
  const out = buildOutput(next, prev, '2026-07-31');
  assert.strictEqual(out.updated, '2026-07-31');
});

test('stamps a date when there is no previous file', () => {
  const out = buildOutput(classes, null, '2026-07-31');
  assert.strictEqual(out.updated, '2026-07-31');
});

test('stamps a date when the previous file is the null seed', () => {
  const out = buildOutput(classes, { updated: null, classes: [] }, '2026-07-31');
  assert.strictEqual(out.updated, '2026-07-31');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && npm test`
Expected: FAIL — `Cannot find module './changed'`

- [ ] **Step 3: Implement**

```javascript
function buildOutput(classes, previous, today) {
  const unchanged =
    previous &&
    JSON.stringify(previous.classes) === JSON.stringify(classes);

  return {
    updated: unchanged ? previous.updated : today,
    classes
  };
}

module.exports = { buildOutput };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && npm test`
Expected: PASS, 26 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/changed.js scripts/lib/changed.test.js
git commit -m "feat: stamp updated only when classes actually change"
```

---

### Task 7: Fetcher orchestration and validation guard

**Files:**
- Create: `scripts/fetch-recruits.js`

The guard mirrors the roster scraper's: **on any failure, write nothing**, so
the last-good file keeps serving and GitHub emails the failure.

- [ ] **Step 1: Implement**

```javascript
const fs = require('fs');
const path = require('path');
const { cfbdGet } = require('./lib/cfbd');
const { heightToFeetInches, mapPosition } = require('./lib/normalize');
const { sortCommits } = require('./lib/sort');
const { annotateClass, shouldRenderClass } = require('./lib/roster-match');
const { buildOutput } = require('./lib/changed');

const TEAM = 'Penn State';
const OUT = path.join(__dirname, 'recruits.json');
const ROSTER = path.join(__dirname, 'roster.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function fetchClass(year) {
  const players = await cfbdGet('/recruiting/players', {
    year, team: TEAM, classification: 'HighSchool'
  });

  // A thin class legitimately has no team-ranking row. Never fatal.
  let rank = null, points = null;
  try {
    const teams = await cfbdGet('/recruiting/teams', { year, team: TEAM });
    if (Array.isArray(teams) && teams.length) {
      rank = teams[0].rank ?? null;
      points = teams[0].points ?? null;
    }
  } catch (e) {
    console.warn(`[fetch-recruits] no team ranking for ${year}: ${e.message}`);
  }

  const commits = sortCommits((players || []).map(p => ({
    name: p.name,
    position: mapPosition(p.position),
    stars: p.stars ?? null,
    rating: p.rating ?? null,
    ranking: p.ranking ?? null,
    height: heightToFeetInches(p.height),
    weight: p.weight ?? null,
    city: p.city || '',
    state: p.stateProvince || '',
    school: p.school || ''
  })));

  return { year, rank, points, commits };
}

async function main() {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const years = [currentYear, currentYear + 1];

  const roster = readJson(ROSTER, []);

  const fetched = [];
  for (const year of years) {
    fetched.push(await fetchClass(year));
  }

  // Guard: total emptiness is an API problem, not reality.
  const total = fetched.reduce((n, c) => n + c.commits.length, 0);
  if (total === 0) {
    console.error('[fetch-recruits] every class came back empty — refusing to write');
    process.exit(1);
  }

  const classes = fetched
    .map(c => annotateClass(c, roster))
    .filter(shouldRenderClass);

  const previous = readJson(OUT, null);
  const today = now.toISOString().slice(0, 10);
  const output = buildOutput(classes, previous, today);

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`[fetch-recruits] wrote ${classes.length} class(es), ${total} commit(s)`);
}

main().catch(err => {
  console.error(`[fetch-recruits] FAILED: ${err.message}`);
  process.exit(1); // recruits.json is left untouched
});
```

- [ ] **Step 2: Verify the failure path leaves the file untouched**

This is the single most important guard. Run without a key:

```bash
cd scripts && cp recruits.json /tmp/before.json
CFBD_API_KEY= node fetch-recruits.js; echo "exit=$?"
diff recruits.json /tmp/before.json && echo "UNCHANGED - correct"
```

Expected: `exit=1`, and `UNCHANGED - correct`.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-recruits.js
git commit -m "feat: add CFBD recruiting fetcher with write-nothing-on-failure guard"
```

---

### Task 8: Workflows and the push-race fix

**Files:**
- Create: `.github/workflows/update-recruits.yml`
- Modify: `.github/workflows/update-roster.yml`

Both workflows push to `maximusweiner4.github.io`. Identical crons would race
and the loser's push is rejected. The recruits job (~2s) beats the roster job
(~40s), so the **roster** pipeline is the one that breaks — a regression in
working code.

- [ ] **Step 1: Fix the existing roster workflow first**

In `.github/workflows/update-roster.yml`, in the "Commit and push if changed"
step, insert before `git push`:

```yaml
          git pull --rebase origin maximusweiner4.github.io
          git push
```

- [ ] **Step 2: Commit the fix on its own**

```bash
git add .github/workflows/update-roster.yml
git commit -m "fix: rebase before push to avoid concurrent workflow rejection"
```

- [ ] **Step 3: Create the recruits workflow**

Note the offset cron (`30 11` vs the roster's `0 11`).

```yaml
name: Update Penn State Recruits

on:
  schedule:
    - cron: '30 11 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  update-recruits:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: maximusweiner4.github.io
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run unit tests
        run: cd scripts && npm test

      - name: Fetch recruits
        env:
          CFBD_API_KEY: ${{ secrets.CFBD_API_KEY }}
        run: node scripts/fetch-recruits.js

      - name: Check for changes
        id: git-check
        run: |
          git diff --quiet scripts/recruits.json || echo "changes=true" >> $GITHUB_OUTPUT

      - name: Commit and push if changed
        if: steps.git-check.outputs.changes == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add scripts/recruits.json
          git commit -m "Update recruits from CollegeFootballData

          Automated update on $(date -u +%Y-%m-%d)"
          git pull --rebase origin maximusweiner4.github.io
          git push
```

- [ ] **Step 4: Commit, push, and trigger manually**

```bash
git add .github/workflows/update-recruits.yml
git commit -m "feat: add daily recruiting fetch workflow"
git push origin maximusweiner4.github.io
gh workflow run update-recruits.yml --ref maximusweiner4.github.io
gh run watch
```

Expected: green. If it fails with `CFBD_API_KEY is not set`, the human
prerequisite is outstanding — stop and report rather than working around it.

- [ ] **Step 5: Verify real output**

```bash
git pull origin maximusweiner4.github.io
node -e "const d=require('./scripts/recruits.json');console.log(d.updated, d.classes.map(c=>c.year+':'+c.commits.length))"
```

Expected: a date and at least one class with a non-zero commit count.

---

## Chunk 2: UI

> Reminder: no browser test harness exists. Every task below states an explicit
> manual check. Do not mark one done without performing it.

### Task 9: HTML escaping helper

**Files:**
- Modify: `index.html`

Every render path interpolates raw into `app.innerHTML` (`index.html:1776`),
and `recruits.json` relays third-party 247/Rivals text.

- [ ] **Step 1: Add the helper**

Add near the top of the app class, beside the other utility methods:

```javascript
esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 2: Verify in the browser console**

Serve locally (`npx serve .`), open the site, and run:
`app.esc('<img src=x onerror=alert(1)>')`
Expected: the fully escaped string, no dialog.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add esc() helper for interpolated strings"
```

---

### Task 10: Section state, persistence, deep link

**Files:**
- Modify: `index.html` (state init near `:611`, reset near `:1166-1169`, team purge near `:684-689`)

- [ ] **Step 1: Add state and hash handling**

Beside `this.activeTab = 'offense';`:

```javascript
this.activeSection = (location.hash === '#recruiting')
  ? 'recruiting'
  : (localStorage.getItem('psu-active-section') || 'depth');
this.recruits = null;        // lazy-loaded
this.recruitsError = null;
```

Add the setter:

```javascript
setSection(section) {
  this.activeSection = section;
  localStorage.setItem('psu-active-section', section);
  history.replaceState(null, '', section === 'recruiting' ? '#recruiting' : ' ');
  if (section === 'recruiting' && !this.recruits) this.loadRecruits();
  this.render();
}
```

- [ ] **Step 2: Add to both cleanup paths**

In `confirmAppReset()` (`:1166-1169`) and the team-change purge (`:684-689`):

```javascript
localStorage.removeItem('psu-active-section');
```

Omitting this strands a user in RECRUITING with an otherwise-reset app.

- [ ] **Step 3: Verify**

In the console: `app.setSection('recruiting')` → URL shows `#recruiting`.
Reload → still recruiting. Run reset → returns to depth chart.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add activeSection state with persistence and deep link"
```

---

### Task 11: Guard the keyboard shortcuts

**Files:**
- Modify: `index.html:1426-1462`

Verified live: handlers are bound once to `document` and never torn down.
`Ctrl+Z` currently calls `this.undo()` and mutates `this.depthChart` **with no
visible feedback** when the field isn't rendered — silent data loss.

- [ ] **Step 1: Add the guard**

Wrap the undo, redo, and arrow-key branches (leave `d` for dark mode active):

```javascript
if (this.activeSection === 'depth' && (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
```

Apply the same `this.activeSection === 'depth' &&` prefix to the redo branch
and to the arrow-key block's outer condition at `:1441`.

- [ ] **Step 2: Verify the silent-mutation path is closed**

```javascript
app.setSection('depth');
// place a player, then:
app.setSection('recruiting');
const before = JSON.stringify(app.depthChart);
// press Ctrl+Z, then:
JSON.stringify(app.depthChart) === before   // must be true
```

Also press Left/Right and confirm `app.activeTab` is unchanged.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: guard keyboard shortcuts against silent depth chart mutation"
```

---

### Task 12: Section switch UI

**Files:**
- Modify: `index.html` (`render()` at `:1768-1807`)

- [ ] **Step 1: Add `renderSectionSwitch()`**

```javascript
renderSectionSwitch() {
  const btn = (key, label) => `
    <button role="tab" aria-selected="${this.activeSection === key}"
      onclick="app.setSection('${key}')"
      class="flex-1 sm:flex-none px-6 py-3 rounded-lg font-display font-semibold tracking-wide transition-all ${
        this.activeSection === key
          ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-lg'
          : 'bg-gray-200/50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
      }">${label}</button>`;
  return `<div role="tablist" class="flex gap-2 mb-4">
    ${btn('depth', 'DEPTH CHART')}${btn('recruiting', 'RECRUITING')}
  </div>`;
}
```

- [ ] **Step 2: Branch `render()` per the spec's render tree**

Render the switch always. When `activeSection === 'recruiting'`, skip
`renderTabs()`, `renderMobileControls()`, `renderField()`,
`renderKeyboardHints()`, the Export/Share/Print/Undo/Redo/Reset buttons, and
the header's depth-chart progress bar and roster pills (`:2190-2238`).

- [ ] **Step 3: Verify**

Toggle both ways. Depth chart must look **byte-identical** to before —
formation dropdown, field, and all buttons present. Recruiting shows only the
header identity and the switch.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add DEPTH CHART / RECRUITING section switch"
```

---

### Task 13: Lazy load with explicit states

**Files:**
- Modify: `index.html`

Must **not** go in `init()` — that awaits before clearing `this.loading`
(`:663-677`), so a slow file would delay the depth chart for every visitor.

- [ ] **Step 1: Implement**

```javascript
async loadRecruits() {
  try {
    const res = await fetch('scripts/recruits.json?t=' + Date.now());
    if (!res.ok) throw new Error(res.status);
    this.recruits = await res.json();
    this.recruitsError = null;
    try { localStorage.setItem('psu-recruits', JSON.stringify(this.recruits)); } catch (_) {}
  } catch (_) {
    const cached = localStorage.getItem('psu-recruits');
    if (cached) {
      this.recruits = JSON.parse(cached);
    } else {
      this.recruitsError = 'Recruiting data unavailable — check back shortly.';
    }
  }
  this.render();
}
```

- [ ] **Step 2: Verify all three paths**

Normal load; offline reload (cached data renders); `localStorage.removeItem('psu-recruits')`
plus offline (error message renders, no blank page).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: lazy-load recruits with cache and error fallbacks"
```

---

### Task 14: Class grid and recruit cards

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Implement the render**

Every interpolated field goes through `this.esc()`. Unrated recruits render
`NR` and **no** star row — drawing zero stars would imply a 0-star evaluation.

```javascript
renderStars(n) {
  if (n == null) return `<span class="text-xs text-gray-400">NR</span>`;
  return `<span aria-label="${n}-star recruit">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
}

renderRecruits() {
  if (this.recruitsError) return `<div class="p-8 text-center">${this.esc(this.recruitsError)}</div>`;
  if (!this.recruits) return `<div class="p-8 text-center">Loading…</div>`;
  if (!this.recruits.classes.length) return `<div class="p-8 text-center">No classes to show yet.</div>`;

  return this.recruits.classes.map(c => `
    <section class="mb-8">
      <h2 class="font-display text-xl mb-3">
        CLASS OF ${c.year}
        <span class="text-sm font-normal">· ${c.commits.length} commits${
          c.rank ? ` · Composite #${c.rank} national` : ''
        }${this.recruits.updated ? ` · Updated ${this.esc(this.recruits.updated)}` : ''}</span>
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        ${c.commits.map(r => `
          <div class="rounded-lg p-3 bg-white dark:bg-gray-800 border-2"
               style="border-color:${this.team.primaryColor}">
            <div class="flex justify-between text-xs">
              <span>${this.renderStars(r.stars)}</span>
              <span class="font-bold">${this.esc(r.position)}</span>
            </div>
            <div class="font-semibold mt-1">${this.esc(r.name)}</div>
            <div class="text-xs opacity-75">
              ${this.esc(r.height)}${r.weight ? ` · ${r.weight}` : ''}
            </div>
            <div class="text-xs opacity-75">
              ${this.esc(r.city)}${r.state ? `, ${this.esc(r.state)}` : ''}
            </div>
            <div class="text-xs mt-1">${r.rating != null ? r.rating.toFixed(4) : 'NR'}</div>
            ${r.onRoster ? `<div class="text-xs mt-1 font-bold">ON ROSTER</div>` : ''}
          </div>`).join('')}
      </div>
    </section>`).join('');
}
```

- [ ] **Step 2: Verify against real data and a null fixture**

Confirm rated and unrated recruits both render sanely, and that an
`onRoster: true` recruit shows the badge.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: render recruiting class grid"
```

---

### Task 15: Service worker — bump only, no precache

**Files:**
- Modify: `service-worker.js:1`

`service-worker.js:62-79` is cache-first for static assets. Precaching
`recruits.json` would serve the install-time copy forever.

- [ ] **Step 1: Bump the cache name**

```javascript
const CACHE_NAME = 'psu-depth-chart-v5';
```

- [ ] **Step 2: Confirm you did NOT touch `urlsToCache`**

```bash
grep -A8 'urlsToCache' service-worker.js
```

Expected: **no** `recruits.json` entry. The `?t=` cache-buster in Task 13 is
what keeps it fresh.

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "chore: bump service worker cache to v5"
```

---

### Task 16: Mobile and accessibility verification

**Files:** none (verification only)

- [ ] **Step 1: Mobile at 375px**

DevTools → iPhone SE. Confirm: grid is single-column; section switch is
full-width and tappable; no horizontal scroll; depth chart still works.

- [ ] **Step 2: Accessibility**

Confirm `role="tablist"` / `aria-selected` on the switch, and that star glyphs
expose `aria-label` (VoiceOver/NVDA, or inspect the DOM). Without it the
primary datum on every card is invisible to screen readers.

- [ ] **Step 3: Deploy and verify live**

```bash
git push origin maximusweiner4.github.io
```

Wait for Pages, then hard-reload psudepthchart.com (Ctrl+Shift+R) and confirm
the section switch appears and the depth chart is unchanged.

- [ ] **Step 4: Commit any fixes found**

---

## Definition of done

- [ ] `cd scripts && npm test` passes (26+ tests)
- [ ] Killing the API key leaves `recruits.json` byte-identical
- [ ] `update-recruits.yml` has run green at least once
- [ ] Two consecutive runs with no roster change produce **no** commit
- [ ] Depth chart behavior is unchanged in every respect
- [ ] `Ctrl+Z` is a no-op while RECRUITING is active
- [ ] 375px mobile verified
- [ ] `#recruiting` deep link works from a cold load
