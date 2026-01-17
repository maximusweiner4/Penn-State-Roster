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
  'DL': 'DT',
  'DT': 'DT',
  'NT': 'DT',
  'DE': 'DE',
  'LB': 'LB',
  'ILB': 'LB',
  'OLB': 'LB',
  'MLB': 'LB',
  'DB': 'CB',
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Save page HTML for debugging
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'page-debug.html'), html);
    console.log('Saved page HTML to page-debug.html');

    console.log('Extracting roster data...');

    // Extract player data from the page
    const players = await page.evaluate(() => {
      const playerList = [];

      // Sidearm Sports specific selectors
      const sidearmSelectors = [
        // List view selectors
        '.sidearm-roster-player-name a',
        '.s-person-details__personal-single-line a',
        '.s-person-card__content a[href*="/roster/"]',
        // Table view selectors
        'table.sidearm-table tbody tr',
        '.sidearm-roster-table tbody tr',
        // Card view selectors
        '.s-person-card',
        '.sidearm-roster-player',
        // Generic roster selectors
        '[class*="roster-player"]',
        '[class*="roster"] li',
        '[class*="roster"] article'
      ];

      // Try to find player links first (most reliable)
      const playerLinks = document.querySelectorAll('a[href*="/sports/football/roster/"]');
      console.log(`Found ${playerLinks.length} player links`);

      if (playerLinks.length > 0) {
        playerLinks.forEach(link => {
          // Get the parent container
          let container = link.closest('li, tr, article, [class*="card"], [class*="player"]');
          if (!container) container = link.parentElement?.parentElement || link.parentElement;

          const text = container ? container.textContent : '';
          const name = link.textContent.trim();

          if (name && name.length > 2 && name.length < 50 && !name.includes('Roster') && !name.includes('Full Bio')) {
            // Try to find number - look for # followed by digits or just digits in a specific element
            let number = 0;
            const numberMatch = text.match(/#(\d+)/);
            if (numberMatch) {
              number = parseInt(numberMatch[1]);
            } else {
              // Look for standalone number
              const numEl = container?.querySelector('[class*="number"], [class*="jersey"]');
              if (numEl) {
                const numText = numEl.textContent.replace(/\D/g, '');
                if (numText && numText.length <= 2) number = parseInt(numText);
              }
            }

            // Try to find position
            let position = '';
            const posMatch = text.match(/\b(QB|RB|FB|WR|TE|OL|OT|OG|DL|DT|NT|DE|LB|ILB|OLB|MLB|DB|CB|S|SS|FS|K|PK|P|LS|SNP|C)\b/i);
            if (posMatch) {
              position = posMatch[1].toUpperCase();
            }

            // Try to find year/class
            let year = '';
            const yearMatch = text.match(/\b(Fr\.|So\.|Jr\.|Sr\.|Freshman|Sophomore|Junior|Senior|R-Fr\.|R-So\.|R-Jr\.|R-Sr\.|Graduate|Grad|RS|GR)\b/i);
            if (yearMatch) {
              year = yearMatch[1];
            }

            playerList.push({ name, number, position, year });
          }
        });
      }

      // If we found players with links, return them
      if (playerList.length > 0) {
        return playerList;
      }

      // Try table rows
      const tableRows = document.querySelectorAll('table tbody tr');
      console.log(`Found ${tableRows.length} table rows`);

      if (tableRows.length > 0) {
        tableRows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const text = row.textContent;

            // Find name (usually in a link)
            const nameLink = row.querySelector('a');
            const name = nameLink ? nameLink.textContent.trim() : '';

            // Find number
            let number = 0;
            const numMatch = text.match(/#?(\d{1,2})\b/);
            if (numMatch) number = parseInt(numMatch[1]);

            // Find position
            let position = '';
            const posMatch = text.match(/\b(QB|RB|FB|WR|TE|OL|OT|OG|DL|DT|NT|DE|LB|ILB|OLB|MLB|DB|CB|S|SS|FS|K|PK|P|LS|SNP|C)\b/i);
            if (posMatch) position = posMatch[1].toUpperCase();

            // Find year
            let year = '';
            const yearMatch = text.match(/\b(Fr\.|So\.|Jr\.|Sr\.|Freshman|Sophomore|Junior|Senior|R-Fr\.|R-So\.|R-Jr\.|R-Sr\.|Graduate|Grad)\b/i);
            if (yearMatch) year = yearMatch[1];

            if (name && name.length > 2 && name.length < 50) {
              playerList.push({ name, number, position, year });
            }
          }
        });
      }

      if (playerList.length > 0) {
        return playerList;
      }

      // Last resort: return raw text for analysis
      return { raw: document.body.innerText.substring(0, 100000) };
    });

    // If we got raw text, try to parse it
    if (players.raw) {
      console.log('Structured extraction failed, parsing raw text...');
      fs.writeFileSync(path.join(__dirname, 'page-content.txt'), players.raw);

      const lines = players.raw.split('\n');
      const extractedPlayers = [];

      // Look for player patterns in consecutive lines
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines and navigation
        if (!line || line.length > 100) continue;

        // Look for lines that might be player names followed by info
        // Pattern: Name on one line, then number/position/year on following lines
        if (/^[A-Z][a-z]+(\s+[A-Z][a-z'.-]+)+$/.test(line)) {
          const nextLines = lines.slice(i + 1, i + 5).join(' ');

          const numMatch = nextLines.match(/#?(\d{1,2})\b/);
          const posMatch = nextLines.match(/\b(QB|RB|FB|WR|TE|OL|OT|OG|DL|DT|NT|DE|LB|ILB|OLB|MLB|DB|CB|S|SS|FS|K|PK|P|LS|SNP|C)\b/i);
          const yearMatch = nextLines.match(/\b(Fr\.|So\.|Jr\.|Sr\.|Freshman|Sophomore|Junior|Senior|R-Fr\.|R-So\.|R-Jr\.|R-Sr\.|Graduate)\b/i);

          if (posMatch) {
            extractedPlayers.push({
              name: line,
              number: numMatch ? parseInt(numMatch[1]) : 0,
              position: posMatch[1].toUpperCase(),
              year: yearMatch ? yearMatch[1] : ''
            });
          }
        }
      }

      if (extractedPlayers.length > 0) {
        console.log(`Extracted ${extractedPlayers.length} players from raw text`);
        const normalized = extractedPlayers.map(p => ({
          name: p.name,
          number: p.number,
          position: positionMap[p.position] || p.position,
          year: p.year
        }));
        fs.writeFileSync(path.join(__dirname, 'roster.json'), JSON.stringify(normalized, null, 2));
        console.log('Roster saved to scripts/roster.json');
        return;
      }

      console.log('Could not extract players. Check page-content.txt and page-debug.html for manual analysis.');
      fs.writeFileSync(path.join(__dirname, 'roster.json'), JSON.stringify([], null, 2));
      return;
    }

    // Clean up and normalize the data
    const cleanedPlayers = players
      .filter(p => p.name && p.name.length > 2)
      .map(p => ({
        name: p.name.replace(/\s+/g, ' ').trim(),
        number: p.number || 0,
        position: positionMap[p.position] || p.position || 'Unknown',
        year: p.year || 'Unknown'
      }));

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

    console.log(`Successfully extracted ${uniquePlayers.length} players`);

    // Save to JSON file
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
