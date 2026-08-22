const EventEmitter = require('events');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { STATES, CATEGORIES, buildSearchQuery } = require('./us_states_and_tags');
const { executeSerperSearch } = require('./serper');
const { extractCreatorsFromSearch } = require('./openai');
const { insertCreator, pool, getTodayStats, hasQueryBeenExecutedToday } = require('./db');
const { validateEmail } = require('./validator');
const { sendOutreachEmail } = require('./outreach');

class AutomationEngine extends EventEmitter {
  constructor() {
    super();
    this.state = 'STOPPED'; // 'STOPPED', 'RUNNING', 'AUTO_RESTING'
    this.mode = 'email'; // 'email' or 'phone_only'
    this.serperCreditsUsedToday = 0;
    this.emailsSentToday = 0;
    this.emailsSentInBatch = 0;
    this.maxSerperCreditsPerDay = parseInt(process.env.SERPER_DAILY_CREDIT_LIMIT || '150');
    this.maxEmailsPerDay = parseInt(process.env.EMAIL_DAILY_LIMIT || process.env.MAX_EMAILS_PER_DAY || '500');
    this.batchSizeLimit = parseInt(process.env.BATCH_SIZE_LIMIT || '30'); // Take 15-20 min pause after 30 emails
    
    // Random initial offsets so every start/restart begins at a fresh query
    this.currentPlatformIdx = Math.floor(Math.random() * 3);
    this.currentStateIdx = Math.floor(Math.random() * STATES.length);
    this.currentCategoryIdx = Math.floor(Math.random() * CATEGORIES.length);

    this.platforms = ['instagram', 'facebook', 'tiktok'];
    this.loopPromise = null;
    this.restTimerTimeout = null;
    this.restSecondsRemaining = 0;

    // Async load today's DB counts
    this.refreshTodayStats();
  }

  async refreshTodayStats() {
    try {
      const stats = await getTodayStats();
      this.serperCreditsUsedToday = stats.serperToday;
      this.emailsSentToday = stats.emailsToday;
    } catch (e) {}
  }

  log(message, type = 'info', data = {}) {
    const timestamp = new Date().toISOString();
    const eventPayload = { timestamp, message, type, data, engineState: this.getStatus() };
    console.log(`[ENGINE ${type.toUpperCase()}] ${message}`);
    this.emit('log', eventPayload);
  }

  getMaxSerperCredits() {
    if (this.mode === 'phone_only') {
      return parseInt(process.env.PHONE_MODE_SERPER_LIMIT || '50');
    }
    return parseInt(process.env.EMAIL_MODE_SERPER_LIMIT || '100');
  }

  getStatus() {
    const maxSerper = this.getMaxSerperCredits();
    return {
      state: this.state,
      mode: this.mode,
      serperCreditsUsedToday: this.serperCreditsUsedToday,
      emailsSentToday: this.emailsSentToday,
      emailsSentInBatch: this.emailsSentInBatch,
      restSecondsRemaining: this.restSecondsRemaining,
      maxSerperCreditsPerDay: maxSerper,
      maxEmailsPerDay: parseInt(process.env.EMAIL_DAILY_LIMIT || '200')
    };
  }

  async start(options = {}) {
    await this.refreshTodayStats();

    if (options.mode && (options.mode === 'email' || options.mode === 'phone_only')) {
      this.mode = options.mode;
    }

    if (this.state === 'RUNNING') {
      this.log('Engine is already running', 'warn');
      return;
    }

    if (this.state === 'AUTO_RESTING') {
      this.log('Ending auto-rest early and resuming engine...', 'info');
      if (this.restTimerTimeout) clearTimeout(this.restTimerTimeout);
    }

    // Pick a fresh random starting offset on every start action
    this.currentPlatformIdx = Math.floor(Math.random() * this.platforms.length);
    this.currentStateIdx = Math.floor(Math.random() * STATES.length);
    this.currentCategoryIdx = Math.floor(Math.random() * CATEGORIES.length);

    this.state = 'RUNNING';
    const limit = this.getMaxSerperCredits();
    this.log(`Automation Engine STARTED in [${this.mode.toUpperCase()}] mode (Credit Limit: ${limit}/day)`, 'success');
    this.loopPromise = this.runLoop();
  }

