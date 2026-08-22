const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

function loadStates() {
  const p = path.join(dataDir, 'usa_states.json');
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return [];
}

function loadCategories() {
  const p = path.join(dataDir, 'categories.json');
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return [];
}

const STATES = loadStates();
const CATEGORIES = loadCategories();

const STATE_MAP = {};
STATES.forEach(s => { STATE_MAP[s.code.toUpperCase()] = s; });

const CATEGORY_MAP = {};
CATEGORIES.forEach(c => { CATEGORY_MAP[c.primary_tag.toLowerCase()] = c; });

function getState(codeOrName) {
  if (!codeOrName) return null;
  const val = codeOrName.trim().toUpperCase();
  if (STATE_MAP[val]) return STATE_MAP[val];
  return STATES.find(s => s.name.toLowerCase() === codeOrName.trim().toLowerCase()) || null;
}

function getCategory(tagOrSlug) {
  if (!tagOrSlug) return null;
  const val = tagOrSlug.trim().toLowerCase();
  if (CATEGORY_MAP[val]) return CATEGORY_MAP[val];
  return CATEGORIES.find(c => c.slug.toLowerCase() === val || c.category.toLowerCase() === val) || null;
}

const PLATFORM_SITES = {
  instagram: 'site:instagram.com',
  tiktok: 'site:tiktok.com',
  facebook: 'site:facebook.com',
  youtube: 'site:youtube.com'
};

const STATE_AREA_CODES = {
  AL: ['205', '256', '334'],
  AK: ['907'],
  AZ: ['602', '480', '623', '520'],
  AR: ['501', '479', '870'],
  CA: ['310', '415', '213', '818', '619', '714'],
  CO: ['303', '719', '970'],
  CT: ['203', '860'],
  DE: ['302'],
  FL: ['305', '407', '813', '954', '561'],
  GA: ['404', '770', '678', '912'],
  HI: ['808'],
  ID: ['208'],
  IL: ['312', '773', '630', '847'],
  IN: ['317', '219', '574'],
  IA: ['515', '319', '563'],
  KS: ['316', '913'],
  KY: ['502', '859', '270'],
  LA: ['504', '225', '337'],
  ME: ['207'],
  MD: ['301', '410', '240'],
  MA: ['617', '508', '781'],
  MI: ['313', '248', '616', '517'],
  MN: ['612', '651', '763', '952'],
  MS: ['601', '662'],
  MO: ['314', '816', '417'],
  MT: ['406'],
  NE: ['402', '308'],
  NV: ['702', '775'],
  NH: ['603'],
  NJ: ['201', '973', '732'],
  NM: ['505', '575'],
  NY: ['212', '917', '718', '516'],
  NC: ['704', '919', '336'],
  ND: ['701'],
  OH: ['216', '614', '513'],
  OK: ['405', '918'],
  OR: ['503', '541'],
  PA: ['215', '412', '610'],
  RI: ['401'],
  SC: ['803', '843'],
  SD: ['605'],
  TN: ['615', '901', '865'],
  TX: ['214', '713', '512', '210'],
  UT: ['801', '435'],
  VT: ['802'],
  VA: ['703', '804', '757'],
  WA: ['206', '509', '425'],
  WV: ['304'],
  WI: ['414', '608', '920'],
  WY: ['307'],
  DC: ['202']
};

function buildSearchQuery({ platform = 'instagram', stateCode = 'CA', tag = 'love', mode = 'email' }) {
  const siteFilter = PLATFORM_SITES[platform.toLowerCase()] || 'site:instagram.com';
  const stateInfo = getState(stateCode);
  const stateName = stateInfo ? stateInfo.name : stateCode;
  const sCode = stateInfo ? stateInfo.code.toUpperCase() : (stateCode || 'CA').toUpperCase();
  
  const cleanTag = tag.trim().replace(/^#+/, '').toLowerCase() || 'love';
  
  if (mode === 'phone_only') {
    const areaCodes = STATE_AREA_CODES[sCode] || ['612', '310', '212', '713'];
    const areaFilter = areaCodes.slice(0, 2).map(code => `"${code}"`).join(' OR ');
    return `${siteFilter} "${cleanTag}" ${areaFilter} OR "Call" OR "Text" "${stateName}"`;
  }

  return `${siteFilter} "${cleanTag}" "@gmail.com" "${stateName}"`;
}

function saveCategories(categoriesList) {
  const p = path.join(dataDir, 'categories.json');
  fs.writeFileSync(p, JSON.stringify(categoriesList, null, 2), 'utf8');
  CATEGORIES.length = 0;
  categoriesList.forEach(c => CATEGORIES.push(c));
}

function saveStates(statesList) {
  const p = path.join(dataDir, 'usa_states.json');
  fs.writeFileSync(p, JSON.stringify(statesList, null, 2), 'utf8');
  STATES.length = 0;
  statesList.forEach(s => STATES.push(s));
}

module.exports = {
  STATES,
  CATEGORIES,
  getState,
  getCategory,
  buildSearchQuery,
  saveCategories,
  saveStates
};
