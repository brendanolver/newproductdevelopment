/**
 * src/scheduledJobs.js
 *
 * Lightweight scheduler for recurring background tasks — setInterval with
 * timezone-aware time checking, no external dependencies. Same pattern as
 * WNDRR WMS's backend/src/scheduledJobs.js.
 *
 * Jobs:
 *   - Weekly "outstanding styles" email, Mondays at 8:00 AM AEST (Australia/Sydney)
 */

const TZ = 'Australia/Sydney';
const CHECK_INTERVAL_MS = 60_000; // check every 60 seconds

const EMAIL_WEEKDAY = 1; // Monday (0 = Sunday)
const EMAIL_HOUR = 8;
const EMAIL_MINUTE = 0;

function getSydneyParts() {
  const now = new Date();
  const sydneyTime = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  return {
    day: sydneyTime.getDay(),
    hour: sydneyTime.getHours(),
    minute: sydneyTime.getMinutes(),
    dateKey: `${sydneyTime.getFullYear()}-${String(sydneyTime.getMonth() + 1).padStart(2, '0')}-${String(sydneyTime.getDate()).padStart(2, '0')}`,
  };
}

function startScheduledJobs() {
  const lastRun = {};

  console.log(`[scheduler] Started — weekly outstanding-styles email Mondays at ${EMAIL_HOUR}:00 ${TZ}`);

  setInterval(async () => {
    const { day, hour, minute, dateKey } = getSydneyParts();

    if (day === EMAIL_WEEKDAY && hour === EMAIL_HOUR && minute === EMAIL_MINUTE && lastRun['weekly-email'] !== dateKey) {
      lastRun['weekly-email'] = dateKey;
      console.log('[scheduler] Sending weekly outstanding-styles email...');
      try {
        const { sendWeeklyOutstandingEmail } = require('./lib/emailService');
        const result = await sendWeeklyOutstandingEmail();
        console.log(`[scheduler] Weekly email sent to ${result.recipients.join(', ')} (${result.outstandingCount} outstanding, ${result.atRiskCount} at risk)`);
      } catch (err) {
        console.error('[scheduler] Weekly email failed:', err.message);
      }
    }
  }, CHECK_INTERVAL_MS);
}

module.exports = { startScheduledJobs };
