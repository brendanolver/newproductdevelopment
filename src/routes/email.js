const express = require('express');
const { sendWeeklyOutstandingEmail } = require('../lib/emailService');
const { getEmailSchedule, updateEmailSchedule } = require('../lib/emailSchedule');

const router = express.Router();

// Manual trigger — lets you test the weekly email without waiting for Monday.
router.post('/send-weekly', async (req, res, next) => {
  try {
    const result = await sendWeeklyOutstandingEmail();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/schedule', async (req, res, next) => {
  try {
    res.json(await getEmailSchedule());
  } catch (err) {
    next(err);
  }
});

// PUT /api/email/schedule  Body: { weekday: 0-6, hour: 0-23, minute: 0-59 }
router.put('/schedule', async (req, res, next) => {
  try {
    const { weekday, hour, minute } = req.body || {};
    if (![weekday, hour, minute].every(Number.isInteger)) {
      return res.status(400).json({ error: 'weekday, hour, and minute must all be integers' });
    }
    if (weekday < 0 || weekday > 6) return res.status(400).json({ error: 'weekday must be 0-6' });
    if (hour < 0 || hour > 23) return res.status(400).json({ error: 'hour must be 0-23' });
    if (minute < 0 || minute > 59) return res.status(400).json({ error: 'minute must be 0-59' });

    res.json(await updateEmailSchedule({ weekday, hour, minute }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
