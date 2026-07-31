# Recruiting Section — Design

**Date:** 2026-07-31
**Status:** Approved, pending implementation plan
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
composite, so the 247 star ratings are still available through a documented,
key-authenticated JSON API.

**Endpoints** (all with `Authorization: Bearer $CFBD_API_KEY`):

| Endpoint | Purpose |
|---|---|
| `/recruiting/players?year=<N>&team=Penn%20State` | Per-recruit rows |
| `/recruiting/teams?year=<N>&team=Penn%20State` | Class rank and points |

**Per-recruit fields consumed:** `name`, `position`, `stars`, `rating`,
`ranking`, `height`, `weight`, `city`, `stateProvince`, `school`.

No Puppeteer required — this is a plain HTTPS JSON call, roughly 2s per run
versus the roster scraper's ~40s.

## Class window

Recruiting classes are named for the year the player enrolls. The active class
being recruited rolls over in March:

```
activeClass = (month >= 3) ? currentYear + 1 : currentYear
```

Fetch a **three-class window**: `activeClass - 1`, `activeClass`,
`activeClass + 1`.

Render a class only if **both**:

- it has at least 1 commit, and
- it has not enrolled yet: `year > currentYear || (year === currentYear && month < 8)`

The August cutoff matters: a class enrolls and appears in `roster.json` in
August, so dropping it from the recruiting view at the same moment guarantees
the two views never show the same player twice.

### Why a window instead of a single class

A single class with a March cutover produces a cliff: on March 1 the page flips
from a complete ~25-man signed class to a next class with two or three commits.
It also makes an emptiness check useless as a failure signal, because empty is
legitimately expected every spring.

The window removes the cutover entirely rather than special-casing it.

### Traced behavior

| Date | Renders | Cliff |
|---|---|---|
| Jul 2026 | 2026 (signed, arriving) + 2027 (building) | — |
| Dec 2026 | 2027 (just signed) + 2028 (early) | none |
| Mar 2027 | 2027 (24 signed) + 2028 (3 commits) | none |
| Sep 2027 | 2028 only; 2027 is now on the roster | none |

### Signing calendar

Verified 2026-07-31: early signing period **Dec 4, 2026**; traditional National
Signing Day **Feb 5, 2027**. Both fall before the March rollover, so both
signing events resolve to the same class year. The vast majority of recruits
now sign in December; February is largely residual.

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
| `index.html` | Section switch, recruiting render path, load/fallback |
| `service-worker.js` | Bump `CACHE_NAME` to v5, cache `recruits.json` |

### `recruits.json` shape

```json
{
  "updated": "2026-07-31T12:00:00Z",
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
          "height": 75,
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

`classes` is ordered oldest first. `commits` is sorted by `rating` descending.

### Workflow isolation

`update-recruits.yml` is deliberately **separate** from `update-roster.yml`.
Coupling them means a CFBD outage blocks the roster commit, and a
gopsusports.com change blocks the recruiting commit. Same daily cron, same
commit-only-if-changed pattern.

**Prerequisite (manual, by repo owner):** register for a free CFBD key at
collegefootballdata.com/key and add it as repo secret `CFBD_API_KEY`.

## UI

### Navigation

A `DEPTH CHART | RECRUITING` switch sits above the existing tab row. New state
`this.activeSection` (default `'depth'`), persisted to `localStorage` under
`psu-active-section` alongside the existing keys.

When `RECRUITING` is active, `renderTabs()`, the formation selector, the depth
level toggle, and the field are **not called**. Their internals are unchanged.
Undo/Redo/Reset are hidden — nothing in this view is editable.

A top-level section (rather than a fourth peer tab) was chosen because the three
existing tabs are all field-rendering depth chart views, and because it gives
transfers in/out a natural home as sibling sub-views later.

### Class rendering

Each rendered class shows a header —
`CLASS OF 2027 · 24 commits · Composite #4 national` — above a rating-ranked
card grid. Cards reuse the existing dark-navy styling: filled/empty star
glyphs, composite rating to four decimals, position badge, height/weight,
hometown.

Rating-ranked ordering (rather than grouping by position) leads with the
headliners and is the simplest thing that works. Position grouping can be added
later if class-needs analysis becomes useful.

### Mobile

Grid collapses 4 → 2 → 1 column at existing Tailwind breakpoints. The section
switch stays full-width tappable rather than shrinking. Verified at 375px
before the work is considered done.

## Error handling

| Condition | Behavior |
|---|---|
| Non-200, network error, or malformed JSON | Exit non-zero, **do not write** `recruits.json`; last-good data keeps serving; GitHub emails the failure |
| All three classes empty | Treated as failure — an API problem, not reality |
| One class empty | Normal; that class simply does not render |
| Client fetch fails | Fall back to `localStorage`, mirroring `index.html:784-798` |
| Stale service worker | Prevented by the `CACHE_NAME` bump |

The write-nothing-on-failure rule mirrors the existing roster scraper's
validation guard, which has held since March 2026.

## Testing

- Run `fetch-recruits.js` against live CFBD; assert the current class is
  non-empty and every commit has `name`, `position`, and `rating`.
- Unit-test the class-window rule against the four dates in the traced-behavior
  table by injecting a fixed clock.
- Assert a failed fetch leaves an existing `recruits.json` byte-identical.
- Manual mobile check at 375px.
- Confirm the depth chart renders unchanged with `activeSection === 'depth'`.

## Known limitations

- **No per-player signed status.** CFBD exposes no reliable signed flag.
  Between Dec 4 and Feb 5 a class is a mix of signed and committed players, and
  the UI will not distinguish them. Inferring it per player from the calendar
  would be fabrication. Class-level phase labeling is the honest ceiling.
- **Committed players only.** Uncommitted targets and offer lists are not in
  the API. The view answers "who is in the class," not "who are we chasing."
- **Decommitments** disappear from the class silently on the next run; no
  history is kept.

## Future: transfer portal

`/player/portal?year=<N>` returns `firstName`, `lastName`, `origin`,
`destination`, `transferDate`, `rating`, `stars`, `eligibility` — enough for
both transfers in and transfers out, filtered on `destination`/`origin` equal
to Penn State.

This is the same API, the same key, and the same commit-static-JSON pattern, so
it becomes a sibling sub-view under `RECRUITING` rather than a second data
pipeline.
