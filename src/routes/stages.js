const express = require('express');
const { pool } = require('../db');
const { STAGE_KEYS } = require('../lib/stages');

const router = express.Router({ mergeParams: true });

// PATCH /api/products/:id/stages/:stageKey
// Body: { completed: boolean, date?: 'YYYY-MM-DD', note?: string, updated_by?: string }
router.patch('/:stageKey', async (req, res, next) => {
  try {
    const { id, stageKey } = req.params;
    if (!STAGE_KEYS.includes(stageKey)) {
      return res.status(400).json({ error: `stageKey must be one of: ${STAGE_KEYS.join(', ')}` });
    }

    const { completed, date, note, updated_by } = req.body || {};

    if (completed === false) {
      // Clearing a stage: keep the row (for the note) but blank completed_at.
      const result = await pool.query(
        `INSERT INTO product_stages (product_id, stage_key, completed_at, note, updated_by)
         VALUES ($1, $2, NULL, $3, $4)
         ON CONFLICT (product_id, stage_key) DO UPDATE SET
           completed_at = NULL, note = COALESCE(EXCLUDED.note, product_stages.note),
           updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING *`,
        [id, stageKey, note || null, updated_by || null]
      );
      return res.json(result.rows[0]);
    }

    const completedAt = date ? new Date(date) : new Date();
    const result = await pool.query(
      `INSERT INTO product_stages (product_id, stage_key, completed_at, note, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (product_id, stage_key) DO UPDATE SET
         completed_at = EXCLUDED.completed_at, note = COALESCE(EXCLUDED.note, product_stages.note),
         updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING *`,
      [id, stageKey, completedAt, note || null, updated_by || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Product not found' });
    next(err);
  }
});

module.exports = router;
