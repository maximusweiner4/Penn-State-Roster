const { test } = require('node:test');
const assert = require('node:assert');
const { annotateClass, shouldRenderClass, selectClasses } = require('./roster-match');

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

test('selectClasses picks the newest class that has commits', () => {
  const a = annotateClass({ year: 2026, commits: [{ name: 'Zion Tracy' }] }, roster);
  const b = annotateClass({ year: 2027, commits: [{ name: 'New Kid' }] }, roster);
  assert.deepStrictEqual(selectClasses([a, b]).map(c => c.year), [2027]);
});

test('selectClasses ignores an empty newer class', () => {
  // The real July 2026 shape: 2026 signed and enrolled, 2027 not yet in CFBD.
  const a = annotateClass({ year: 2026, commits: [{ name: 'Zion Tracy' }] }, roster);
  const b = annotateClass({ year: 2027, commits: [] }, roster);
  const out = selectClasses([a, b]);
  assert.deepStrictEqual(out.map(c => c.year), [2026]);
  assert.strictEqual(out[0].commits[0].onRoster, true, 'enrolled members stay badged');
});

test('selectClasses does not prefer an older class just because it has attrition', () => {
  // 2025 has members who left and will never match the roster; 2026 is fully
  // enrolled. The newer class must still win.
  const old = annotateClass({ year: 2025, commits: [{ name: 'Zion Tracy' }, { name: 'Transferred Away' }] }, roster);
  const recent = annotateClass({ year: 2026, commits: [{ name: 'Zion Tracy' }] }, roster);
  assert.deepStrictEqual(selectClasses([old, recent]).map(c => c.year), [2026]);
});

test('selectClasses returns nothing when no class has commits', () => {
  assert.deepStrictEqual(selectClasses([
    annotateClass({ year: 2027, commits: [] }, roster),
    annotateClass({ year: 2028, commits: [] }, roster)
  ]), []);
});
