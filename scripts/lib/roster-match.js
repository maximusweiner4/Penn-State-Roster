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
// This replaces a calendar rule. An earlier draft rolled classes over on fixed
// March/August dates, justified by a claim that August enrollment guaranteed no
// player appears in both this view and the roster. That was false: roster.json
// has held the 22-player 2026 class since January, because early enrollees
// arrive in January and gopsusports publishes them immediately.
//
// Known behavior: a signee who decommits, greyshirts, or fails to qualify never
// appears in roster.json, so that class stays visible with its other members
// badged ON ROSTER until the fetch window drops it on January 1
// (fetch-recruits.js fetches only currentYear and currentYear+1). Accepted:
// showing a stale class briefly is cheaper than a fuzzy percentage threshold
// that would hide real recruits.
function shouldRenderClass(cls) {
  const commits = cls.commits || [];
  if (commits.length === 0) return false;
  return !commits.every(c => c.onRoster === true);
}

// CFBD does not carry in-cycle verbal commits: a class appears only once it
// signs. Probed 2026-07-31 -- year=2027 returned 0 rows league-wide, not just
// for PSU, while 2024/2025/2026 returned 26/29/15. So between roughly March and
// December there is no unsigned class to show, and the newest signed class has
// usually enrolled, which shouldRenderClass hides.
//
// Rather than render an empty section for months, fall back to the most recent
// class that has any commits. Its members carry ON ROSTER badges, so the overlap
// with the depth chart roster stays explicit rather than misleading.
function selectClasses(annotated) {
  const visible = annotated.filter(shouldRenderClass);
  if (visible.length > 0) return visible;

  const withCommits = annotated.filter(c => (c.commits || []).length > 0);
  if (withCommits.length === 0) return [];
  return [withCommits.reduce((a, b) => (b.year > a.year ? b : a))];
}

module.exports = { annotateClass, shouldRenderClass, selectClasses };
