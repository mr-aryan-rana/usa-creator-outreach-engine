const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("CRITICAL: DATABASE_URL / DIRECT_URL is missing in .env");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}

// Helper DB Methods
async function getStats() {
  const creatorsCount = await pool.query("SELECT COUNT(*) FROM creators;");
  const emailsCount = await pool.query("SELECT COUNT(*) FROM emails;");
  const validEmailsCount = await pool.query("SELECT COUNT(*) FROM emails WHERE is_valid = TRUE;");
  const serperLogsCount = await pool.query("SELECT COUNT(*) FROM serper_logs;");
  const sentEmailsCount = await pool.query("SELECT COUNT(*) FROM email_logs WHERE status = 'SENT';");

  return {
    total_creators: parseInt(creatorsCount.rows[0].count),
    total_emails: parseInt(emailsCount.rows[0].count),
    valid_emails: parseInt(validEmailsCount.rows[0].count),
    serper_queries: parseInt(serperLogsCount.rows[0].count),
    sent_emails: parseInt(sentEmailsCount.rows[0].count)
  };
}

async function getTodayStats() {
  try {
    const serperToday = await pool.query("SELECT COUNT(*) FROM serper_logs WHERE created_at >= CURRENT_DATE;");
    const emailsToday = await pool.query("SELECT COUNT(*) FROM email_logs WHERE status = 'SENT' AND (sent_at >= CURRENT_DATE OR created_at >= CURRENT_DATE);");
    return {
      serperToday: parseInt(serperToday.rows[0].count),
      emailsToday: parseInt(emailsToday.rows[0].count)
    };
  } catch (err) {
    console.error("Error fetching today stats:", err.message);
    return { serperToday: 0, emailsToday: 0 };
  }
}

async function hasQueryBeenExecutedToday(queryText) {
  try {
    const res = await pool.query(
      "SELECT 1 FROM serper_logs WHERE query = $1 AND created_at >= CURRENT_DATE LIMIT 1;",
      [queryText]
    );
    return res.rows.length > 0;
  } catch (err) {
    return false;
  }
}

async function getCreators({ page = 1, limit = 20, search = '', platform = '', location = '', contact_type = '' }) {
  const offset = (page - 1) * limit;
  const whereClauses = [];
  const params = [];
  let paramIdx = 1;

  if (search) {
    whereClauses.push(`(c.name ILIKE $${paramIdx} OR c.profile_url ILIKE $${paramIdx} OR e.address ILIKE $${paramIdx} OR c.location ILIKE $${paramIdx} OR c.phone ILIKE $${paramIdx})`);
    params.push(`%${search.trim()}%`);
    paramIdx++;
  }

  if (platform && platform.toLowerCase() !== 'all') {
    whereClauses.push(`c.platform ILIKE $${paramIdx}`);
    params.push(platform.trim());
    paramIdx++;
  }

  if (location && location.toLowerCase() !== 'all') {
    whereClauses.push(`c.location ILIKE $${paramIdx}`);
    params.push(`%${location.trim()}%`);
    paramIdx++;
  }

  if (contact_type === 'email') {
    whereClauses.push(`e.address IS NOT NULL AND e.address != '' AND e.address LIKE '%@%' AND LOWER(e.address) != 'gmail.com'`);
  } else if (contact_type === 'phone') {
    whereClauses.push(`c.phone IS NOT NULL AND c.phone != ''`);
  } else if (contact_type === 'both') {
    whereClauses.push(`e.address IS NOT NULL AND e.address != '' AND e.address LIKE '%@%' AND LOWER(e.address) != 'gmail.com' AND c.phone IS NOT NULL AND c.phone != ''`);
  }

  const whereSql = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';

  const countQuery = `
    SELECT COUNT(DISTINCT c.id) 
    FROM creators c 
    LEFT JOIN emails e ON c.id = e.creator_id
    ${whereSql};
  `;
  const countRes = await pool.query(countQuery, params);
  const totalCount = parseInt(countRes.rows[0].count);

  // ORDER BY c.id DESC to ensure NEW DATA IS AT THE TOP (Row #1)
  const itemsQuery = `
    SELECT 
      c.id,
      c.name,
      c.platform,
      c.profile_url,
      c.phone,
      c.location,
      c.created_at,
      e.id as email_id,
      e.address as email_address,
      e.is_valid as email_is_valid,
      e.is_approved as email_is_approved
    FROM creators c
    LEFT JOIN emails e ON c.id = e.creator_id
    ${whereSql}
    ORDER BY c.id DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1};
  `;

  const itemsRes = await pool.query(itemsQuery, [...params, limit, offset]);

  return {
    items: itemsRes.rows,
    total: totalCount,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages: Math.ceil(totalCount / limit) || 1
  };
}