  async stop() {
    this.state = 'STOPPED';
    if (this.restTimerTimeout) clearTimeout(this.restTimerTimeout);
    this.restSecondsRemaining = 0;
    this.log('Automation Engine STOPPED manually', 'warn');
  }

  async runLoop() {
    while (this.state === 'RUNNING') {
      try {
        // 1. Quotas Verification
        const maxSerperLimit = this.getMaxSerperCredits();
        if (this.serperCreditsUsedToday >= maxSerperLimit) {
          this.log(`Daily Serper credit limit reached for [${this.mode.toUpperCase()}] mode (${maxSerperLimit}). Pausing engine for today.`, 'warn');
          this.state = 'STOPPED';
          break;
        }

        if (this.mode === 'email' && this.emailsSentToday >= this.maxEmailsPerDay) {
          this.log(`Daily Email limit reached (${this.maxEmailsPerDay}). Pausing engine for today.`, 'warn');
          this.state = 'STOPPED';
          break;
        }

        // 2. Prepare next rotation parameters (Strict Round-Robin: Instagram -> Facebook -> TikTok)
        const platform = this.platforms[this.currentPlatformIdx % this.platforms.length];
        const stateObj = STATES[this.currentStateIdx % STATES.length] || STATES[0];
        const categoryObj = CATEGORIES[this.currentCategoryIdx % CATEGORIES.length] || CATEGORIES[0];

        // Rotate platform on EVERY single search credit (1 Instagram -> 1 Facebook -> 1 TikTok)
        this.currentPlatformIdx++;
        if (this.currentPlatformIdx % this.platforms.length === 0) {
          this.currentCategoryIdx++;
          if (this.currentCategoryIdx % CATEGORIES.length === 0) {
            this.currentStateIdx++;
          }
        }

        // Optimized query format depending on mode
        const queryText = buildSearchQuery({
          platform: platform,
          stateCode: stateObj.code,
          tag: categoryObj.primary_tag,
          mode: this.mode
        });

        // Anti-Duplication Check: Skip query if executed earlier today
        const isDup = await hasQueryBeenExecutedToday(queryText);
        if (isDup) {
          this.log(`Query "${queryText}" was already executed today. Skipping to next parameter set to save credits...`, 'info');
          await this.sleep(500);
          continue;
        }

        this.log(`Executing 1 Serper Search Credit [Mode: ${this.mode.toUpperCase()}]: [Query: ${queryText}]`, 'action');

        // 3. Execute 1 Serper Search
        const searchResult = await executeSerperSearch(queryText, 20);
        this.serperCreditsUsedToday++;
        this.log(`Serper returned ${searchResult.total_found} raw organic results (Credits Used Today: ${this.serperCreditsUsedToday}/${this.maxSerperCreditsPerDay})`, 'success');
        this.log(`[RAW SERPER DATA JSON]:\n${JSON.stringify(searchResult.organic || [], null, 2)}`, 'info');

        if (this.state !== 'RUNNING') break;

        // Pre-filter organic results to retain social profiles or snippets with email/phone
        const isPhoneOnlyMode = this.mode === 'phone_only';
        const relevantOrganic = (searchResult.organic || []).filter(item => {
          const link = (item.link || '').toLowerCase();
          const snippet = (item.snippet || '').toLowerCase();
          const title = (item.title || '').toLowerCase();
          const isSocial = link.includes('facebook.com') || link.includes('instagram.com') || link.includes('tiktok.com') || link.includes('youtube.com');
          const hasEmail = snippet.includes('@') || title.includes('@');
          const hasPhone = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(`${title} ${snippet}`);
          return isSocial || hasEmail || (isPhoneOnlyMode && hasPhone);
        });

        if (relevantOrganic.length === 0) {
          this.log(`No relevant profiles or contacts found in raw results for "${queryText}". Moving to next platform...`, 'info');
          await this.sleep(1000);
          continue;
        }

        // 4. OpenAI GPT Filter & Extractor
        this.log(`Submitting ${relevantOrganic.length} relevant organic snippets to OpenAI GPT-4o-mini [Mode: ${this.mode.toUpperCase()}]...`, 'action');
        const extractedCreators = await extractCreatorsFromSearch({
          organic: relevantOrganic,
          platform: platform,
          targetState: stateObj.name,
          mode: this.mode
        });

        this.log(`OpenAI extracted ${extractedCreators.length} valid creators matching filter.`, 'success');
        this.log(`[GPT RESPONSE JSON]:\n${JSON.stringify(extractedCreators || [], null, 2)}`, 'info');

        // 5. Insert creators into PostgreSQL live
        const newEmailsToValidate = [];
        for (const creator of extractedCreators) {
          try {
            if (this.mode === 'email') {
              if (!creator.email || typeof creator.email !== 'string' || !creator.email.includes('@') || creator.email.trim().toLowerCase() === 'gmail.com') {
                this.log(`Skipping creator (${creator.name}): No valid email address found.`, 'info');
                continue;
              }
            } else if (this.mode === 'phone_only') {
              if ((!creator.phone || creator.phone.trim().length < 7) && (!creator.email || !creator.email.includes('@'))) {
                this.log(`Skipping creator (${creator.name}): No phone number or contact info found.`, 'info');
                continue;
              }
            }

            const saved = await insertCreator({
              name: creator.name,
              platform: creator.platform || platform,
              profile_url: creator.profile_url,
              phone: creator.phone,
              location: creator.location || stateObj.name,
              email: creator.email,
              allow_phone_only: (this.mode === 'phone_only')
            });

            if (saved.is_new_email && saved.email_id) {
              newEmailsToValidate.push({ id: saved.email_id, address: creator.email, name: creator.name });
            }
          } catch (e) {
            this.log(`Error inserting creator (${creator.name}): ${e.message}`, 'error');
          }
        }

        this.log(`Saved ${extractedCreators.length} creators to PostgreSQL live.`, 'success');

        if (this.state !== 'RUNNING') break;

        // 6. Real-time DNS MX + SMTP Socket Handshake Email Validation (Only in email mode)
        if (this.mode === 'email' && newEmailsToValidate.length > 0) {
          this.log(`Running real-time DNS MX & SMTP Handshake Validation on ${newEmailsToValidate.length} new email addresses...`, 'action');
          for (const item of newEmailsToValidate) {
            const valRes = await validateEmail(item.id, item.address);
            this.log(`SMTP Validation [${item.address}]: ${valRes.isValid ? 'VALID (250 OK)' : 'INVALID'} - ${valRes.reason}`, valRes.isValid ? 'success' : 'warn');
          }
        }

        if (this.state !== 'RUNNING') break;

        // 7. Process Outreach Email Sending (Only in email mode)
        if (this.mode === 'email') {
          await this.processOutreachQueue();
        } else {
          this.log(`Phone-Only Collector Mode Active: Phone contacts saved to database. Email sending skipped.`, 'info');
        }

      } catch (err) {
        this.log(`Engine Loop Error: ${err.message}`, 'error');
        // Wait 10s before retry on error
        await this.sleep(10000);
      }
    }
  }

