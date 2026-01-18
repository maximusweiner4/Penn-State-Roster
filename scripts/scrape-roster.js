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
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Save page HTML for debugging
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'page-debug.html'), html);
    console.log('Saved page HTML to page-debug.html');

    console.log('Extracting roster data...');

    // Extract player data from the page
    const players = await page.evaluate(() => {
      const playerList = [];

      // Target the roster table specifically (not staff table)
      // The roster table is inside .roster-players section
      const rosterSection = document.querySelector('.roster-players');
      if (!rosterSection) {
        console.log('No .roster-players section found');
        return { raw: document.body.innerText.substring(0, 100000) };
      }

      const tableRows = rosterSection.querySelectorAll('table tbody tr');
      console.log(`Found ${tableRows.length} player rows in roster table`);

      tableRows.forEach(row => {
        // Get all cells (td and th)
        const cells = row.querySelectorAll('td, th');
        if (cells.length < 4) return;

        // Cell structure:
        // 0: Jersey number
        // 1: Name (th with link)
        // 2: Position
        // 3: Year/Class
        // 4: Height
        // 5: Weight
        // 6: Hometown
        // 7: High School
        // 8: Previous School

        // Get jersey number from first cell
        const numberText = cells[0]?.textContent?.trim() || '';
        const number = parseInt(numberText) || 0;

        // Get name and URL from the link in cell 1
        const nameLink = cells[1]?.querySelector('a.table__roster-name');
        const name = nameLink?.textContent?.trim() || '';
        const playerUrl = nameLink?.getAttribute('href') || '';

        // Get position from cell 2
        const position = cells[2]?.textContent?.trim() || '';

        // Get year from cell 3
        const year = cells[3]?.textContent?.trim() || '';

        // Get height from cell 4
        const height = cells[4]?.textContent?.trim() || '';

        // Get weight from cell 5
        const weight = cells[5]?.textContent?.trim() || '';

        // Get hometown from cell 6
        const hometown = cells[6]?.textContent?.trim() || '';

        // Get high school from cell 7
        const highSchool = cells[7]?.textContent?.trim() || '';

        // Get previous school from cell 8 (for transfers)
        const previousSchool = cells[8]?.textContent?.trim() || '';

        if (name && name.length > 2 && name.length < 50) {
          playerList.push({
            name,
            number,
            position,
            year,
            height,
            weight,
            hometown,
            highSchool,
            previousSchool,
            playerUrl
          });
        }
      });

      if (playerList.length > 0) {
        return playerList;
      }

      // Fallback: try finding player links if table extraction fails
      const playerLinks = document.querySelectorAll('.roster-players a[href*="/sports/football/roster/player/"]');
      console.log(`Fallback: Found ${playerLinks.length} player links`);

      playerLinks.forEach(link => {
        const row = link.closest('tr');
        if (!row) return;

        const cells = row.querySelectorAll('td, th');
        const numberText = cells[0]?.textContent?.trim() || '';
        const number = parseInt(numberText) || 0;
        const name = link.textContent?.trim() || '';
        const playerUrl = link.getAttribute('href') || '';
        const position = cells[2]?.textContent?.trim() || '';
        const year = cells[3]?.textContent?.trim() || '';
        const height = cells[4]?.textContent?.trim() || '';
        const weight = cells[5]?.textContent?.trim() || '';
        const hometown = cells[6]?.textContent?.trim() || '';
        const highSchool = cells[7]?.textContent?.trim() || '';
        const previousSchool = cells[8]?.textContent?.trim() || '';

        if (name && name.length > 2 && name.length < 50) {
          playerList.push({
            name,
            number,
            position,
            year,
            height,
            weight,
            hometown,
            highSchool,
            previousSchool,
            playerUrl
          });
        }
      });

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
      .map(p => {
        // Normalize year - try lowercase lookup first
        const yearLower = (p.year || '').toLowerCase().trim();
        const normalizedYear = yearMap[yearLower] || p.year || 'Unknown';

        // Build full player URL
        const fullUrl = p.playerUrl ? `https://gopsusports.com${p.playerUrl}` : '';

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
