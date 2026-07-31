const fs = require('fs');
const path = require('path');
const { cfbdGet } = require('./lib/cfbd');
const { heightToFeetInches, mapPosition } = require('./lib/normalize');
const { sortCommits } = require('./lib/sort');
const { annotateClass, shouldRenderClass } = require('./lib/roster-match');
const { buildOutput } = require('./lib/changed');

const TEAM = 'Penn State';
const OUT = path.join(__dirname, 'recruits.json');
const ROSTER = path.join(__dirname, 'roster.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function fetchClass(year) {
  const players = await cfbdGet('/recruiting/players', {
    year, team: TEAM, classification: 'HighSchool'
  });

  // A thin class legitimately has no team-ranking row. Never fatal.
  let rank = null;
  try {
    const teams = await cfbdGet('/recruiting/teams', { year, team: TEAM });
    if (Array.isArray(teams) && teams.length) rank = teams[0].rank ?? null;
  } catch (e) {
    console.warn(`[fetch-recruits] no team ranking for ${year}: ${e.message}`);
  }

  const commits = sortCommits((players || []).map(p => ({
    name: p.name,
    position: mapPosition(p.position),
    stars: p.stars ?? null,
    rating: p.rating ?? null,
    ranking: p.ranking ?? null,
    height: heightToFeetInches(p.height),
    weight: p.weight ?? null,
    city: p.city || '',
    state: p.stateProvince || '',
    school: p.school || ''
  })));

  return { year, rank, commits };
}

async function main() {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const roster = readJson(ROSTER, []);

  const fetched = [];
  for (const year of [currentYear, currentYear + 1]) {
    fetched.push(await fetchClass(year));
  }

  // Guard 1: total emptiness is an API problem, not reality.
  const total = fetched.reduce((n, c) => n + c.commits.length, 0);
  if (total === 0) {
    console.error('[fetch-recruits] every class came back empty — refusing to write');
    process.exit(1);
  }

  // Guard 2: name is the one field the UI cannot render without.
  // Do NOT assert position/rating/stars — all are nullable in early classes.
  for (const c of fetched) {
    const nameless = c.commits.filter(r => !r.name).length;
    if (nameless > 0) {
      console.error(`[fetch-recruits] ${nameless} commit(s) in ${c.year} have no name — refusing to write`);
      process.exit(1);
    }
  }

  const classes = fetched.map(c => annotateClass(c, roster)).filter(shouldRenderClass);

  const output = buildOutput(classes, readJson(OUT, null), now.toISOString().slice(0, 10));
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`[fetch-recruits] wrote ${classes.length} class(es), ${total} commit(s)`);
}

main().catch(err => {
  console.error(`[fetch-recruits] FAILED: ${err.message}`);
  process.exit(1); // recruits.json is left untouched
});
