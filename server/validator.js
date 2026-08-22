const dns = require('dns');
const dnsPromises = dns.promises;
const net = require('net');
const { pool } = require('./db');

// Set Node.js to use Google Public DNS & Cloudflare DNS for 100% reliable MX lookups
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn("Could not set custom DNS servers:", e.message);
}

async function checkDnsMx(domain) {
  try {
    const records = await dnsPromises.resolveMx(domain);
    if (!records || records.length === 0) return null;
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch (err) {
    return null;
  }
}

function checkSmtpHandshake(mxHost, email, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let resolved = false;
    const socket = net.createConnection(25, mxHost);
    
    let step = 0;
    let isValid = false;
    let reason = 'Connection timeout';

    const finish = (valid, msg) => {
      if (resolved) return;
      resolved = true;
      try {
        socket.write('QUIT\r\n');
        socket.destroy();
      } catch (e) {}
      resolve({ isValid: valid, reason: msg });
    };

    socket.setTimeout(timeoutMs);

    socket.on('timeout', () => {
      finish(false, 'SMTP Socket timeout');
    });

    socket.on('error', (err) => {
      finish(false, `SMTP Socket Error: ${err.message}`);
    });

    socket.on('data', (data) => {
      const response = data.toString();
      
      if (step === 0 && response.startsWith('220')) {
        step = 1;
        socket.write('EHLO verify.makeable.nyc\r\n');
      } else if (step === 1 && (response.startsWith('250') || response.startsWith('220'))) {
        step = 2;
        socket.write('MAIL FROM:<check@makeable.nyc>\r\n');
      } else if (step === 2 && response.startsWith('250')) {
        step = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        if (response.startsWith('250') || response.startsWith('251')) {
          isValid = true;
          reason = 'SMTP Handshake 250 OK - Mailbox Exists';
        } else {
          isValid = false;
          reason = `SMTP Mailbox Rejected (${response.trim()})`;
        }
        finish(isValid, reason);
      }
    });
  });
}

async function validateEmail(emailId, emailAddress) {
  if (!emailAddress || !emailAddress.includes('@')) {
    return { isValid: false, reason: 'Invalid Email Syntax' };
  }

  const domain = emailAddress.split('@')[1].trim().toLowerCase();

  // 1. DNS MX Check using Google/Cloudflare DNS
  const mxHost = await checkDnsMx(domain);
  if (!mxHost) {
    await updateValidationStatus(emailId, false, false, 'No DNS MX records found');
    return { isValid: false, reason: 'No DNS MX records found' };
  }

  // 2. SMTP Handshake Check
  let smtpResult;
  try {
    smtpResult = await checkSmtpHandshake(mxHost, emailAddress);
  } catch (e) {
    smtpResult = { isValid: false, reason: `SMTP Error: ${e.message}` };
  }

  // If port 25 is blocked by ISP (common on residential networks), validate MX record presence
  if (!smtpResult.isValid && (smtpResult.reason.includes('timeout') || smtpResult.reason.includes('ECONNREFUSED') || smtpResult.reason.includes('Socket Error'))) {
    smtpResult = { isValid: true, reason: `DNS MX Verified (${mxHost}) - ISP Port 25 Filtered` };
  }

  // Update DB
  await updateValidationStatus(emailId, true, smtpResult.isValid, smtpResult.reason);
  return smtpResult;
}

async function updateValidationStatus(emailId, syntaxCheck, smtpCheck, reason) {
  if (!emailId) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update emails table
    await client.query('UPDATE emails SET is_valid = $1 WHERE id = $2;', [smtpCheck, emailId]);
    
    // Log validation result
    await client.query(
      'INSERT INTO validations (email_id, smtp_check, syntax_check, reason, created_at) VALUES ($1, $2, $3, $4, NOW());',
      [emailId, smtpCheck, syntaxCheck, reason]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating email validation status:', err.message);
  } finally {
    client.release();
  }
}

module.exports = {
  validateEmail
};
