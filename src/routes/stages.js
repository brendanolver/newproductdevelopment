const express = require('express');
const { pool } = require('../db');
const { getStageKeys, isProductFullyDone } = require('../lib/stages');

const router = express.Router({ mergeParams: true });

// PATCH /api/products/:id/stages/:stageKey
// Body: { completed: boolean, date?: 'YYYY-MM-DD', note?: string, owner_id?: number, updated_by?: string, not_applicable?: boolean, due_date?: 'YYYY-MM-DD' }
// note/owner_id always overwrite (not merge) — the modal always submits the
// full current state of the stage, including clearing either field.
// not_applicable is a tri-state override (see product_stages schema
// comment) and — like every other field here — always overwrites: sending
// true/false sets an explicit override, omitting it resets to null (defer
// to the milestone's category default for this product's launch_type).
// due_date is independent of completed_at — a planned/target date for
// date-type stages, settable before the stage is actually done.
router.patch('/:stageKey', async (req, res, next) => {
  try {
    const { id, stageKey } = req.params;
    const stageKeys = await getStageKeys();
    if (!stageKeys.includes(stageKey)) {
      return res.status(400).json({ error: `stageKey must be one of: ${stageKeys.join(', ')}` });
    }

    const { completed, date, note, owner_id, updated_by, not_applicable, due_date } = req.body || {};
    const isNA = not_applicable === true;
    // N/A and "done" are mutually exclusive — N/A always wins if both are sent.
    const completedAt = isNA ? null : completed === false ? null : date ? new Date(date) : new Date();
    const notApplicableValue = typeof not_applicable === 'boolean' ? not_applicable : null;

    const result = await pool.query(
      `INSERT INTO product_stages (product_id, stage_key, completed_at, note, owner_id, updated_by, not_applicable, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (product_id, stage_key) DO UPDATE SET
         completed_at = EXCLUDED.completed_at, note = EXCLUDED.note,
         owner_id = EXCLUDED.owner_id, updated_by = EXCLUDED.updated_by,
         not_applicable = EXCLUDED.not_applicable, due_date = EXCLUDED.due_date, updated_at = now()
       RETURNING *`,
      [id, stageKey, completedAt, note || null, owner_id || null, updated_by || null, notApplicableValue, due_date || null]
    );

    // Auto-archive once every applicable milestone is done or N/A — only
    // fires the moment the last one clears (never un-archives on uncheck).
    let autoArchived = false;
    if (await isProductFullyDone(id)) {
      const archiveResult = await pool.query(
        `UPDATE products SET archived = true, updated_at = now() WHERE id = $1 AND archived = false`,
        [id]
      );
      autoArchived = archiveResult.rowCount > 0;
    }

    res.json({ ...result.rows[0], product_auto_archived: autoArchived });
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Product or team member not found' });
    next(err);
  }
});

module.exports = router;
