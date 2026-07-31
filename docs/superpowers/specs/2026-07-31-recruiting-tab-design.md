# Recruiting Section — Design

**Date:** 2026-07-31
**Status:** Approved design, revised after spec review; pending implementation plan
**Repo:** `PSU Roster Latest` (branch `maximusweiner4.github.io`)

## Summary

Add a top-level `RECRUITING` section to psudepthchart.com showing Penn State's
incoming high school recruiting classes: name, position, star rating, composite
rating, height/weight, and hometown. The section is read-only and isolated from
the depth chart. Data comes from the CollegeFootballData (CFBD) API, fetched
daily in CI and committed as static JSON.

Designed so a future transfer-portal view can be added as a sibling sub-view
without touching depth chart code.

## Goals

- Show the current recruiting class(es) with 247/Rivals/ESPN composite ratings.
- Zero annual maintenance — classes roll over on their own.
- No change in behavior or risk to the existing depth chart.
- Leave a clean seam for transfers in/out next offseason.

## Non-goals

- Dragging recruits into the depth chart.
- Uncommitted targets, offer lists, or crystal-ball predictions (not available
  from the data source).
- Per-player signed-vs-committed status (see Known Limitations).

## Data source

### Why not 247Sports

247Sports was the original idea and was rejected for three independent reasons:

1. Their terms of service prohibit automated collection.
2. Most recruiting depth sits behind the VIP paywall.
3. The site is Cloudflare-protected. A Puppeteer job from a GitHub Actions
   datacenter IP would be blocked, and working around that would mean building
   bot-detection evasion.

### CFBD

CollegeFootballData.com aggregates 247, Rivals, and ESPN ratings into a
composite, so 247 star ratings remain available through a documented,
key-authenticated JSON API.

**Endpoints** (all with `Authorization: Bearer $CFBD_API_KEY`), verified
against live OpenAPI v5.21.0 on 2026-07-31:

| Endpoint | Purpose |
|---|---|
| `/recruiting/players?year=<N>&team=Penn%20State&classification=HighSchool` | Per-recruit rows |
| `/recruiting/teams?year=<N>&team=Penn%20State` | Class rank and points |

`classification=HighSchool` is required — the enum also contains `JUCO` and
`PrepSchool`, which this view deliberately excludes.

No Puppeteer required. Four calls per run, roughly 2s, versus the roster
scraper's ~40s.

### Nullable fields — this drives real logic

In the `Recruit` schema **only `id`, `name`, `year`, and `recruitType` are
non-null.** `ranking`, `school`, `committedTo`, `position`, `height`,
`weight`, `stars`, and `rating` are all nullable, and early-cycle commits
routinely carry `rating: null` and `stars: null` until the services rate them.

Consequences that must be honored:

- **Sort must be total and deterministic**, or unrated recruits scatter
  unpredictably and generate spurious daily diffs:
  `rating desc → stars desc → ranking asc → name asc`, **nulls always last**.
- **Every card field needs an empty state.** Unrated → render `NR` and omit
  the star row rather than drawing zero stars, which would imply a 0-star
  evaluation.
- **Validation may only assert `name` and `year`.** Asserting `position` or
  `rating` on every row would fail on exactly the early classes this feature
  exists to show.

### Field normalization

Normalize in the fetcher, never at render time:

- **`height` is inches (e.g. `75`)**; `roster.json` stores `"6-3"`. Convert so
  recruit and roster cards read identically.
- **`position` is CFBD's vocabulary.** The target vocabulary is the
  `positionMap` **values** in `scripts/scrape-roster.js:8-37`, confirmed
  against live data as exactly: `QB RB WR TE OL DL DT DE LB CB S K P LS`.
  Unmapped positions pass through verbatim and log a warning, so new codes
  surface in CI output instead of silently vanishing.

  Do **not** map to the arrays at `index.html:1110-1112`. Those are
  depth-chart *slot IDs* (`WR-SLOT-R`, `OT-R`), not player positions.

### Rate limits

