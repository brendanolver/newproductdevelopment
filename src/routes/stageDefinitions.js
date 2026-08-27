const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function slugify(label) {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (base || 'stage').slice(0, 60);
}

// GET /api/stage-definitions — every milestone column, in display order.
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT stage_key, label, type, sort_order, na_default_np, na_default_nv, na_default_nc, na_default_ed FROM stages ORDER BY sort_order ASC'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/stage-definitions  Body: { label, type }
// Appends a new milestone at the end of the order. stage_key is generated
// from the label (not user-supplied) since it needs to stay a stable,
// URL-safe identifier once product_stages rows start referencing it.
router.post('/', async (req, res, next) => {
  try {
    const { label, type } = req.body || {};
    if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });
    if (type !== 'boolean' && type !== 'date') return res.status(400).json({ error: "type must be 'boolean' or 'date'" });

    const base = slugify(label);
    const existing = await pool.query('SELECT stage_key FROM stages WHERE stage_key LIKE $1', [`${base}%`]);
    const taken = new Set(existing.rows.map((r) => r.stage_key));
    let stageKey = base;
    let i = 2;
    while (taken.has(stageKey)) {
      stageKey = `${base}_${i}`;
      i += 1;
    }

    const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order), -1) AS max FROM stages');
    const sortOrder = Number(maxOrder.rows[0].max) + 1;

    const result = await pool.query(
      `INSERT INTO stages (stage_key, label, type, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [stageKey, label.trim(), type, sortOrder]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/stage-definitions/reorder  Body: { order: [stage_key, ...] }
// Full replacement of the display order — simplest way for the Admin
// up/down buttons to persist a reordered list in one call. Registered
// before the /:stageKey routes so "reorder" isn't swallowed as a key.
router.put('/reorder', async (req, res, next) => {
  const { order } = req.body || {};
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order must be a non-empty array of stage_key' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    for (let i = 0; i < order.length; i += 1) {
      await client.query('UPDATE stages SET sort_order = $1 WHERE stage_key = $2', [i, order[i]]);
    }
    await client.query('COMMIT');
    const result = await pool.query(
      'SELECT stage_key, label, type, sort_order, na_default_np, na_default_nv, na_default_nc, na_default_ed FROM stages ORDER BY sort_order ASC'
    );
    res.json(result.rows);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

// PUT /api/stage-definitions/:stageKey
// Body: { label?, type?, na_default_np?, na_default_nv?, na_default_nc?, na_default_ed? }
router.put('/:stageKey', async (req, res, next) => {
  try {
    const { label, type, na_default_np, na_default_nv, na_default_nc, na_default_ed } = req.body || {};
    if (type && type !== 'boolean' && type !== 'date') {
      return res.status(400).json({ error: "type must be 'boolean' or 'date'" });
    }
    const result = await pool.query(
      `UPDATE stages SET
         label = COALESCE($1, label),
         type = COALESCE($2, type),
         na_default_np = COALESCE($3, na_default_np),
         na_default_nv = COALESCE($4, na_default_nv),
         na_default_nc = COALESCE($5, na_default_nc),
         na_default_ed = COALESCE($6, na_default_ed)
       WHERE stage_key = $7 RETURNING *`,
      [
        label ? label.trim() : null,
        type || null,
        typeof na_default_np === 'boolean' ? na_default_np : null,
        typeof na_default_nv === 'boolean' ? na_default_nv : null,
        typeof na_default_nc === 'boolean' ? na_default_nc : null,
        typeof na_default_ed === 'boolean' ? na_default_ed : null,
        req.params.stageKey,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Milestone not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/stage-definitions/:stageKey — removes the milestone column
// and any progress logged against it (product_stages rows, default owner).
router.delete('/:stageKey', async (req, res, next) => {
  let client;
  try {
    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM stages');
    if (countResult.rows[0].count <= 1) {
      return res.status(400).json({ error: 'At least one milestone is required' });
    }

    const { stageKey } = req.params;
    client = await pool.connect();
    await client.query('BEGIN');
    const deleted = await client.query('DELETE FROM stages WHERE stage_key = $1 RETURNING stage_key', [stageKey]);
    if (deleted.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Milestone not found' });
    }
    await client.query('DELETE FROM product_stages WHERE stage_key = $1', [stageKey]);
    await client.query('DELETE FROM stage_default_owners WHERE stage_key = $1', [stageKey]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
