const express = require('express');
const { sendWeeklyOutstandingEmail } = require('../lib/emailService');

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

module.exports = router;