The CFBD free tier allows **1,000 calls/month**. Four calls/day ≈ 124/month.
Adding the transfer view later roughly doubles that, leaving ~4x headroom —
comfortable, but a real ceiling worth tracking rather than assuming unbounded.

HTTP 429 gets one backoff retry, then is treated as a hard failure.

## Which classes render

### The rule

Fetch `currentYear` and `currentYear + 1`. Render a class when **both**:

- it has at least 1 commit, and
- **not all of its commits already appear in `roster.json`**

Individual recruits who match a roster player are badged `ON ROSTER` rather
than hidden, so early enrollees are visible as what they are.

Matching is on normalized name (lowercase, strip punctuation, strip
`Jr./III/IV` suffixes).

### Why not a calendar rule

The first draft used `activeClass = month >= 3 ? year+1 : year` with a
three-class window and an August cutoff, justified by a claim that the August
enrollment date guaranteed no player appears in both the recruiting view and
the roster.

**That claim was false.** `scripts/roster.json` today (2026-07-31) already
contains 22 `Fr.` players — the entire 2026 signing class — and git history
shows them present since at least 2026-01-17. Early enrollees arrive in
January and gopsusports publishes them immediately. A calendar rule would have
double-listed the whole class for roughly six months a year.

Deriving the answer from `roster.json` is self-correcting, needs no magic
constants, and removes both the March and August dates entirely. It also
collapses the window from three classes to two, halving the API calls.

The app already loads `roster.json`, so no extra fetch is required.

**Accepted imprecision:** name matching can miss on spelling differences
between CFBD and gopsusports. Worst case a class lingers a little longer than
ideal, which is a far cheaper failure than double-listing players.

### Signing calendar context

The early signing period falls in **early December**, the traditional National
Signing Day in **early February**. Sources disagree on exact days and the
window has moved in recent cycles, so no logic here depends on a specific
date — this is context only. The overwhelming majority of recruits now sign in
December; February is largely residual.

## Architecture

### New files

| Path | Purpose |
|---|---|
| `scripts/fetch-recruits.js` | CFBD fetcher, writes `recruits.json` |
| `scripts/recruits.json` | Committed static output, served by Pages |
| `.github/workflows/update-recruits.yml` | Daily CI job |

### Modified files

| Path | Change |
|---|---|
| `index.html` | Section switch, recruiting render path, lazy load, keyboard guards, `esc()` helper |
| `service-worker.js` | Bump `CACHE_NAME` to v5 (see caching note — do **not** precache) |
| `.github/workflows/update-roster.yml` | Add `pull --rebase` before push (race fix) |

### `recruits.json` shape

```json
{
  "updated": "2026-07-31",
  "classes": [
    {
      "year": 2027,
      "rank": 4,
      "points": 271.55,
      "commits": [
        {
          "name": "Ethan Grunkemeyer",
          "position": "QB",
          "stars": 4,
          "rating": 0.9421,
          "ranking": 112,
          "height": "6-3",
          "weight": 195,
          "city": "Lewis Center",
          "state": "OH",
          "school": "Olentangy Berlin"
        }
      ]
    }
  ]
}
```

`classes` is ordered oldest first. `commits` uses the total sort above.
`height` is already normalized. The field is `state`, not `stateProvince`.

**A seed file `{"updated": null, "classes": []}` must be committed in the same
PR.** Otherwise, if the repo secret is missing on first run, the fetcher
correctly writes nothing, the client 404s, `localStorage` is also empty, and
there is no defined render.

### `updated` must not defeat change detection

`update-roster.yml:51` commits only when `git diff --quiet` shows a change. A
fresh ISO timestamp in `recruits.json` on every run would make the diff always
dirty — 365 noise commits a year, and the "did the class change?" signal is
destroyed.

The fetcher compares only the serialized `classes` array against the existing
file and **rewrites `updated` only when `classes` actually changed.** `updated`
is a date, not a timestamp, and is displayed in the section header.

### Workflow isolation and the push race

`update-recruits.yml` is separate from `update-roster.yml` so neither source's
outage blocks the other's commit.

