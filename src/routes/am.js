const express = require('express');
const { syncFromAM, getSyncStatus } = require('../lib/amSync');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(getSyncStatus());
});

router.post('/sync', async (req, res, next) => {
  try {
    const result = await syncFromAM();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
