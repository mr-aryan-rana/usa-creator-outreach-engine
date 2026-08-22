const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');
const { pool, getActiveCampaigns } = require('./db');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // TLS
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Recursive Spintax Parser Helper: resolves {option1|option2|option3}
function parseSpintax(text) {
  if (!text) return '';
  let current = text;
  let prev = '';
  const regex = /\{([^{}]+)\}/g;
  
  // Loop until all innermost {a|b} spintax blocks are resolved
  let loopGuard = 0;
  while (current !== prev && loopGuard < 10) {
    prev = current;
    current = current.replace(regex, (match, contents) => {
      if (contents.includes('|')) {
        const options = contents.split('|');
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex].trim();
      }
      return contents;
    });
    loopGuard++;
  }
  return current;
}

function personalizeText(text, creatorName) {
  if (!text) return '';
  
  const nameStr = typeof creatorName === 'string' ? creatorName : (creatorName && typeof creatorName.name === 'string' ? creatorName.name : '');
  let firstName = 'Dear';
  if (nameStr && nameStr.trim()) {
    const parts = nameStr.trim().split(' ');
    const cleanName = parts[0].replace(/[^a-zA-Z]/g, '');
    if (cleanName && cleanName.length >= 2) {
      firstName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
    }
  }

  // 1. Replace {{First Name}}, {{Creator Name}}, {{Name}} variables
  let processed = text
    .replace(/\{\{\s*First Name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*Creator Name\s*\}\}/gi, creatorName || firstName)
    .replace(/\{\{\s*Name\s*\}\}/gi, firstName);

  // 2. Recursively resolve all {opt1|opt2} spintax blocks
  return parseSpintax(processed);
}

let currentCampaignIdx = 0;

async function sendOutreachEmail({ emailId, emailAddress, creatorName }) {
  if (!emailAddress || !emailAddress.includes('@')) {
    throw new Error(`Invalid recipient email address: ${emailAddress}`);
  }

  const cleanEmail = emailAddress.trim().toLowerCase();

  // STRICT PRE-SEND DEDUPLICATION GATEKEEPER: Prevent sending duplicate emails to the same email address
  const existingLog = await pool.query(
    `SELECT el.id 
     FROM email_logs el 
     JOIN emails e ON el.email_id = e.id 
     WHERE LOWER(e.address) = $1 AND el.status = 'SENT' 
     LIMIT 1;`,
    [cleanEmail]
  );

  if (existingLog.rows.length > 0) {
    console.log(`[OUTREACH DUP BLOCKED] ${cleanEmail} has already received an outreach email.`);
    return {
      success: false,
      skipped: true,
      reason: `Duplicate email blocked: ${cleanEmail} was already contacted.`
    };
  }

  const campaigns = await getActiveCampaigns();
  if (!campaigns || campaigns.length === 0) {
    throw new Error('No campaign templates found in database');
  }

  // Auto Template Rotation: Select next campaign round-robin
  const campaign = campaigns[currentCampaignIdx % campaigns.length];
  currentCampaignIdx++;

  const rawSubject = campaign.subject_template || 'Partnership Opportunity with MakeAble';
  const rawBody = campaign.body_template || 'Hello {{First Name}}, We would love to collaborate!';

  const finalSubject = personalizeText(rawSubject, creatorName);
  const finalBody = personalizeText(rawBody, creatorName);

  const mailOptions = {
    from: `"MakeAble Team" <${process.env.GMAIL_USER}>`,
    to: emailAddress,
    subject: finalSubject,
    text: finalBody
  };

  const info = await transporter.sendMail(mailOptions);

  // Log in email_logs
  await pool.query(
    'INSERT INTO email_logs (email_id, campaign_id, status, sent_at, created_at) VALUES ($1, $2, $3, NOW(), NOW());',
    [emailId, campaign.id, 'SENT']
  );

  return {
    success: true,
    messageId: info.messageId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    subject: finalSubject,
    bodySent: finalBody
  };
}

module.exports = {
  sendOutreachEmail,
  parseSpintax,
  personalizeText
};