But both push to `maximusweiner4.github.io`, and identical crons would race —
the loser's push is rejected as non-fast-forward. Because the recruits job
(~2s) finishes well before the roster job (~40s), the *roster* pipeline is the
one that would break. That is a regression in working, load-bearing code.

**Required:** offset the recruits cron to `30 11 * * *`, and add
`git pull --rebase origin maximusweiner4.github.io` before `git push` in
**both** workflows.

**Prerequisite (manual, by repo owner):** register for a free CFBD key at
collegefootballdata.com/key and add it as repo secret `CFBD_API_KEY`.

## UI

### Navigation

A `DEPTH CHART | RECRUITING` switch sits above the existing tab row. New state
`this.activeSection` (default `'depth'`), persisted to `localStorage` under
`psu-active-section`.

**Deep link:** read a `#recruiting` hash on load and write it on switch, so the
section is linkable and can appear in `sitemap.xml`.

**Lifecycle:** add `psu-active-section` to the cleanup in `confirmAppReset()`
(`index.html:1166-1169`) and to the team-change purge (`684-689`). Omitting it
strands a user in RECRUITING with an otherwise-reset app.

### Exact render tree

`render()` (`index.html:1768-1807`) is a monolith that unconditionally calls
`renderHeader()`, `renderButtons()`, `renderTabs()`, `renderMobileControls()`,
`renderField()`, and `renderKeyboardHints()`. The recruiting branch must be
specified precisely, not by omission:

| Component | `activeSection === 'recruiting'` |
|---|---|
| Section switch | shown |
| `renderHeader()` team identity | shown |
| Header depth-chart progress bar + roster pills (`2190-2238`) | **hidden** — they describe the depth chart |
| `renderTabs()` | not called |
| `renderMobileControls()`, formation, depth toggle | not called |
| `renderField()` | replaced by class grid |
| Undo / Redo / Reset | hidden |
| Export / Share / Print | **hidden** (see below) |
| `renderKeyboardHints()` | hidden |

### Export / Share / Print are hidden, not adapted

All three are depth-chart-specific: `exportDepthChart()` (1100) emits a depth
chart file, `shareAsImage()` renders the field to canvas, and `printChart()`
(1466) relies on a print stylesheet (`164-177`) that shows `.mobile-list-view`
and forces `[class*="dark:bg-gray"]` to white — which would print dark-navy
recruit cards as **white text on white paper**.

Hiding them in v1 is correct scope. Recruiting-specific export can come later
with its own print rules.

### Keyboard shortcuts must be guarded

`setupKeyboardShortcuts()` (`index.html:1409-1463`) binds once to `document`
and is never torn down. Hiding buttons does not disable it. Verified live:

- `Ctrl/Cmd+Z` → `this.undo()` (1426-1429) mutates `this.depthChart` **with no
  visible feedback**, because the field isn't rendered. The user silently loses
  depth chart work.
- `ArrowLeft/Right` (1447-1461) mutate `activeTab`; `ArrowUp/Down` (1441-1446)
  mutate `depthLevel`.

**Required:** early-return from the undo/redo and arrow branches when
`this.activeSection !== 'depth'`. `d` (dark mode) stays active deliberately.

`handleSwipeGesture` needs no guard — it binds to `.mobile-list-view` in
`attachEventListeners()` (3192), which does not exist in this view.

### Class rendering

Each rendered class shows a header —
`CLASS OF 2027 · 24 commits · Composite #4 national · Updated Jul 31` — above a
rating-ranked card grid using the existing dark-navy card styling.

When `/recruiting/teams` returns no row (normal for a thin class), omit
`rank`/`points`; the header renders commit count only. Never a failure.

### Escaping

The codebase has **no** `escapeHtml`, `textContent`, or sanitize helper —
every render path interpolates raw into `app.innerHTML` (`index.html:1776`).
`roster.json` is at least first-party-scraped; `recruits.json` relays
third-party 247/Rivals text.