async function insertCreator({ name, platform, profile_url, phone, location, email }) {
  const hasEmail = email && typeof email === 'string' && email.includes('@') && email.trim().toLowerCase() !== 'gmail.com';

  // STRICT GATEKEEPER: Reject DB insertion if email is missing, null, or invalid
  if (!hasEmail) {
    return { creator_id: null, email_id: null, is_new_email: false, skipped: true };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Deduplicate by profile_url or name+platform
    let creatorId;
    const existingCreator = await client.query(
      'SELECT id FROM creators WHERE profile_url = $1 OR (name = $2 AND platform = $3) LIMIT 1;',
      [profile_url, name, platform]
    );

    if (existingCreator.rows.length > 0) {
      creatorId = existingCreator.rows[0].id;
    } else {
      const newCreator = await client.query(
        `INSERT INTO creators (name, platform, profile_url, phone, location, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id;`,
        [name, platform, profile_url, phone, location]
      );
      creatorId = newCreator.rows[0].id;
    }

    let isNewEmail = false;
    let emailId = null;

    if (email && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      const existingEmail = await client.query('SELECT id FROM emails WHERE address = $1 LIMIT 1;', [cleanEmail]);
      if (existingEmail.rows.length === 0) {
        const newEmail = await client.query(
          `INSERT INTO emails (address, creator_id, is_valid, created_at, is_approved, unsubscribed)
           VALUES ($1, $2, FALSE, NOW(), TRUE, FALSE)
           RETURNING id;`,
          [cleanEmail, creatorId]
        );
        emailId = newEmail.rows[0].id;
        isNewEmail = true;
      } else {
        emailId = existingEmail.rows[0].id;
        await client.query('UPDATE emails SET creator_id = $1 WHERE id = $2 AND creator_id IS NULL;', [creatorId, emailId]);
      }
    }

    await client.query('COMMIT');
    return { creator_id: creatorId, email_id: emailId, is_new_email: isNewEmail };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function saveSerperLog(queryText, responseData) {
  try {
    const jsonStr = typeof responseData === 'object' ? JSON.stringify(responseData) : (responseData || '[]');
    await pool.query('INSERT INTO serper_logs (query, response_json, created_at) VALUES ($1, $2, NOW());', [queryText, jsonStr]);
  } catch (err) {
    console.error('Error logging serper query:', err.message);
  }
}

async function getSerperLogs({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const countRes = await pool.query('SELECT COUNT(*) FROM serper_logs;');
  const totalCount = parseInt(countRes.rows[0].count);

  const itemsRes = await pool.query(
    'SELECT id, query, response_json, created_at FROM serper_logs ORDER BY id DESC LIMIT $1 OFFSET $2;',
    [limit, offset]
  );

  return {
    items: itemsRes.rows,
    total: totalCount,
    page: parseInt(page),
    limit: parseInt(limit),
    total_pages: Math.ceil(totalCount / limit) || 1
  };
}

async function getActiveCampaigns() {
  const res = await pool.query('SELECT id, name, subject_template, body_template FROM campaigns ORDER BY id ASC;');
  return res.rows;
}

module.exports = {
  pool,
  query,
  getStats,
  getTodayStats,
  hasQueryBeenExecutedToday,
  getCreators,
  insertCreator,
  saveSerperLog,
  getSerperLogs,
  getActiveCampaigns
};
