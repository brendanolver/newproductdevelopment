const express = require('express');
const { pool } = require('../db');
const { fetchOpenOrdersForStyle } = require('../lib/amClient');
const { getTimelineData } = require('../lib/timelineData');

const router = express.Router();

// Shaped the same way as /api/timeline (stage map, percent_complete, etc.)
// so Admin can show progress on archived products too.
router.get('/', async (req, res, next) => {
  try {
    const showArchived = req.query.archived === 'true';
    const { products } = await getTimelineData({ archived: showArchived });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// Manual add — for styles not (yet) in Apparel Magic, or that shouldn't
// wait on the box_size sync gate.
router.post('/', async (req, res, next) => {
  try {
    const { style_code, name, category, launch_date, image_url } = req.body || {};
    if (!style_code || !style_code.trim()) return res.status(400).json({ error: 'style_code is required' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

    const result = await pool.query(
      `INSERT INTO products (style_code, name, category, launch_date, image_url, source)
       VALUES ($1, $2, $3, $4, $5, 'manual') RETURNING *`,
      [style_code.trim(), name.trim(), category || null, launch_date || null, image_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A product with that style_code already exists' });
    }
    next(err);
  }
});

// GET /api/products/:id/orders — open AM Sales Orders (customer PO + open
// qty) for this product, WNDRR ONLINE STORE customer only. Fetched live on
// demand, not cached — this is real-time order state, not part of the
// product master synced by amSync.
router.get('/:id/orders', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT style_code FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const orders = await fetchOpenOrdersForStyle(result.rows[0].style_code);
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, category, launch_date, image_url, archived } = req.body || {};
    const result = await pool.query(
      `UPDATE products SET
         name = COALESCE($1, name),
         category = $2,
         launch_date = $3,
         image_url = $4,
         archived = COALESCE($5, archived),
         updated_at = now()
       WHERE id = $6 RETURNING *`,
      [
        name ? name.trim() : null,
        category || null,
        launch_date || null,
        image_url || null,
        typeof archived === 'boolean' ? archived : null,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:id/unarchive — reopens an archived product by
// un-archiving it AND reopening the most recently completed milestone
// (whichever one was checked off last), so it goes back to "in progress"
// one step before it hit 100%, rather than reappearing already fully done.
router.post('/:id/unarchive', async (req, res, next) => {
  try {
    const productCheck = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (productCheck.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

    const lastStageResult = await pool.query(
      `SELECT stage_key FROM product_stages
       WHERE product_id = $1 AND completed_at IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`,
      [req.params.id]
    );
    const reopenedStageKey = lastStageResult.rows[0] ? lastStageResult.rows[0].stage_key : null;

    if (reopenedStageKey) {
      await pool.query(
        `UPDATE product_stages SET completed_at = NULL, updated_at = now()
         WHERE product_id = $1 AND stage_key = $2`,
        [req.params.id, reopenedStageKey]
      );
    }

    const result = await pool.query(
      `UPDATE products SET archived = false, updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ ...result.rows[0], reopened_stage_key: reopenedStageKey });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
