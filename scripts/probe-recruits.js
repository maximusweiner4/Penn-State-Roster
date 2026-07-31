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

  // Is On3 reachable from a GitHub Actions datacenter IP? This is the exact
  // failure mode that ruled out 247Sports, so it must be tested from CI rather
  // than from a home connection.
  console.log('--- On3 reachability from this runner ---');
  const url = 'https://www.on3.com/college/penn-state-nittany-lions/football/2027/commits/';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        'Accept': 'text/html'
      }
    });
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    let n = 'n/a';
    if (m) {
      try { n = JSON.parse(m[1]).props.pageProps.playerList.list.length; } catch { n = 'parse failed'; }
    }
    console.log(`On3 HTTP ${res.status}, ${html.length}b, __NEXT_DATA__=${!!m}, commits=${n}`);
    if (/captcha|cf-challenge|Just a moment/i.test(html)) console.log('On3: BOT CHALLENGE detected');
  } catch (e) {
    console.log(`On3 ERROR: ${e.message}`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
