const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ROSTER_URL = 'https://gopsusports.com/sports/football/roster';

// Map website positions to our app's position codes
const positionMap = {
  'QB': 'QB',
  'RB': 'RB',
  'FB': 'RB',
  'WR': 'WR',
  'TE': 'TE',
  'OL': 'OL',
  'OT': 'OL',
  'OG': 'OL',
  'C': 'OL',
  'DL': 'DL',
  'DT': 'DT',
  'NT': 'DT',
  'DE': 'DE',
  'EDGE': 'DE',
  'LB': 'LB',
  'ILB': 'LB',
  'OLB': 'LB',
  'MLB': 'LB',
  'DB': 'DB',
  'CB': 'CB',
  'S': 'S',
  'SS': 'S',
  'FS': 'S',
  'K': 'K',
  'PK': 'K',
  'P': 'P',
  'LS': 'LS',
  'SNP': 'LS'
};

// Map full year names to abbreviated codes
const yearMap = {
  'freshman': 'Fr.',
  'sophomore': 'So.',
  'junior': 'Jr.',
  'senior': 'Sr.',
  'redshirt freshman': 'R-Fr.',
  'redshirt sophomore': 'R-So.',
  'redshirt junior': 'R-Jr.',
  'redshirt senior': 'R-Sr.',
  'graduate': 'Grad',
  'graduate student': 'Grad',
  'grad': 'Grad',
  '5th year': 'Sr.',
  '6th year': 'Grad'
};

