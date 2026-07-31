// update-recruits.yml commits only when `git diff --quiet` reports a change.
// A fresh timestamp on every run would make the diff permanently dirty -- 365
// noise commits a year, and the "did the class change?" signal is destroyed.
// So `updated` is rewritten only when `classes` actually changed.
function buildOutput(classes, previous, today) {
  const unchanged = previous &&
    JSON.stringify(previous.classes) === JSON.stringify(classes);
  return { updated: unchanged ? previous.updated : today, classes };
}

module.exports = { buildOutput };
