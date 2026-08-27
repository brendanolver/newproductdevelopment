const express = require('express');
const { pool } = require('../db');
const { getStages, getStageKeys, getStageDefaultOwners } = require('../lib/stages');

const router = express.Router();

// GET /api/stage-defaults — every stage, with its configured default owner
// (null if none set). Always returns every current stage, not just ones
// with a row, so the Admin table has something to render for each.
router.get('/', async (req, res, next) => {
  try {
    const stages = await getStages();
    const rows = await getStageDefaultOwners();
    const byStage = new Map(rows.map((r) => [r.stage_key, r]));
    const shaped = stages.map((s) => {
      const row = byStage.get(s.key);
      return { stage_key: s.key, label: s.label, owner_id: row ? row.owner_id : null, owner_name: row ? row.owner_name : null };
    });
    res.json(shaped);
  } catch (err) {
    next(err);
  }
});

// PUT /api/stage-defaults/:stageKey  Body: { owner_id: number|null }
router.put('/:stageKey', async (req, res, next) => {
  try {
    const { stageKey } = req.params;
    const stageKeys = await getStageKeys();
    if (!stageKeys.includes(stageKey)) {
      return res.status(400).json({ error: `stageKey must be one of: ${stageKeys.join(', ')}` });
    }
    const { owner_id } = req.body || {};
    const result = await pool.query(
      `INSERT INTO stage_default_owners (stage_key, owner_id)
       VALUES ($1, $2)
       ON CONFLICT (stage_key) DO UPDATE SET owner_id = EXCLUDED.owner_id, updated_at = now()
       RETURNING *`,
      [stageKey, owner_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
