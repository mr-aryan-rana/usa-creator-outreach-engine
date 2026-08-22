const path = require('path');
const dotenv = require('dotenv');
const { saveSerperLog } = require('./db');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function getSerperKey() {
  let key = process.env.SERPER_KEY;
  if (!key) {
    const envFile = path.join(__dirname, '..', '.env');
    if (require('fs').existsSync(envFile)) {
      const content = require('fs').readFileSync(envFile, 'utf8');
      content.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts[0] && parts[0].trim() === 'SERPER_KEY' && parts[1]) {
          key = parts[1].trim();
        }
      });
    }
  }
  return key ? key.trim() : '';
}

async function executeSerperSearch(queryText, numResults = 10) {
  const apiKey = getSerperKey();
  if (!apiKey) {
    throw new Error('SERPER_KEY is missing from .env file.');
  }

  const url = 'https://google.serper.dev/search';
  const headers = {
    'X-API-KEY': apiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  };

  // Primary Query Try
  let response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ q: queryText, num: numResults })
  });

  let data = await response.json();

  // If free account error 400, try clean fallback query without site: prefix
  if (response.status === 400 && data.message && data.message.includes('Query pattern')) {
    const fallbackQuery = queryText.replace(/^site:[^\s]+\s*/i, '').replace(/"/g, '');
    console.log(`[SERPER FALLBACK] Trying clean fallback query: ${fallbackQuery}`);
    
    response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ q: fallbackQuery, num: numResults })
    });
    data = await response.json();
  }

  if (response.status !== 200) {
    throw new Error(`Serper API Error ${response.status}: ${JSON.stringify(data)}`);
  }

  // Log query & raw response JSON in serper_logs database table
  await saveSerperLog(queryText, data.organic || []);

  const organic = data.organic || [];
  return {
    query: queryText,
    total_found: organic.length,
    organic: organic
  };
}

module.exports = {
  executeSerperSearch
};
