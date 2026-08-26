const express = require('express');
const { getTimelineData } = require('../lib/timelineData');

const router = express.Router();

// GET /api/timeline — every active product with its full stage-completion
// map, shaped for the grid.
router.get('/', async (req, res, next) => {
  try {
    res.json(await getTimelineData());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
