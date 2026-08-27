const { pool } = require('../db');

const LAUNCH_TYPES = ['NP', 'NV', 'NC', 'ED'];

// The timeline grid's columns, in display order — configurable from Admin
// (add/remove/reorder) rather than a hardcoded list. 'boolean' stages are
// marked done/not-done; 'date' stages record when the thing happened. Both
// are stored the same way (product_stages.completed_at) — a date-type
// stage's completed_at IS the recorded date.
async function getStages() {
  const result = await pool.query(
    `SELECT stage_key AS key, label, type, na_default_np, na_default_nv, na_default_nc, na_default_ed
     FROM stages ORDER BY sort_order ASC`
  );
  return result.rows.map((r) => ({
    key: r.key,
    label: r.label,
    type: r.type,
    naDefaults: { NP: r.na_default_np, NV: r.na_default_nv, NC: r.na_default_nc, ED: r.na_default_ed },
  }));
}

async function getStageKeys() {
  return (await getStages()).map((s) => s.key);
}

// Resolves whether `stage` is not-applicable for `product`: an explicit
// per-product override (product_stages.not_applicable, when not null)
// always wins; otherwise falls back to the stage's default for the
// product's launch_type (false if the product has no launch_type set).
function resolveNotApplicable(stage, product, row) {
  const override = row && typeof row.not_applicable === 'boolean' ? row.not_applicable : null;
  if (override !== null) return override;
  return !!(product.launch_type && stage.naDefaults[product.launch_type]);
}

// A product's "current stage" is the first stage (in display order) that
// isn't done and isn't N/A — mirrors the client-side version in
// public/app.js. null means every applicable stage is complete. Expects
// stageMap entries to already carry a resolved `not_applicable` boolean
// (see getTimelineData), not raw DB rows.
function currentStage(stages, stageMap) {
  return stages.find((s) => {
    const entry = stageMap[s.key];
    if (entry && entry.not_applicable) return false;
    return !(entry && entry.completed_at);
  }) || null;
}

// Used right after a stage PATCH (or an N/A toggle) to decide whether the
// product just became fully done and should auto-archive.
async function isProductFullyDone(productId) {
  const stages = await getStages();
  const productResult = await pool.query('SELECT launch_type FROM products WHERE id = $1', [productId]);
  if (productResult.rows.length === 0) return false;
  const product = productResult.rows[0];

  const rowsResult = await pool.query(
    'SELECT stage_key, completed_at, not_applicable FROM product_stages WHERE product_id = $1',
    [productId]
  );
  const byKey = Object.fromEntries(rowsResult.rows.map((r) => [r.stage_key, r]));

  return stages.every((s) => {
    const row = byKey[s.key];
    if (resolveNotApplicable(s, product, row)) return true;
    return !!(row && row.completed_at);
  });
}

module.exports = { getStages, getStageKeys, currentStage, resolveNotApplicable, isProductFullyDone, LAUNCH_TYPES };