  async processOutreachQueue() {
    // Fetch valid, approved, uncontacted unique email addresses from DB
    const query = `
      SELECT DISTINCT ON (LOWER(e.address)) 
        e.id as email_id, 
        e.address as email_address, 
        c.name as creator_name
      FROM emails e
      JOIN creators c ON e.creator_id = c.id
      WHERE e.is_valid = TRUE
        AND e.is_approved = TRUE
        AND e.unsubscribed = FALSE
        AND LOWER(e.address) NOT IN (
          SELECT DISTINCT LOWER(e2.address)
          FROM emails e2
          JOIN email_logs el2 ON e2.id = el2.email_id
          WHERE el2.status = 'SENT'
        )
      ORDER BY LOWER(e.address), e.id ASC
      LIMIT 10;
    `;

    const res = await pool.query(query);
    const queue = res.rows;

    if (queue.length === 0) {
      this.log('No pending verified emails in outreach queue right now. Proceeding to next search iteration.', 'info');
      await this.sleep(3000);
      return;
    }

    this.log(`Found ${queue.length} verified emails ready for outreach.`, 'info');

    for (const item of queue) {
      if (this.state !== 'RUNNING') break;

      if (this.emailsSentToday >= this.maxEmailsPerDay) {
        this.log(`Daily email outreach limit (${this.maxEmailsPerDay}) reached.`, 'warn');
        this.state = 'STOPPED';
        break;
      }

      // Check if we hit the batch limit (30 emails sent)
      if (this.emailsSentInBatch >= this.batchSizeLimit) {
        await this.startAutoRestPause();
        if (this.state !== 'RUNNING') break;
      }

      try {
        this.log(`Sending outreach email to ${item.email_address} (${item.creator_name})...`, 'action');
        const outreachRes = await sendOutreachEmail({
          emailId: item.email_id,
          emailAddress: item.email_address,
          creatorName: item.creator_name
        });

        if (outreachRes && outreachRes.skipped) {
          this.log(`[DUP BLOCKED] ${item.email_address}: ${outreachRes.reason}`, 'info');
          continue;
        }

        this.emailsSentToday++;
        this.emailsSentInBatch++;

        this.log(`Email Sent Successfully to ${item.email_address} using Template ID ${outreachRes.campaignId} ("${outreachRes.subject}"). Batch Progress: ${this.emailsSentInBatch}/${this.batchSizeLimit} | Total Today: ${this.emailsSentToday}/${this.maxEmailsPerDay}`, 'success');

        // Check again after sending if we reached batch 30 limit
        if (this.emailsSentInBatch >= this.batchSizeLimit) {
          await this.startAutoRestPause();
          if (this.state !== 'RUNNING') break;
        } else {
          // Delay between individual emails: Random 30 to 60 seconds
          const delaySec = Math.floor(Math.random() * 31) + 30; // 30-60 sec
          this.log(`Waiting ${delaySec} seconds before sending next email...`, 'info');
          await this.sleep(delaySec * 1000);
        }

      } catch (err) {
        this.log(`Failed to send email to ${item.email_address}: ${err.message}`, 'error');
        await this.sleep(5000);
      }
    }
  }

