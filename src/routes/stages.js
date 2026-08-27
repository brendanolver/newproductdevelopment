const express = require('express');
const { pool } = require('../db');
const { getStageKeys } = require('../lib/stages');

const router = express.Router({ mergeParams: true });

// PATCH /api/products/:id/stages/:stageKey
// Body: { completed: boolean, date?: 'YYYY-MM-DD', note?: string, owner_id?: number, updated_by?: string }
// note/owner_id always overwrite (not merge) — the modal always submits the
// full current state of the stage, including clearing either field.
router.patch('/:stageKey', async (req, res, next) => {
  try {
    const { id, stageKey } = req.params;
    const stageKeys = await getStageKeys();
    if (!stageKeys.includes(stageKey)) {
      return res.status(400).json({ error: `stageKey must be one of: ${stageKeys.join(', ')}` });
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

    // Auto-archive once every current milestone is done — only fires the
    // moment the last one is checked off (never un-archives on uncheck).
    let autoArchived = false;
    if (completedAt) {
      const doneResult = await pool.query(
        `SELECT stage_key FROM product_stages WHERE product_id = $1 AND completed_at IS NOT NULL`,
        [id]
      );
      const doneKeys = new Set(doneResult.rows.map((r) => r.stage_key));
      const allDone = stageKeys.every((k) => doneKeys.has(k));
      if (allDone) {
        const archiveResult = await pool.query(
          `UPDATE products SET archived = true, updated_at = now() WHERE id = $1 AND archived = false`,
          [id]
        );
        autoArchived = archiveResult.rowCount > 0;
      }
    }

    res.json({ ...result.rows[0], product_auto_archived: autoArchived });
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Product or team member not found' });
    next(err);
  }
});

module.exports = router;
