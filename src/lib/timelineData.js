const { pool } = require('../db');
const { getStages, resolveNotApplicable } = require('./stages');

// Shared by the /api/timeline route, the Admin products list, and the
// weekly email — every product (active by default, or archived) with its
// full stage-completion map (owner + note + resolved not_applicable
// included, one entry per stage even if never touched).
async function getTimelineData({ archived = false } = {}) {
  const stages = await getStages();

  const productsResult = await pool.query(
    `SELECT * FROM products WHERE archived = $1 ORDER BY launch_date NULLS LAST, style_code ASC`,
    [archived]
  );
  const products = productsResult.rows;
  if (products.length === 0) {
    return { stages, products: [] };
  }

  const ids = products.map((p) => p.id);
  const stagesResult = await pool.query(
    `SELECT ps.*, tm.name AS owner_name
     FROM product_stages ps
     LEFT JOIN team_members tm ON tm.id = ps.owner_id
     WHERE ps.product_id = ANY($1::int[])`,
    [ids]
  );

  const rowsByProduct = new Map();
  for (const row of stagesResult.rows) {
    if (!rowsByProduct.has(row.product_id)) rowsByProduct.set(row.product_id, {});
    rowsByProduct.get(row.product_id)[row.stage_key] = row;
  }

  const now = Date.now();
  const shaped = products.map((p) => {
    const rawRows = rowsByProduct.get(p.id) || {};
    const stageMap = {};
    for (const s of stages) {
      const row = rawRows[s.key];
      stageMap[s.key] = {
        completed_at: row ? row.completed_at : null,
        note: row ? row.note : null,
        owner_id: row ? row.owner_id : null,
        owner_name: row ? row.owner_name : null,
        not_applicable: resolveNotApplicable(s, p, row),
      };
    }

    const applicableStages = stages.filter((s) => !stageMap[s.key].not_applicable);
    const completedCount = applicableStages.filter((s) => stageMap[s.key].completed_at).length;
    const percentComplete = applicableStages.length ? Math.round((completedCount / applicableStages.length) * 100) : 100;

    const daysToLaunch = p.launch_date
      ? Math.ceil((new Date(p.launch_date).getTime() - now) / (1000 * 60 * 60 * 24))
      : null;
    // Flag: launch is close (or passed) but the checklist isn't done yet.
    const atRisk = daysToLaunch !== null && daysToLaunch <= 14 && completedCount < applicableStages.length;

    return {
      ...p,
      days_to_launch: daysToLaunch,
      stages: stageMap,
      completed_count: completedCount,
      percent_complete: percentComplete,
      at_risk: atRisk,
    };
  });

  return { stages, products: shaped };
}

module.exports = { getTimelineData };
