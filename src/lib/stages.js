const { pool } = require('../db');

// The timeline grid's columns, in display order — configurable from Admin
// (add/remove/reorder) rather than a hardcoded list. 'boolean' stages are
// marked done/not-done; 'date' stages record when the thing happened. Both
// are stored the same way (product_stages.completed_at) — a date-type
// stage's completed_at IS the recorded date.
async function getStages() {
  const result = await pool.query('SELECT stage_key AS key, label, type FROM stages ORDER BY sort_order ASC');
  return result.rows;
}

async function getStageKeys() {
  return (await getStages()).map((s) => s.key);
}

// A product's "current stage" is the first stage (in display order) that
// isn't done yet — mirrors the client-side version in public/app.js.
// null means every stage is complete.
function currentStage(stages, stageMap) {
  return stages.find((s) => !(stageMap[s.key] && stageMap[s.key].completed_at)) || null;
}

module.exports = { getStages, getStageKeys, currentStage };
