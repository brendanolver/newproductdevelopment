const { pool } = require('../db');

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function getEmailSchedule() {
  const result = await pool.query('SELECT weekday, hour, minute FROM weekly_email_schedule WHERE id = 1');
  return result.rows[0];
}

async function updateEmailSchedule({ weekday, hour, minute }) {
  const result = await pool.query(
    `UPDATE weekly_email_schedule SET weekday = $1, hour = $2, minute = $3, updated_at = now()
     WHERE id = 1 RETURNING weekday, hour, minute`,
    [weekday, hour, minute]
  );
  return result.rows[0];
}

function formatSchedule({ weekday, hour, minute }) {
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${WEEKDAY_NAMES[weekday]}s at ${h}:${m} AEST`;
}

module.exports = { getEmailSchedule, updateEmailSchedule, formatSchedule, WEEKDAY_NAMES };
