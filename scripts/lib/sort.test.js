const { test } = require('node:test');
const assert = require('node:assert');
const { sortCommits } = require('./sort');

const names = (a) => a.map(r => r.name);

test('sorts by rating descending', () => {
  const out = sortCommits([
    { name: 'B', rating: 0.91, stars: 4, ranking: 50 },
    { name: 'A', rating: 0.98, stars: 5, ranking: 10 }
  ]);
  assert.deepStrictEqual(names(out), ['A', 'B']);
});

test('null ratings sort last', () => {
  const out = sortCommits([
    { name: 'Unrated', rating: null, stars: null, ranking: null },
    { name: 'Rated', rating: 0.80, stars: 3, ranking: 900 }
  ]);
  assert.deepStrictEqual(names(out), ['Rated', 'Unrated']);
});

test('ties break by stars, then ranking, then name', () => {
  const out = sortCommits([
    { name: 'Zeta',  rating: 0.90, stars: 4, ranking: 100 },
    { name: 'Alpha', rating: 0.90, stars: 4, ranking: 100 },
    { name: 'Beta',  rating: 0.90, stars: 4, ranking: 50  },
    { name: 'Gamma', rating: 0.90, stars: 5, ranking: 999 }
  ]);
  assert.deepStrictEqual(names(out), ['Gamma', 'Beta', 'Alpha', 'Zeta']);
});

test('is deterministic across repeated shuffles', () => {
  const input = [
    { name: 'A', rating: null, stars: null, ranking: null },
    { name: 'B', rating: null, stars: 4,    ranking: null },
    { name: 'C', rating: 0.9,  stars: 4,    ranking: 1    }
  ];
  const first = names(sortCommits(input));
  for (let i = 0; i < 20; i++) {
    const shuffled = [...input].sort(() => Math.random() - 0.5);
    assert.deepStrictEqual(names(sortCommits(shuffled)), first);
  }
});

test('does not mutate its input', () => {
  const input = [{ name: 'B', rating: 0.1 }, { name: 'A', rating: 0.9 }];
  sortCommits(input);
  assert.deepStrictEqual(names(input), ['B', 'A']);
});
