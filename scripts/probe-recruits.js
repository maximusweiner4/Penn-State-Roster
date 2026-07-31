// Diagnostic only. Never runs on a schedule -- triggered by hand via
// .github/workflows/probe-recruits.yml when CFBD returns unexpected counts.
// Writes nothing. Budget: ~10 calls against the 1,000/month free tier.
const { cfbdGet } = require('./lib/cfbd');

const TEAM = 'Penn State';

async function count(label, params) {
  try {
    const rows = await cfbdGet('/recruiting/players', params);
    const n = Array.isArray(rows) ? rows.length : 0;
    const sample = n ? ` | e.g. ${rows[0].name} (${rows[0].position ?? '?'}, ${rows[0].recruitType ?? '?'}, stars=${rows[0].stars ?? 'null'})` : '';
    console.log(`${label.padEnd(38)} -> ${String(n).padStart(3)} rows${sample}`);
  } catch (e) {
    console.log(`${label.padEnd(38)} -> ERROR ${e.message}`);
  }
}

async function main() {
  console.log('--- by year, team + HighSchool (what the fetcher asks for) ---');
  for (const year of [2024, 2025, 2026, 2027, 2028]) {
    await count(`year=${year} team HighSchool`, { year, team: TEAM, classification: 'HighSchool' });
  }

  console.log('--- same years, team only (is the classification filter the issue?) ---');
  for (const year of [2026, 2027, 2028]) {
    await count(`year=${year} team, no classification`, { year, team: TEAM });
  }

  console.log('--- 2027 league-wide (is the whole class empty, or just PSU?) ---');
  await count('year=2027 all teams', { year: 2027 });
}

main().catch(e => { console.error(e.message); process.exit(1); });
