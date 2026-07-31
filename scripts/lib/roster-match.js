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

// True when a class still has members who have not turned up on the roster.
// Used for labeling and diagnostics, not for choosing what to render.
function shouldRenderClass(cls) {
  const commits = cls.commits || [];
  if (commits.length === 0) return false;
  return !commits.every(c => c.onRoster === true);
}

// Render the single newest class CFBD actually has data for.
//
// CFBD does not carry in-cycle verbal commits -- a class appears only once it
// signs. Probed 2026-07-31: year=2027 returned 0 rows LEAGUE-WIDE (not just
// PSU), while 2024/2025/2026 returned 26/29/15. So the newest populated class is
// always the right answer: in July 2026 that is the 2026 class that just
// arrived; from December it becomes the class that just signed.
//
// Selecting on "has members not yet on the roster" instead would be wrong. The
// 2025 class has 29 signees but only 15 still on the roster -- transfers and
// attrition mean an old class never fully matches, so it would outrank the
// newer, more relevant one indefinitely.
//
// Members already on the roster keep their ON ROSTER badge, so the overlap with
// the depth chart stays explicit rather than hidden.
// ...and then only if that class has members who have not yet turned up on the
// roster. A class whose every member is already on the depth chart is not
// recruiting news -- those players are visible in the depth chart itself.
//
// This makes the section self-gating with no maintenance: it stays empty
// through the spring and summer, then populates on its own once CFBD publishes
// the newly signed class in December, and empties again when that class
// enrolls the following August.
//
// Deliberately does NOT fall back to an older class. The 2025 class has 29
// signees but only 15 still on the roster, so attrition would otherwise let a
// stale class qualify forever.
function selectClasses(annotated) {
  const withCommits = (annotated || []).filter(c => (c.commits || []).length > 0);
  if (withCommits.length === 0) return [];
  const newest = withCommits.reduce((a, b) => (b.year > a.year ? b : a));
  return shouldRenderClass(newest) ? [newest] : [];
}

module.exports = { annotateClass, shouldRenderClass, selectClasses };
