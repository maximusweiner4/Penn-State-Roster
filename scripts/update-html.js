const fs = require('fs');
const path = require('path');

const ROSTER_FILE = path.join(__dirname, 'roster.json');
const HTML_FILE = path.join(__dirname, '..', 'index.html');

function updateHtml() {
  console.log('Reading roster data...');

  if (!fs.existsSync(ROSTER_FILE)) {
    console.error('Roster file not found. Run scrape-roster.js first.');
    process.exit(1);
  }

  const roster = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));

  if (!Array.isArray(roster) || roster.length === 0) {
    console.error('Invalid or empty roster data.');
    process.exit(1);
  }

  console.log(`Loaded ${roster.length} players from roster.json`);

  // Format roster as JavaScript array
  const rosterJs = roster.map(player => {
    // Escape single quotes in names
    const safeName = player.name.replace(/'/g, "\\'");
    return `      { name: '${safeName}', number: ${player.number}, position: '${player.position}', year: '${player.year}' }`;
  }).join(',\n');

  const newRosterBlock = `const DEFAULT_ROSTER = [\n${rosterJs}\n    ];`;

  console.log('Reading index.html...');
  let html = fs.readFileSync(HTML_FILE, 'utf8');

  // Find and replace the DEFAULT_ROSTER array
  const rosterRegex = /const DEFAULT_ROSTER = \[[\s\S]*?\];/;

  if (!rosterRegex.test(html)) {
    console.error('Could not find DEFAULT_ROSTER in index.html');
    process.exit(1);
  }

  html = html.replace(rosterRegex, newRosterBlock);

  console.log('Writing updated index.html...');
  fs.writeFileSync(HTML_FILE, html);

  console.log('Successfully updated index.html with new roster data!');
}

updateHtml();
