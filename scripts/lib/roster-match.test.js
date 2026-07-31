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
