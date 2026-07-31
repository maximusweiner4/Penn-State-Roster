// Nulls always sort last. Unrated recruits are common in early classes, and an
// unstable order would scatter them and produce spurious daily diffs, which in
// turn become noise commits.

function cmpDesc(a, b) {           // higher is better
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function cmpAsc(a, b) {            // lower is better
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
