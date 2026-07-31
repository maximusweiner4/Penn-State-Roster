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