**Required:** add an `esc(s)` helper and apply it to every interpolated recruit
field (`name`, `school`, `city`, `state`). Cheap now, invasive later.

### Loading

`init()` (`663-677`) awaits `loadRoster()` before clearing `this.loading`. Do
**not** load `recruits.json` there — a slow or 404ing file would delay the
depth chart for every visitor. **Lazy-load on first RECRUITING activation**,
with its own spinner and its own failure state.

### Mobile and accessibility

- Grid collapses 4 → 2 → 1 column at existing Tailwind breakpoints; section
  switch stays full-width tappable. Verified at 375px.
- Section switch gets `role="tablist"` / `aria-selected`.
- Star glyphs get a text equivalent (`aria-label="4-star recruit"`) — without
  it the primary datum on every card is invisible to screen readers.

## Caching — do not precache

`service-worker.js:62-79` is **cache-first for all non-navigation requests**.
Adding `scripts/recruits.json` to `urlsToCache` would serve returning users the
install-time copy forever; a `CACHE_NAME` bump would fix it exactly once and
then freeze it again. This is precisely why the existing code does not
precache `roster.json` and instead fetches with a cache-buster
(`index.html:787`).

**Required:** do not add `recruits.json` to `urlsToCache`. Fetch it as
`'scripts/recruits.json?t=' + Date.now()`. Still bump `CACHE_NAME` to
`psu-depth-chart-v5` for the `index.html` and `service-worker.js` changes.

*Pre-existing issue, noted not fixed:* the cache-buster causes unbounded cache
growth via `cache.put` on unique URLs (`service-worker.js:74`). A second
cache-busted JSON doubles the rate. Worth a separate cleanup.

## Error handling

| Condition | Behavior |
|---|---|
| Non-200, network error, or malformed JSON | Exit non-zero, **do not write** `recruits.json`; last-good data keeps serving; GitHub emails the failure |
| HTTP 429 | One backoff retry, then hard failure |
| Both classes empty | Treated as failure — an API problem, not reality |
| One class empty | Normal; that class does not render |
| `/recruiting/teams` returns no row | Normal; header omits rank |
| Client fetch fails | Fall back to `localStorage`; if that is also empty, render "Recruiting data unavailable — check back shortly" |

The write-nothing-on-failure rule mirrors the existing roster scraper's
validation guard, which has held since March 2026.

## Testing

- Run `fetch-recruits.js` against live CFBD; assert the current class is
  non-empty and every commit has `name` and `year` (**not** `position` or
  `rating` — both are nullable).
- Unit-test the render rule with fixtures: a class fully on the roster (hidden),
  partially on the roster (shown, some badged), and not on the roster at all.
- Unit-test sort stability with null `rating` and null `stars` present.
- Assert a failed fetch leaves an existing `recruits.json` byte-identical.
- Assert an unchanged class does not rewrite `updated`.
- Assert `Ctrl+Z` is a no-op while `activeSection === 'recruiting'`.
- Manual mobile check at 375px; screen-reader check of star labels.
- Confirm the depth chart renders unchanged with `activeSection === 'depth'`.

## Known limitations

- **No per-player signed status.** CFBD exposes no reliable signed flag.
  Between the December and February signing dates a class mixes signed and
  committed players, and the UI will not distinguish them. Inferring it per
  player from the calendar would be fabrication. Class-level phase labeling is
  the honest ceiling.
- **Committed players only.** Uncommitted targets and offer lists are not in
  the API. The view answers "who is in the class," not "who are we chasing."
- **Decommitments** disappear silently on the next run; no history is kept.
- **Name matching is fuzzy** (see class rule above).

## Future: transfer portal

`/player/portal?year=<N>` returns `firstName`, `lastName`, `origin`,
`destination`, `transferDate`, `rating`, `stars`, `eligibility` — enough for
both transfers in and out, filtered on `destination`/`origin` equal to Penn
State.

Same API, same key, same commit-static-JSON pattern, so it becomes a sibling
sub-view under `RECRUITING` rather than a second pipeline. Budget its calls
against the 1,000/month ceiling noted above.
