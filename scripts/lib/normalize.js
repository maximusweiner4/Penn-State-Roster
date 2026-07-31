// CFBD position codes -> the vocabulary used in roster.json.
// Values MUST stay within: QB RB WR TE OL DL DT DE LB CB S K P LS
// ATH is a documented exception -- CFBD emits it constantly and there is no
// honest single-position mapping for an athlete.
const POSITION_MAP = {
  QB: 'QB', DUAL: 'QB', PRO: 'QB',
  RB: 'RB', APB: 'RB', FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  OT: 'OL', OG: 'OL', OC: 'OL', C: 'OL', OL: 'OL',
  DT: 'DT', NT: 'DT',
  DE: 'DE', SDE: 'DE', WDE: 'DE', EDGE: 'DE',
  DL: 'DL',
  LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB',
  CB: 'CB',
  S: 'S', SAF: 'S', FS: 'S', SS: 'S',
  K: 'K', PK: 'K',
  P: 'P',
  LS: 'LS',
  ATH: 'ATH'
};

function heightToFeetInches(inches) {
  const n = Number(inches);
  if (!Number.isFinite(n) || n <= 0) return '';
  const i = Math.round(n);
  return `${Math.floor(i / 12)}-${i % 12}`;
}

function mapPosition(pos) {
  if (!pos) return '';
  const key = String(pos).toUpperCase().trim();
  if (POSITION_MAP[key]) return POSITION_MAP[key];
  console.warn(`[fetch-recruits] unmapped position "${pos}" — passing through`);
  return pos;
}

// Suffix strip is anchored to end-of-string: an unanchored \b(ii|v)\b would
// delete legitimate given names such as "Ii".
function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[.'’,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, '');
}

module.exports = { heightToFeetInches, mapPosition, normalizeName, POSITION_MAP };
