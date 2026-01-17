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

    // Wait for roster content to load
    await page.waitForSelector('body', { timeout: 30000 });

    // Give extra time for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('Extracting roster data...');

    // Extract player data from the page
    const players = await page.evaluate(() => {
      const playerList = [];

      // Try multiple selectors that might contain player data
      const selectors = [
        '.s-person-card',
        '.roster-card',
        '[class*="roster"] [class*="card"]',
        '.player-card',
        'table tbody tr',
        '[class*="player"]',
        'article',
        '.sidearm-roster-player'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);

          elements.forEach(el => {
            // Try to extract player info from various possible structures
            const text = el.textContent || '';
            const html = el.innerHTML || '';

            // Look for jersey number
            let number = null;
            const numberMatch = text.match(/#(\d+)/);
            if (numberMatch) {
              number = parseInt(numberMatch[1]);
            } else {
              const numEl = el.querySelector('[class*="number"], .jersey-number, [class*="jersey"]');
              if (numEl) {
                const numText = numEl.textContent.replace(/\D/g, '');
                if (numText) number = parseInt(numText);
              }
            }

            // Look for name
            let name = null;
            const nameEl = el.querySelector('[class*="name"], h3, h4, .player-name, a[href*="roster"]');
            if (nameEl) {
              name = nameEl.textContent.trim();
            }

            // Look for position
            let position = null;
            const posEl = el.querySelector('[class*="position"], .pos');
            if (posEl) {
              position = posEl.textContent.trim().toUpperCase();
            }

            // Look for year/class
            let year = null;
            const yearEl = el.querySelector('[class*="year"], [class*="class"], .academic-year');
            if (yearEl) {
              year = yearEl.textContent.trim();
            }

            if (name && name.length > 2 && name.length < 50) {
              playerList.push({ name, number, position, year, raw: text.substring(0, 200) });
            }
          });

          if (playerList.length > 0) break;
        }
      }

      // If structured extraction failed, try to parse the full page text
      if (playerList.length === 0) {
        const bodyText = document.body.innerText;
        console.log('Structured extraction failed, returning page text for analysis');
        return { raw: bodyText.substring(0, 50000) };
      }

      return playerList;
    });

    // If we got raw text instead of structured data, save it for analysis
    if (players.raw) {
      console.log('Saving raw page content for analysis...');
      fs.writeFileSync(
        path.join(__dirname, 'page-content.txt'),
        players.raw
      );
      console.log('Page content saved to scripts/page-content.txt');
      console.log('Manual inspection may be needed to identify the correct selectors.');

      // Try to parse roster from raw text
      const lines = players.raw.split('\n');
      const extractedPlayers = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Look for patterns like "#19 Jack Lambert QB Junior"
        const match = line.match(/#?(\d{1,2})\s+([A-Za-z\s'.,-]+?)\s+(QB|RB|WR|TE|OL|DL|DE|DT|LB|CB|S|K|P|LS|DB|FB|OT|OG|C|NT|ILB|OLB|MLB|SS|FS|PK|SNP)\s+(.+)/i);
        if (match) {
          extractedPlayers.push({
            number: parseInt(match[1]),
            name: match[2].trim(),
            position: match[3].toUpperCase(),
            year: match[4].trim()
          });
        }
      }

      if (extractedPlayers.length > 0) {
        console.log(`Extracted ${extractedPlayers.length} players from raw text`);
        fs.writeFileSync(
          path.join(__dirname, 'roster.json'),
          JSON.stringify(extractedPlayers, null, 2)
        );
        return;
      }
    }

    // Clean up and normalize the data
    const cleanedPlayers = players
      .filter(p => p.name && p.position)
      .map(p => ({
        name: p.name.replace(/\s+/g, ' ').trim(),
        number: p.number || 0,
        position: positionMap[p.position] || p.position,
        year: p.year || 'Unknown'
      }));

    console.log(`Successfully extracted ${cleanedPlayers.length} players`);

    // Save to JSON file
    fs.writeFileSync(
      path.join(__dirname, 'roster.json'),
      JSON.stringify(cleanedPlayers, null, 2)
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