  async startAutoRestPause() {
    this.state = 'AUTO_RESTING';
    this.emailsSentInBatch = 0; // Reset batch counter

    // Random rest pause between 15 to 20 minutes (900 to 1200 seconds)
    const restSeconds = Math.floor(Math.random() * 301) + 900; // 900-1200s (15-20m)
    this.restSecondsRemaining = restSeconds;

    const minutes = Math.floor(restSeconds / 60);
    this.log(`AUTOMATED REST PAUSE STARTED: Sent 30 emails batch. Resting for ${minutes} minutes (${restSeconds} seconds) to maintain sender reputation. System will AUTOMATICALLY RESUME after break.`, 'warn');

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.state !== 'AUTO_RESTING') {
          clearInterval(interval);
          resolve();
          return;
        }

        this.restSecondsRemaining--;
        this.emit('tick', { restSecondsRemaining: this.restSecondsRemaining });

        if (this.restSecondsRemaining <= 0) {
          clearInterval(interval);
          this.log('AUTOMATED REST PAUSE COMPLETED! Auto-resuming engine loop now...', 'success');
          this.state = 'RUNNING';
          resolve();
        }
      }, 1000);
    });
  }

  sleep(ms) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, ms);

      // Allow cancelling sleep when engine is stopped manually
      const checkInterval = setInterval(() => {
        if (this.state === 'STOPPED') {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        }
      }, 500);
    });
  }
}

const engine = new AutomationEngine();
module.exports = engine;
