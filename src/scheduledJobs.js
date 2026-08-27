/**
 * src/scheduledJobs.js
 *
 * Lightweight scheduler for recurring background tasks — setInterval with
 * timezone-aware time checking, no external dependencies. Same pattern as
 * WNDRR WMS's backend/src/scheduledJobs.js.
 *
 * Jobs:
 *   - Weekly "outstanding styles" email, Australia/Sydney time — day/hour
 *     configurable from Admin, stored in weekly_email_schedule (see
 *     src/lib/emailSchedule.js). Defaults to Mondays at 8:00 AM.
 */

const { getEmailSchedule } = require('./lib/emailSchedule');

const TZ = 'Australia/Sydney';
const CHECK_INTERVAL_MS = 60_000; // check every 60 seconds

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

  console.log(`[scheduler] Started — weekly outstanding-styles email schedule is configurable from Admin (${TZ})`);

  setInterval(async () => {
    const { day, hour, minute, dateKey } = getSydneyParts();

    let schedule;
    try {
      schedule = await getEmailSchedule();
    } catch (err) {
      console.error('[scheduler] Failed to load email schedule:', err.message);
      return;
    }

    if (
      day === schedule.weekday &&
      hour === schedule.hour &&
      minute === schedule.minute &&
      lastRun['weekly-email'] !== dateKey
    ) {
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