async function scrapeRoster() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`Navigating to ${ROSTER_URL}...`);
    await page.goto(ROSTER_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Wait for the roster table to render (Vue hydration can take time in CI)
    // gopsusports.com uses a.table__roster-name for all player name links
    try {
      await page.waitForSelector('a.table__roster-name', { timeout: 30000 });
      console.log('Roster table confirmed rendered.');
    } catch (e) {
      console.warn('Timeout waiting for a.table__roster-name — proceeding anyway.');
    }

    // Save page HTML for debugging
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, '../debug-artifacts/scrape-debug/page-debug.html'), html);
    console.log('Saved page HTML to debug-artifacts/scrape-debug/page-debug.html');

    // Extract team information
    console.log('Extracting team information...');
    const teamInfo = await page.evaluate(() => {
      let teamName = '';
      let primaryColor = '#041E42'; // Default Penn State navy
      const secondaryColor = '#FFFFFF';

      const ogSiteName = document.querySelector('meta[property="og:site_name"]');
      if (ogSiteName) teamName = ogSiteName.getAttribute('content') || '';

      if (!teamName) {
        const title = document.title || '';
        const match = title.match(/(?:Roster|Football).*?[-–]\s*(.+?)(?:\s*(?:Official|Athletics))?$/i);
        teamName = match ? match[1].trim() : title.split('-')[0].trim();
      }

      const root = document.documentElement;
      const computedStyle = getComputedStyle(root);
      const primaryVar = computedStyle.getPropertyValue('--primary-color') ||
                         computedStyle.getPropertyValue('--school-primary') ||
                         computedStyle.getPropertyValue('--brand-primary');
      if (primaryVar) primaryColor = primaryVar.trim();

      const headerEl = document.querySelector('.site-header, header, [class*="navbar"]');
      if (headerEl) {
        const bgColor = getComputedStyle(headerEl).backgroundColor;
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
          primaryColor = bgColor;
        }
      }

      return {
        name: teamName,
        primaryColor,
        secondaryColor,
        baseUrl: window.location.origin,
        rosterUrl: window.location.href
      };
    });

    console.log(`Team: ${teamInfo.name}`);
    console.log(`Base URL: ${teamInfo.baseUrl}`);

    console.log('Extracting roster data...');

    // Extract player data using confirmed gopsusports.com (Sidearm Vue) selectors.
    //
    // Page structure (confirmed from debug HTML 2026-03-25):
    //   table > tbody > tr
    //     td.roster-table-cell        → col 0: jersey number (or "-")
    //     th.roster-table-cell        → col 1: name  (a.table__roster-name[href*="/roster/player/"])
    //     td.roster-table-cell        → col 2: position abbreviation (e.g. "WR")
    //     td.roster-table-cell        → col 3: year   (e.g. "Redshirt Senior")
    //     td.roster-table-cell        → col 4: height (e.g. "6-3")
    //     td.roster-table-cell        → col 5: weight (e.g. "210 lbs")
    //     td.roster-table-cell        → col 6: hometown
    //     td.roster-table-cell        → col 7: high school
    //     td.roster-table-cell        → col 8: previous school (transfer)
    //     td.roster-table-cell--no-print → col 9: action (ignored)
    //
    // Staff rows use a.table__roster-name too but link to /roster/season/.../staff/
    // so we filter by /roster/player/ in the href.
    const players = await page.evaluate(() => {
      const playerList = [];

      // All player name links (not staff — staff links contain /staff/)
      const playerLinks = document.querySelectorAll('a.table__roster-name[href*="/roster/player/"]');
      console.log(`Found ${playerLinks.length} player name links`);

      playerLinks.forEach(link => {
        // Name is in the <span> child or direct text
        const name = (link.querySelector('span')?.textContent || link.textContent || '').trim();
        if (!name) return;

        const playerUrl = link.getAttribute('href') || '';

        // Walk up to the containing <tr>
        const row = link.closest('tr');
        if (!row) return;

        // All cells in this row (td + th)
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length < 3) return;

        const getText = (idx) => (cells[idx]?.textContent || '').trim();

        // Col 0: jersey number — may be "-" or empty for walk-ons/staff
        const numText = getText(0);
        const number = /^\d{1,3}$/.test(numText) ? parseInt(numText, 10) : 0;

        // Col 2: position abbreviation
        const position = getText(2);

        // Col 3: class/year
        const year = getText(3);

        // Col 4: height
        const height = getText(4);

        // Col 5: weight
        const weight = getText(5);

        // Col 6: hometown
        let hometown = getText(6);
        // Sanity: hometown should contain a comma
        if (hometown && !hometown.includes(',')) hometown = '';

        // Col 7: high school
        const highSchool = getText(7);

        // Col 8: previous school (transfer portal)
        const previousSchool = getText(8);

        playerList.push({ name, number, position, year, height, weight, hometown, highSchool, previousSchool, playerUrl });
      });

      return playerList;
    });

    if (players.length === 0) {
      console.error('No players found. The page structure may not be supported.');
      console.error('Check debug-artifacts/scrape-debug/page-debug.html to analyze the page structure.');
      process.exit(1);
    }

    // Clean up and normalize the data
    const cleanedPlayers = players
      .filter(p => p.name && p.name.length > 2)
      .map(p => {
        // Normalize year
        const yearLower = (p.year || '').toLowerCase().trim();
        const normalizedYear = yearMap[yearLower] || p.year || 'Unknown';

        // Build full player URL
        let fullUrl = '';
        if (p.playerUrl) {
          if (p.playerUrl.startsWith('http')) {
            fullUrl = p.playerUrl;
          } else {
            fullUrl = teamInfo.baseUrl + p.playerUrl;
          }
        }

        return {
          name: p.name.replace(/\s+/g, ' ').trim(),
          number: p.number || 0,
          position: positionMap[p.position] || p.position || 'Unknown',
          year: normalizedYear,
          height: p.height || '',
          weight: p.weight || '',
          hometown: p.hometown || '',
          highSchool: p.highSchool || '',
          previousSchool: p.previousSchool || '',
          url: fullUrl
        };
      });

    // Remove duplicates
    const uniquePlayers = [];
    const seen = new Set();
    for (const p of cleanedPlayers) {
      const key = p.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniquePlayers.push(p);
      }
    }

    // ── Data quality validation ──────────────────────────────────────────────
    // Fail loudly rather than silently overwrite roster.json with broken data.
    // If the page structure changes again, GitHub Actions will flag the run as
    // failed and send an email instead of publishing garbage to the live site.
    const unknownPositions = uniquePlayers.filter(p => p.position === 'Unknown').length;
    const unknownYears     = uniquePlayers.filter(p => p.year === 'Unknown').length;
    const unknownPct = (n) => Math.round((n / uniquePlayers.length) * 100);

    console.log(`Data quality — Unknown positions: ${unknownPositions}/${uniquePlayers.length} (${unknownPct(unknownPositions)}%)`);
    console.log(`Data quality — Unknown years:     ${unknownYears}/${uniquePlayers.length} (${unknownPct(unknownYears)}%)`);

    // Thresholds: fail if more than 20% of players are missing position or year.
    // A real roster will never have this many unknowns; it indicates selector rot.
    const UNKNOWN_THRESHOLD = 0.20;
    if (unknownPositions / uniquePlayers.length > UNKNOWN_THRESHOLD) {
      console.error(`VALIDATION FAILED: ${unknownPct(unknownPositions)}% of players have Unknown position (threshold ${UNKNOWN_THRESHOLD * 100}%).`);
      console.error('The page structure has likely changed. Roster NOT saved. Check page-debug.html.');
      process.exit(1);
    }
    if (unknownYears / uniquePlayers.length > UNKNOWN_THRESHOLD) {
      console.error(`VALIDATION FAILED: ${unknownPct(unknownYears)}% of players have Unknown year (threshold ${UNKNOWN_THRESHOLD * 100}%).`);
      console.error('The page structure has likely changed. Roster NOT saved. Check page-debug.html.');
      process.exit(1);
    }
    if (uniquePlayers.length < 50) {
      console.error(`VALIDATION FAILED: Only ${uniquePlayers.length} players found (expected 50+). Roster NOT saved.`);
      process.exit(1);
    }
    // ── End validation ───────────────────────────────────────────────────────

    console.log(`Successfully extracted ${uniquePlayers.length} players`);

    // Save team info
    fs.writeFileSync(
      path.join(__dirname, 'team.json'),
      JSON.stringify(teamInfo, null, 2)
    );
    console.log('Team info saved to scripts/team.json');

    // Save roster to JSON file
    fs.writeFileSync(
      path.join(__dirname, 'roster.json'),
      JSON.stringify(uniquePlayers, null, 2)
    );
    console.log('Roster saved to scripts/roster.json');

  } catch (error) {
    console.error('Error scraping roster:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

scrapeRoster();
