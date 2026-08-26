const express = require('express');
const { pool } = require('../db');
const { STAGE_KEYS } = require('../lib/stages');

const router = express.Router({ mergeParams: true });

// PATCH /api/products/:id/stages/:stageKey
// Body: { completed: boolean, date?: 'YYYY-MM-DD', note?: string, owner_id?: number, updated_by?: string }
// note/owner_id always overwrite (not merge) — the modal always submits the
// full current state of the stage, including clearing either field.
router.patch('/:stageKey', async (req, res, next) => {
  try {
    const { id, stageKey } = req.params;
    if (!STAGE_KEYS.includes(stageKey)) {
      return res.status(400).json({ error: `stageKey must be one of: ${STAGE_KEYS.join(', ')}` });
    }

    const { completed, date, note, owner_id, updated_by } = req.body || {};
    const completedAt = completed === false ? null : date ? new Date(date) : new Date();

    const result = await pool.query(
      `INSERT INTO product_stages (product_id, stage_key, completed_at, note, owner_id, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (product_id, stage_key) DO UPDATE SET
         completed_at = EXCLUDED.completed_at, note = EXCLUDED.note,
         owner_id = EXCLUDED.owner_id, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING *`,
      [id, stageKey, completedAt, note || null, owner_id || null, updated_by || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Product or team member not found' });
    next(err);
  }
});

module.exports = router;
