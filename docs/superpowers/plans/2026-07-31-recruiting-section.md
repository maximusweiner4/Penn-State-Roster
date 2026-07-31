# Recruiting Section Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `RECRUITING` top-level section to psudepthchart.com showing Penn State's incoming recruiting classes, fed by the CollegeFootballData API through a daily CI job.

**Architecture:** A Node fetcher (`scripts/fetch-recruits.js`) calls CFBD, normalizes the data, and commits `scripts/recruits.json`. A separate GitHub Actions workflow runs it daily. `index.html` gains a section switch and a lazy-loaded card grid. Class visibility is derived from `roster.json` rather than the calendar, so no dates are hardcoded.

**Tech Stack:** Node 24 (global `fetch`, built-in `node:test` — no new dependencies), vanilla JS in `index.html`, Tailwind CDN, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-31-recruiting-tab-design.md`

**Prerequisite (human, blocking Task 8+):** Register a free key at collegefootballdata.com/key and add it as repo secret `CFBD_API_KEY`. Tasks 1-7 need no key.

---

## Two standing rules for this plan

**1. The test invocation is `node --test "lib/*.test.js"` — a quoted glob, never
a directory.** Node 24 rejects a directory argument, treats `lib` as a missing
test file, and — verified empirically — **still exits 0**. A directory argument
gives you a green CI run with zero tests executed. Do not "simplify" this back.

**2. All recruit text is third-party and must pass through `esc()`.** The app
renders by assigning a template string to the DOM in exactly one place
(`index.html:1776`). Every task below funnels markup into that single existing
assignment rather than adding a new one, so escaping has one chokepoint. Never
interpolate a raw `recruits.json` field.

---

## Testing strategy, and its one real gap

Tasks 1-8 (the fetcher) are pure Node under strict TDD.

Tasks 9-16 (the UI) live in a 3,262-line `index.html` monolith with no browser
test harness; standing one up is out of scope. Those tasks carry **explicit
manual checks with stated expected observations**. That is a genuine coverage
gap, not a style choice — do not report a UI task passing without performing
its check.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `scripts/lib/normalize.js` | create | Height, position, name normalization |
| `scripts/lib/sort.js` | create | Total, null-safe recruit ordering |
| `scripts/lib/roster-match.js` | create | Which classes/recruits are already on the roster |
| `scripts/lib/cfbd.js` | create | CFBD client: auth, 429 retry, error surfacing |
| `scripts/lib/changed.js` | create | Change detection for the `updated` stamp |
| `scripts/fetch-recruits.js` | create | Orchestration, validation guard |
| `scripts/recruits.json` | create | Seed + committed output |
| `scripts/lib/*.test.js` | create | Unit tests |
| `.github/workflows/update-recruits.yml` | create | Daily CI |
| `.github/workflows/update-roster.yml` | modify | Rebase-before-push race fix |
| `index.html` | modify | Section switch, recruiting render, guards, `esc()` |
| `service-worker.js` | modify | `CACHE_NAME` v5 only — no precache |
| `sitemap.xml` | modify | Add the `#recruiting` deep link |

**Chunk 2 task order is dependency-driven** (`esc` → loader → grid →
state/`setSection` → render branch → guards). Every task leaves a working
tree; no task calls a function a later task creates.

---

## Chunk 1: Fetcher

### Task 1: Test infrastructure and seed file

**Files:** modify `scripts/package.json`; create `scripts/recruits.json`, `scripts/lib/`

- [ ] **Step 1: Add the test script** — note the quoted glob

```json
"test": "node --test \"lib/*.test.js\""
```

- [ ] **Step 2: Create `lib/` and verify the runner**

```bash
cd scripts && mkdir -p lib && npm test; echo "exit=$?"
```

Expected: no test files matched; `exit=0`. If you see `Cannot find module`,
you used a directory argument — go back to Step 1.

- [ ] **Step 3: Create the seed file**

`scripts/recruits.json`. Required: without it, a missing `CFBD_API_KEY` on
first run leaves the client with a 404 and no defined render.

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

### Task 2: Height, position, and name normalization

**Files:** create `scripts/lib/normalize.js`, `scripts/lib/normalize.test.js`

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

test('heightToFeetInches accepts numeric strings and rounds fractions', () => {
  assert.strictEqual(heightToFeetInches('75'), '6-3');
  assert.strictEqual(heightToFeetInches(75.5), '6-4');
});

test('heightToFeetInches returns empty string for null and garbage', () => {
  assert.strictEqual(heightToFeetInches(null), '');
  assert.strictEqual(heightToFeetInches(undefined), '');
  assert.strictEqual(heightToFeetInches(0), '');
  assert.strictEqual(heightToFeetInches('tall'), '');
});

test('mapPosition maps CFBD vocabulary to roster vocabulary', () => {
  assert.strictEqual(mapPosition('OT'), 'OL');
  assert.strictEqual(mapPosition('SDE'), 'DE');
  assert.strictEqual(mapPosition('APB'), 'RB');
  assert.strictEqual(mapPosition('QB'), 'QB');
});

test('mapPosition maps the composite QB and athlete codes', () => {
  assert.strictEqual(mapPosition('DUAL'), 'QB');
  assert.strictEqual(mapPosition('PRO'), 'QB');
  assert.strictEqual(mapPosition('ATH'), 'ATH');
});

test('mapPosition passes unmapped positions through verbatim', () => {
  assert.strictEqual(mapPosition('XYZ'), 'XYZ');
  assert.strictEqual(mapPosition(null), '');
});

test('normalizeName lowercases and strips punctuation', () => {
  assert.strictEqual(normalizeName("Amar'e Glover"), 'amare glover');
  assert.strictEqual(normalizeName('  Zion   Tracy  '), 'zion tracy');
});

test('normalizeName strips generational suffixes only at the end', () => {
  assert.strictEqual(normalizeName('John Smith Jr.'), 'john smith');
  assert.strictEqual(normalizeName('Robert Downey III'), 'robert downey');
  assert.strictEqual(normalizeName('Ii Kealohanui'), 'ii kealohanui');
});
```

That last assertion is the point of anchoring: an unanchored `\b(ii|v)\b`
deletes legitimate given names.

- [ ] **Step 2: Run to verify failure** — `cd scripts && npm test` → `Cannot find module './normalize'`

- [ ] **Step 3: Implement**

Position values must stay inside the roster vocabulary confirmed in
`scripts/roster.json`: `QB RB WR TE OL DL DT DE LB CB S K P LS`. `ATH` is a
deliberate documented exception — CFBD emits it constantly and there is no
honest single-position mapping for an athlete.

```javascript
const POSITION_MAP = {
  QB: 'QB', DUAL: 'QB', PRO: 'QB',
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
  LS: 'LS',
  ATH: 'ATH'   // documented exception: no honest single-position mapping
};

function heightToFeetInches(inches) {
  const n = Number(inches);
  if (!Number.isFinite(n) || n <= 0) return '';
  const i = Math.round(n);
  return `${Math.floor(i / 12)}-${i % 12}`;
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
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, '');
}

module.exports = { heightToFeetInches, mapPosition, normalizeName, POSITION_MAP };
```

- [ ] **Step 4: Run to verify pass** — Expected: PASS, 8 tests. The unmapped-position warning is intended output.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.js scripts/lib/normalize.test.js
git commit -m "feat: add height, position, and name normalization"
```

---

### Task 3: Null-safe total ordering

**Files:** create `scripts/lib/sort.js`, `scripts/lib/sort.test.js`

Unrated recruits are common in early classes. An unstable sort scatters them
and produces spurious daily diffs, which become noise commits.

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

test('null ratings sort last', () => {
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

- [ ] **Step 2: Run to verify failure** — `Cannot find module './sort'`

- [ ] **Step 3: Implement**

```javascript
function cmpDesc(a, b) {           // nulls last, higher is better
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function cmpAsc(a, b) {            // nulls last, lower is better
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

- [ ] **Step 4: Run to verify pass** — Expected: PASS, 13 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/sort.js scripts/lib/sort.test.js
git commit -m "feat: add null-safe deterministic recruit ordering"
```

---

### Task 4: Roster matching — replaces the calendar rule

**Files:** create `scripts/lib/roster-match.js`, `scripts/lib/roster-match.test.js`

A class hides only once **every** commit appears in `roster.json`; partial
matches are badged. No dates involved.

- [ ] **Step 1: Write the failing tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { annotateClass, shouldRenderClass } = require('./roster-match');

const roster = [{ name: 'Zion Tracy' }, { name: "Amar'e Glover" }];

test('annotateClass flags commits already on the roster', () => {
  const out = annotateClass(
    { year: 2026, commits: [{ name: 'Zion Tracy' }, { name: 'New Kid' }] }, roster);
  assert.strictEqual(out.commits[0].onRoster, true);
  assert.strictEqual(out.commits[1].onRoster, false);
});

test('matching ignores punctuation and trailing suffixes', () => {
  const out = annotateClass({ year: 2026, commits: [{ name: 'Amare Glover Jr.' }] }, roster);
  assert.strictEqual(out.commits[0].onRoster, true);
});

test('annotateClass does not mutate its input', () => {
  const cls = { year: 2026, commits: [{ name: 'Zion Tracy' }] };
  annotateClass(cls, roster);
  assert.strictEqual(cls.commits[0].onRoster, undefined);
});

test('hides a class fully absorbed into the roster', () => {
  const cls = annotateClass({ year: 2026, commits: [{ name: 'Zion Tracy' }] }, roster);
  assert.strictEqual(shouldRenderClass(cls), false);
});

test('shows a partially enrolled class', () => {
  const cls = annotateClass(
    { year: 2026, commits: [{ name: 'Zion Tracy' }, { name: 'New Kid' }] }, roster);
  assert.strictEqual(shouldRenderClass(cls), true);
});

test('hides an empty class', () => {
  assert.strictEqual(shouldRenderClass({ year: 2028, commits: [] }), false);
});

test('an empty roster leaves every class visible', () => {
  const cls = annotateClass({ year: 2027, commits: [{ name: 'Anyone' }] }, []);
  assert.strictEqual(shouldRenderClass(cls), true);
});
```

- [ ] **Step 2: Run to verify failure** — `Cannot find module './roster-match'`

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

// Hide only when empty, or when every commit has enrolled.
//
// Known behavior: a signee who decommits, greyshirts, or fails to qualify
// never appears in roster.json, so that class stays visible with its other
// members badged ON ROSTER until the fetch window drops it on January 1
// (fetch-recruits.js fetches only currentYear and currentYear+1). Accepted:
// showing a stale class briefly is cheaper than a fuzzy percentage threshold
// that would hide real recruits.
function shouldRenderClass(cls) {
  const commits = cls.commits || [];
  if (commits.length === 0) return false;
  return !commits.every(c => c.onRoster === true);
}

module.exports = { annotateClass, shouldRenderClass };
```

- [ ] **Step 4: Run to verify pass** — Expected: PASS, 20 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/roster-match.js scripts/lib/roster-match.test.js
git commit -m "feat: derive class visibility from roster instead of calendar"
```

---

### Task 5: CFBD client with 429 retry

**Files:** create `scripts/lib/cfbd.js`, `scripts/lib/cfbd.test.js`

- [ ] **Step 1: Write the failing tests** (inject `fetch`; no network)

```javascript
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
```

- [ ] **Step 2: Run to verify failure** — `Cannot find module './cfbd'`

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
    if (res.status === 429 && attempt === 0) { await sleep(backoffMs); continue; }
    const body = await res.text().catch(() => '');
    throw new Error(`CFBD ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
}

module.exports = { cfbdGet, BASE };
```

- [ ] **Step 4: Run to verify pass** — Expected: PASS, 26 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cfbd.js scripts/lib/cfbd.test.js
git commit -m "feat: add CFBD client with 429 backoff"
```

---

### Task 6: Change detection that does not churn `updated`

**Files:** create `scripts/lib/changed.js`, `scripts/lib/changed.test.js`

`update-roster.yml:51` commits only when `git diff --quiet` reports a change. A
fresh timestamp every run makes the diff permanently dirty — 365 noise commits
a year and no usable signal.

- [ ] **Step 1: Write the failing tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { buildOutput } = require('./changed');

const classes = [{ year: 2027, rank: 4, commits: [{ name: 'A' }] }];

test('keeps the previous date when classes are unchanged', () => {
  const out = buildOutput(classes, { updated: '2026-07-01', classes }, '2026-07-31');
  assert.strictEqual(out.updated, '2026-07-01');
});

test('stamps a new date when classes change', () => {
  const next = [{ ...classes[0], commits: [{ name: 'A' }, { name: 'B' }] }];
  const out = buildOutput(next, { updated: '2026-07-01', classes }, '2026-07-31');
  assert.strictEqual(out.updated, '2026-07-31');
});

test('stamps a date when there is no previous file', () => {
  assert.strictEqual(buildOutput(classes, null, '2026-07-31').updated, '2026-07-31');
});

test('stamps a date when the previous file is the null seed', () => {
  const out = buildOutput(classes, { updated: null, classes: [] }, '2026-07-31');
  assert.strictEqual(out.updated, '2026-07-31');
});
```

- [ ] **Step 2: Run to verify failure** — `Cannot find module './changed'`

- [ ] **Step 3: Implement**

```javascript
function buildOutput(classes, previous, today) {
  const unchanged = previous &&
    JSON.stringify(previous.classes) === JSON.stringify(classes);
  return { updated: unchanged ? previous.updated : today, classes };
}

module.exports = { buildOutput };
```

- [ ] **Step 4: Run to verify pass** — Expected: PASS, **30 tests total**.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/changed.js scripts/lib/changed.test.js
git commit -m "feat: stamp updated only when classes actually change"
```

---

### Task 7: Fetcher orchestration and validation guard

**Files:** create `scripts/fetch-recruits.js`

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
  let rank = null;
  try {
    const teams = await cfbdGet('/recruiting/teams', { year, team: TEAM });
    if (Array.isArray(teams) && teams.length) rank = teams[0].rank ?? null;
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

  return { year, rank, commits };
}

async function main() {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const roster = readJson(ROSTER, []);

  const fetched = [];
  for (const year of [currentYear, currentYear + 1]) {
    fetched.push(await fetchClass(year));
  }

  // Guard 1: total emptiness is an API problem, not reality.
  const total = fetched.reduce((n, c) => n + c.commits.length, 0);
  if (total === 0) {
    console.error('[fetch-recruits] every class came back empty — refusing to write');
    process.exit(1);
  }

  // Guard 2: name is the one field the UI cannot render without.
  // Do NOT assert position/rating/stars — all are nullable in early classes.
  for (const c of fetched) {
    const nameless = c.commits.filter(r => !r.name).length;
    if (nameless > 0) {
      console.error(`[fetch-recruits] ${nameless} commit(s) in ${c.year} have no name — refusing to write`);
      process.exit(1);
    }
  }

  const classes = fetched.map(c => annotateClass(c, roster)).filter(shouldRenderClass);

  const output = buildOutput(classes, readJson(OUT, null), now.toISOString().slice(0, 10));
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`[fetch-recruits] wrote ${classes.length} class(es), ${total} commit(s)`);
}

main().catch(err => {
  console.error(`[fetch-recruits] FAILED: ${err.message}`);
  process.exit(1); // recruits.json is left untouched
});
```

- [ ] **Step 2: Verify the failure path writes nothing** — the single most important guard

```bash
cd scripts && cp recruits.json ../recruits.before.json
CFBD_API_KEY= node fetch-recruits.js; echo "exit=$?"
diff recruits.json ../recruits.before.json && echo "UNCHANGED - correct"
rm ../recruits.before.json
```

Expected: `exit=1`, then `UNCHANGED - correct`.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-recruits.js
git commit -m "feat: add CFBD recruiting fetcher with write-nothing-on-failure guard"
```

---

### Task 8: Workflows and the push-race fix

**Files:** create `.github/workflows/update-recruits.yml`; modify `.github/workflows/update-roster.yml`

Both workflows push to `maximusweiner4.github.io`. Identical crons race, and
the loser's push is rejected. The recruits job (~2s) beats the roster job
(~40s), so the **roster** pipeline is what breaks — a regression in working
code.

- [ ] **Step 1: Fix the existing roster workflow first**

In `.github/workflows/update-roster.yml`:

1. In the checkout `with:` block add `fetch-depth: 0`. `actions/checkout@v4`
   defaults to depth 1, and rebasing a grafted repo is fragile — without this
   the race "fix" can itself break the roster job.
2. In "Commit and push if changed", replace `git push` with:

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

Note the offset cron and `node-version: '24'` — the quoted-glob test
invocation requires Node 21+.

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
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

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

- [ ] **Step 4: Push and trigger**

```bash
git add .github/workflows/update-recruits.yml
git commit -m "feat: add daily recruiting fetch workflow"
git push origin maximusweiner4.github.io
gh workflow run update-recruits.yml --ref maximusweiner4.github.io
gh run watch
```

Expected: green. If it fails with `CFBD_API_KEY is not set`, the human
prerequisite is outstanding — stop and report rather than working around it.

- [ ] **Step 5: Verify real output, then idempotence**

```bash
git pull origin maximusweiner4.github.io
node -e "const d=require('./scripts/recruits.json');console.log(d.updated, d.classes.map(c=>c.year+':'+c.commits.length))"
gh workflow run update-recruits.yml --ref maximusweiner4.github.io && gh run watch
```

Expected: a date and at least one non-empty class; the second run produces
**no new commit**. If it commits every time, `buildOutput` is not wired in.

---

## Chunk 2: UI

> No browser test harness exists. Every task states a manual check. Do not mark
> one done without performing it. Tasks are ordered so no task references a
> function a later task creates.

### Task 9: HTML escaping helper

**Files:** modify `index.html`

`recruits.json` relays third-party 247/Rivals text into markup. Every recruit
field must pass through this.

- [ ] **Step 1: Add the helper** beside the other utility methods on the app class

```javascript
esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

- [ ] **Step 2: Verify** — serve locally (`npx serve .`), console:
`app.esc('<img src=x onerror=alert(1)>')` → fully escaped string, no dialog.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add esc() helper for interpolated strings"
```

---

### Task 10: Recruit state and lazy loader

**Files:** modify `index.html` (state near `:611`)

Must **not** join `init()`'s await chain — that gates `this.loading`
(`:663-677`), so a slow file would delay the depth chart for every visitor.

- [ ] **Step 1: Add state fields** beside `this.activeTab = 'offense';`

```javascript
this.recruits = null;
this.recruitsError = null;
```

- [ ] **Step 2: Add the loader**

The cache path is itself wrapped — a corrupt `psu-recruits` would otherwise
throw inside `catch`, skipping `render()` and stranding the spinner forever.

```javascript
async loadRecruits() {
  try {
    const res = await fetch('scripts/recruits.json?t=' + Date.now());
    if (!res.ok) throw new Error(res.status);
    this.recruits = await res.json();
    this.recruitsError = null;
    try { localStorage.setItem('psu-recruits', JSON.stringify(this.recruits)); } catch (_) {}
  } catch (_) {
    try {
      const cached = localStorage.getItem('psu-recruits');
      if (!cached) throw new Error('no cache');
      this.recruits = JSON.parse(cached);
      this.recruitsError = null;
    } catch (_) {
      this.recruits = null;
      this.recruitsError = 'Recruiting data unavailable — check back shortly.';
    }
  }
  this.render();
}
```

- [ ] **Step 3: Verify all three paths** in the console

`await app.loadRecruits()` → `app.recruits` populated. Go offline, reload,
call again → cached data. Then `localStorage.removeItem('psu-recruits')`
offline → `app.recruitsError` set, `app.recruits` null.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add lazy recruit loader with cache and error fallbacks"
```

---

### Task 11: Class grid and recruit cards

**Files:** modify `index.html`

- [ ] **Step 1: Implement**

`renderStars` must clamp. Verified: `'★'.repeat(5 - 6)` throws `RangeError`
**inside a template literal**, which blanks the entire page — depth chart
included. And `stars: 0` (which CFBD does emit) must render `NR`, not five
empty stars, which would imply a real 0-star evaluation.

These functions **return strings**; they never touch the DOM. Rendering
happens through the app's single existing assignment.

```javascript
renderStars(n) {
  if (n == null || !(n >= 1)) return `<span class="text-xs text-gray-400">NR</span>`;
  const k = Math.min(5, Math.round(n));
  return `<span aria-label="${k}-star recruit">${'★'.repeat(k)}${'☆'.repeat(5 - k)}</span>`;
}

renderRecruits() {
  if (this.recruitsError) return `<div class="p-8 text-center">${this.esc(this.recruitsError)}</div>`;
  if (!this.recruits) return `<div class="p-8 text-center">Loading…</div>`;
  if (!this.recruits.classes.length) return `<div class="p-8 text-center">No classes to show yet.</div>`;

  const meta = (parts) => parts.filter(Boolean).join(' · ');

  return `<div class="no-print">` + this.recruits.classes.map(c => `
    <section class="mb-8">
      <h2 class="font-display text-xl mb-3">
        CLASS OF ${c.year}
        <span class="text-sm font-normal">· ${meta([
          `${c.commits.length} commits`,
          c.rank ? `Composite #${c.rank} national` : '',
          this.recruits.updated ? `Updated ${this.esc(this.recruits.updated)}` : ''
        ])}</span>
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
            <div class="text-xs opacity-75">${meta([this.esc(r.height), r.weight ? `${r.weight} lbs` : ''])}</div>
            <div class="text-xs opacity-75">${meta([this.esc(r.city), this.esc(r.state)])}</div>
            <div class="text-xs opacity-75">${this.esc(r.school)}</div>
            <div class="text-xs mt-1">${r.rating != null ? r.rating.toFixed(4) : 'NR'}</div>
            ${r.onRoster ? `<div class="text-xs mt-1 font-bold">ON ROSTER</div>` : ''}
          </div>`).join('')}
      </div>
    </section>`).join('') + `</div>`;
}
```

Every recruit-derived field goes through `this.esc()`. `c.year`,
`c.commits.length`, `c.rank`, and `r.rating` are numbers from our own fetcher
and are safe unescaped.

`no-print` avoids white-on-white: `index.html:171` forces
`[class*="dark:bg-gray"]` to a white background, and hiding the Print *button*
does not stop `Ctrl+P`.

- [ ] **Step 2: Add the print rule** to the existing `@media print` block

```css
.no-print { display: none !important; }
```

- [ ] **Step 3: Verify the string output** in the console — no DOM writes needed

```javascript
app.recruits = { updated: '2026-07-31', classes: [{ year: 2027, rank: 4, commits: [
  { name: 'Rated', position: 'QB', stars: 4, rating: 0.9421, height: '6-3', weight: 195, city: 'Lewis Center', state: 'OH', school: 'Berlin', onRoster: false },
  { name: 'Unrated', position: 'ATH', stars: null, rating: null, height: '', weight: null, city: '', state: '', school: '', onRoster: true },
  { name: '<script>x</script>', position: 'WR', stars: 0, rating: null, height: '6-0', weight: null, city: 'Erie', state: '', school: '', onRoster: false }
]}]};
const html = app.renderRecruits();
console.log(html.includes('&lt;script&gt;'));  // must be true — escaping works
console.log(/·\s*·|>\s*,/.test(html));         // must be false — no stray separators
app.renderStars(6);                            // must return a string, not throw
```

Expected: `true`, then `false`, then a string. Both `Unrated` and the
zero-star row show `NR` with **no** star row.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: render recruiting class grid"
```

---

### Task 12: Section state, deep link, and cold load

**Files:** modify `index.html` (state `:611`, `init()` `:663-677`, reset `:1166-1169`, team purge after `:689`)

- [ ] **Step 1: Add state** beside `this.activeTab`

```javascript
this.activeSection = (location.hash === '#recruiting')
  ? 'recruiting'
  : (localStorage.getItem('psu-active-section') || 'depth');
```

- [ ] **Step 2: Add the setter**

```javascript
setSection(section) {
  this.activeSection = section;
  localStorage.setItem('psu-active-section', section);
  history.replaceState(null, '', section === 'recruiting' ? '#recruiting' : ' ');
  if (section === 'recruiting' && !this.recruits && !this.recruitsError) this.loadRecruits();
  this.render();
}
```

- [ ] **Step 3: Trigger the cold load in `init()`**

**Required.** Without this, a cold load of `/#recruiting` — or any returning
visitor whose saved section is `recruiting` — never calls `loadRecruits()` and
sits on `Loading…` forever, because `setSection()` is the only other call site.

After `this.loading = false;` in `init()` (`index.html:672`):

```javascript
if (this.activeSection === 'recruiting') this.loadRecruits();
```

- [ ] **Step 4: Add a `hashchange` listener** so browser back/forward works

```javascript
window.addEventListener('hashchange', () => {
  this.setSection(location.hash === '#recruiting' ? 'recruiting' : 'depth');
});
```

- [ ] **Step 5: Add to both cleanup paths** — `confirmAppReset()` (`:1166-1169`) and the team purge (after `:689`)

```javascript
localStorage.removeItem('psu-active-section');
```

Omitting this strands a user in RECRUITING with an otherwise-reset app.

- [ ] **Step 6: Verify** — `app.setSection('recruiting')` → URL shows
`#recruiting`. **Hard-reload `/#recruiting` in a fresh tab** → data loads, no
permanent spinner. Reload plain URL → still recruiting. Run reset → back to
depth chart. Browser back after following an external `#recruiting` link →
returns to depth chart.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: add activeSection state, deep link, and cold load"
```

---

### Task 13: Section switch and render branch

**Files:** modify `index.html` (`render()` `:1768-1807`, `renderHeader()` `:2145`, `renderLoadingState()` `:1809`)

- [ ] **Step 1: Add the switch**

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

- [ ] **Step 2: Make `renderHeader()` compactable**

`renderHeader()` (`:2145`) takes no parameters. The roster-stats block is a
**ternary spanning `:2190` to `:2246`** — it does not end at 2238; there is an
`: \`No roster imported yet…\`` else-branch. Suppressing only the true-branch
would leave an unbalanced template literal.

Change the signature to `renderHeader(compact = false)` and wrap the **entire
ternary** `:2190-2246` in `${!compact ? \`...\` : ''}`.

Also change the subtitle at `:2161` to:

```javascript
${compact ? 'RECRUITING CLASSES' : 'INTERACTIVE DEPTH CHART BUILDER'}
```

- [ ] **Step 3: Branch `render()` by composing a string**

Do **not** add a second DOM assignment. Build the markup and let the app's
existing single assignment (`:1776`) render it. Immediately after the
loading-state early-return, before the depth chart's markup is composed:

```javascript
if (this.activeSection === 'recruiting') {
  html = `
    ${this.renderHeader(true)}
    ${this.renderSectionSwitch()}
    ${this.renderRecruits()}
  `;
} else {
  // ...existing depth chart composition, with renderSectionSwitch()
  //    inserted immediately above renderTabs()
}
```

(If the existing code assigns directly rather than building a variable, hoist
it to a `html` variable first so there remains exactly one assignment.)

This is what implements the spec's render-tree table: `renderTabs()`,
`renderMobileControls()`, `renderField()`, `renderKeyboardHints()`, and the
Export/Share/Print/Undo/Redo/Reset row are simply never called on the
recruiting branch.

- [ ] **Step 4: Guard the loading skeleton**

`renderLoadingState()` (`:1809`) draws depth-chart skeletons regardless of
section. Return a plain centered "Loading…" when
`this.activeSection === 'recruiting'`.

- [ ] **Step 5: Verify**

Toggle both ways. The depth chart must be **visually identical** to before —
formation dropdown, field, every button. Recruiting shows only compact header,
switch, and grid. No console errors on either. Confirm with
`document.querySelectorAll('#app').length === 1` that you did not introduce a
second render root.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add section switch and recruiting render branch"
```

---

### Task 14: Guard the keyboard shortcuts

**Files:** modify `index.html:1426-1462`

Verified: handlers bind once to `document` and are never torn down. `Ctrl+Z`
currently calls `this.undo()` and mutates `this.depthChart` **with no visible
feedback** when the field isn't rendered — silent data loss.

- [ ] **Step 1: Add the guard**

Prefix `this.activeSection === 'depth' &&` to three conditions:

1. the undo branch (`:1426`)
2. the redo branch (`:1431`)
3. **the arrow-key block's outer condition at `:1440`** — not `:1441`, which
   is the inner `ArrowUp` check; guarding there would leave ArrowLeft/Right
   unguarded

Leave the `d` dark-mode branch (`:1436`) active deliberately.

- [ ] **Step 2: Verify the silent-mutation path is closed**

```javascript
app.setSection('depth');
// place a player in a slot, then:
app.setSection('recruiting');
const before = JSON.stringify(app.depthChart);
// press Ctrl+Z, then:
JSON.stringify(app.depthChart) === before   // must be true
```

Also press Left/Right/Up/Down and confirm `app.activeTab` and `app.depthLevel`
are unchanged.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: guard keyboard shortcuts against silent depth chart mutation"
```

---

### Task 15: Service worker and sitemap

**Files:** modify `service-worker.js:1`, `sitemap.xml`

- [ ] **Step 1: Bump the cache name**

```javascript
const CACHE_NAME = 'psu-depth-chart-v5';
```

- [ ] **Step 2: Confirm you did NOT precache the JSON**

`service-worker.js:62-79` is cache-first for static assets; precaching
`recruits.json` would serve the install-time copy forever.

```bash
grep -A8 'urlsToCache' service-worker.js
```

Expected: **no** `recruits.json`. The `?t=` cache-buster in Task 10 keeps it
fresh.

- [ ] **Step 3: Add the deep link to `sitemap.xml`**

```xml
  <url>
    <loc>https://psudepthchart.com/#recruiting</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 4: Commit**

```bash
git add service-worker.js sitemap.xml
git commit -m "chore: bump service worker cache to v5, add recruiting to sitemap"
```

---

### Task 16: Mobile, accessibility, and live verification

**Files:** none unless fixes are needed

- [ ] **Step 1: Mobile at 375px** — DevTools → iPhone SE. Grid is single
column; section switch full-width and tappable; no horizontal scroll; depth
chart still works.

- [ ] **Step 2: Accessibility** — confirm `role="tablist"` / `aria-selected`
on the switch, and `aria-label` on star glyphs. Without the label the primary
datum on every card is invisible to screen readers.

- [ ] **Step 3: Fix anything found, and commit the fixes** — this must happen
**before** the push in Step 4.

- [ ] **Step 4: Deploy and verify live**

```bash
git push origin maximusweiner4.github.io
```

Wait for Pages, hard-reload psudepthchart.com (Ctrl+Shift+R), confirm the
switch appears and the depth chart is unchanged. Then load
`psudepthchart.com/#recruiting` in a **private window** and confirm it renders
from cold with no stale service worker.

---

## Definition of done

- [ ] `cd scripts && npm test` reports **30 tests, 30 pass** (not "0 tests")
- [ ] Killing the API key leaves `recruits.json` byte-identical
- [ ] `update-recruits.yml` has run green at least once
- [ ] A second identical run produces **no** commit
- [ ] Depth chart behavior and appearance are unchanged
- [ ] `Ctrl+Z` is a no-op while RECRUITING is active
- [ ] `renderStars(6)` and `renderStars(0)` neither throw nor show 0 stars
- [ ] A recruit named `<script>x</script>` renders escaped
- [ ] 375px mobile verified
- [ ] `/#recruiting` renders from a cold load in a private window
