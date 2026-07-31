const roster = require('./roster.json');
const zeroNum = roster.filter(p => !p.number || p.number === 0).length;
console.log('Missing/zero numbers:', zeroNum, 'of', roster.length);
console.log('\nPlayers with number 0 or missing:');
roster.filter(p => !p.number || p.number === 0).forEach(p => console.log(' #' + p.number, '|', p.name, '|', p.position));
console.log('\nSample with valid numbers:');
roster.filter(p => p.number > 0).slice(0, 10).forEach(p => console.log(' #' + p.number, '|', p.name, '|', p.position));
