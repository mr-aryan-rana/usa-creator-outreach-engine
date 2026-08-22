const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { getStats, getCreators, getSerperLogs, pool, getActiveCampaigns } = require('./db');
const { STATES, CATEGORIES, buildSearchQuery } = require('./us_states_and_tags');
const engine = require('./engine');

const app = express();
const PORT = process.env.PORT || 10000;

const ADMIN_USER = (process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASS = (process.env.ADMIN_PASSWORD || '').trim();
const SESSION_SECRET = (process.env.SECRET_KEY || process.env.SESSION_SECRET || 'makeable_secret_token').trim();

if (!ADMIN_USER || !ADMIN_PASS) {
  console.warn("SECURITY WARNING: ADMIN_USERNAME or ADMIN_PASSWORD is missing in .env file.");
}

app.use(cors());
app.use(express.json());

// Lightweight Cookie Parser Helper
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
  }
  return list;
}

// 0. Public Auth Endpoints
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(500).json({ success: false, error: 'Admin credentials are not configured in .env file.' });
  }
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.setHeader('Set-Cookie', `admin_session=${SESSION_SECRET}; Path=/; HttpOnly; SameSite=Lax`);
    return res.json({ success: true, message: 'Logged in successfully' });
  }
  return res.status(401).json({ success: false, error: 'Invalid Admin ID or Password' });
});

app.get('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  res.redirect('/login.html');
});

// Authentication Gatekeeper Middleware
app.use((req, res, next) => {
  if (req.path === '/login.html' || req.path === '/api/login' || req.path === '/api/logout') {
    return next();
  }

  const cookies = parseCookies(req);
  if (cookies.admin_session === SESSION_SECRET) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized access. Please log in first.' });
  }

  res.redirect('/login.html');
});

// 1. System Statistics API
app.get('/api/stats', async (req, res) => {
  try {
    const dbStats = await getStats();
    const engineStatus = engine.getStatus();
    res.json({ ...dbStats, engine: engineStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Creators API (Sorted by newest first)
app.get('/api/creators', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '20');
    const search = req.query.search;
    const platform = req.query.platform;
    const location = req.query.location;
    const contact_type = req.query.contact_type;

    const data = await getCreators({ page, limit, search, platform, location, contact_type });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. States & Categories Metadata API
app.get('/api/states', (req, res) => {
  res.json({ states: STATES, count: STATES.length });
});

app.get('/api/categories', (req, res) => {
  res.json({ categories: CATEGORIES, count: CATEGORIES.length });
});

// 4. Campaign Templates API
app.get('/api/campaigns', async (req, res) => {
  try {
    const campaigns = await getActiveCampaigns();
    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Engine Start & Stop Controls API
app.post('/api/engine/start', async (req, res) => {
  try {
    engine.start();
    res.json({ success: true, status: engine.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/engine/stop', async (req, res) => {
  try {
    await engine.stop();
    res.json({ success: true, status: engine.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Real-time Live Log & Status SSE Stream API
app.get('/api/engine/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const onLog = (eventPayload) => {
    res.write(`data: ${JSON.stringify({ type: 'log', payload: eventPayload })}\n\n`);
  };

  const onTick = (tickPayload) => {
    res.write(`data: ${JSON.stringify({ type: 'tick', payload: tickPayload })}\n\n`);
  };

  engine.on('log', onLog);
  engine.on('tick', onTick);

  // Send initial state
  res.write(`data: ${JSON.stringify({ type: 'init', status: engine.getStatus() })}\n\n`);

  req.on('close', () => {
    engine.off('log', onLog);
    engine.off('tick', onTick);
  });
});

// 7. Export Creators to CSV
app.get('/api/export/csv', async (req, res) => {
  try {
    const search = req.query.search;
    const platform = req.query.platform;
    const location = req.query.location;
    const contact_type = req.query.contact_type;

    const data = await getCreators({ page: 1, limit: 10000, search, platform, location, contact_type });
    const items = data.items;

    let csvContent = 'ID,Name,Platform,Profile URL,Email Address,Phone,Location,Created At\n';
    items.forEach(item => {
      const row = [
        item.id,
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${item.platform || ''}"`,
        `"${item.profile_url || ''}"`,
        `"${item.email_address || ''}"`,
        `"${item.phone || ''}"`,
        `"${(item.location || '').replace(/"/g, '""')}"`,
        `"${item.created_at || ''}"`
      ].join(',');
      csvContent += row + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=usa_creators_export.csv');
    res.send(csvContent);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static frontend files if client is built
const clientBuildDir = path.join(__dirname, '..', 'client', 'dist');
if (require('fs').existsSync(clientBuildDir)) {
  app.use(express.static(clientBuildDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildDir, 'index.html'));
  });
} else {
  // Fallback to static directory
  const staticDir = path.join(__dirname, '..', 'static');
  if (require('fs').existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }
}

// 8. Serper Query & Response History API
app.get('/api/serper/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '20');
    const data = await getSerperLogs({ page, limit });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  USA Creator Finder & Outreach Engine Node.js Server`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`====================================================`);
});
