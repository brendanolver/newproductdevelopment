const express = require('express');
const { pool } = require('../db');
const { STAGES } = require('../lib/stages');

const router = express.Router();

// GET /api/timeline — every active product with its full stage-completion
// map, shaped for the grid (one query for products, one for all their
// stage rows, joined in JS to avoid a huge row-per-stage result set).
router.get('/', async (req, res, next) => {
  try {
    const productsResult = await pool.query(
      `SELECT * FROM products WHERE archived = false ORDER BY launch_date NULLS LAST, style_code ASC`
    );
    const products = productsResult.rows;
    if (products.length === 0) {
      return res.json({ stages: STAGES, products: [] });
    }

    const ids = products.map((p) => p.id);
    const stagesResult = await pool.query(
      `SELECT ps.*, tm.name AS owner_name
       FROM product_stages ps
       LEFT JOIN team_members tm ON tm.id = ps.owner_id
       WHERE ps.product_id = ANY($1::int[])`,
      [ids]
    );

    const stagesByProduct = new Map();
    for (const row of stagesResult.rows) {
      if (!stagesByProduct.has(row.product_id)) stagesByProduct.set(row.product_id, {});
      stagesByProduct.get(row.product_id)[row.stage_key] = {
        completed_at: row.completed_at,
        note: row.note,
        owner_id: row.owner_id,
        owner_name: row.owner_name,
      };
    }

    const now = Date.now();
    const shaped = products.map((p) => {
      const stageMap = stagesByProduct.get(p.id) || {};
      const daysToLaunch = p.launch_date
        ? Math.ceil((new Date(p.launch_date).getTime() - now) / (1000 * 60 * 60 * 24))
        : null;
      const completedCount = STAGES.filter((s) => stageMap[s.key] && stageMap[s.key].completed_at).length;
      // Flag: launch is close (or passed) but the checklist isn't done yet.
      const atRisk = daysToLaunch !== null && daysToLaunch <= 14 && completedCount < STAGES.length;
      return { ...p, days_to_launch: daysToLaunch, stages: stageMap, completed_count: completedCount, at_risk: atRisk };
    });

    res.json({ stages: STAGES, products: shaped });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
