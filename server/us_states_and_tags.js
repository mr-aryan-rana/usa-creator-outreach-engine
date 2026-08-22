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

function buildSearchQuery({ platform = 'instagram', stateCode = 'CA', tag = 'love', mode = 'email' }) {
  const siteFilter = PLATFORM_SITES[platform.toLowerCase()] || 'site:instagram.com';
  const stateInfo = getState(stateCode);
  const stateName = stateInfo ? stateInfo.name : stateCode;
  
  const cleanTag = tag.trim().replace(/^#+/, '').toLowerCase() || 'love';
  
  if (mode === 'phone_only') {
    // High-Yield US Phone Number Query Format: site:<platform>.com "<tag>" "Call" OR "Text" OR "Phone" "<stateName>"
    return `${siteFilter} "${cleanTag}" "Call" OR "Text" OR "Phone" "${stateName}"`;
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
