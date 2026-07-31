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
