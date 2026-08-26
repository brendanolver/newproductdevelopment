const { pool } = require('../db');
const { fetchAllProducts } = require('./amClient');

// AM's mid_code is "DD-MM-YY" — same field/format demandplanning already
// parses for launch date.
function parseMidCode(midCode) {
  if (!midCode || typeof midCode !== 'string') return null;
  const m = midCode.trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = 2000 + Number(yy);
  return `${year}-${mm}-${dd}`; // YYYY-MM-DD, safe for a DATE column
}

let lastSync = { at: null, upserted: 0, scanned: 0, error: null, running: false };

function getSyncStatus() {
  return lastSync;
}

async function syncFromAM() {
  if (lastSync.running) return lastSync;
  lastSync = { ...lastSync, running: true, error: null };
  let scanned = 0;
  let upserted = 0;
  try {
    const products = await fetchAllProducts({
      onPage: (_rows, total) => {
        scanned = total;
      },
    });

    // The sync gate: only styles someone has deliberately marked with a
    // Box Size in AM are surfaced here — see plan notes for why.
    const qualifying = products.filter((p) => p.box_size && String(p.box_size).trim() !== '');

    for (const p of qualifying) {
      const styleCode = p.style_number;
      if (!styleCode) continue;
      const name = p.web_title || p.description || styleCode;
      const category = p.category || null;
      const launchDate = parseMidCode(p.mid_code);
      const imageUrl = Array.isArray(p.images) && p.images.length > 0 ? p.images[0].img : null;
      const boxSize = String(p.box_size);

      await pool.query(
        `INSERT INTO products (style_code, am_product_id, name, category, launch_date, image_url, box_size, source, am_last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'am', now())
         ON CONFLICT (style_code) DO UPDATE SET
           am_product_id = EXCLUDED.am_product_id,
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           launch_date = EXCLUDED.launch_date,
           image_url = COALESCE(EXCLUDED.image_url, products.image_url),
           box_size = EXCLUDED.box_size,
           am_last_synced_at = now(),
           updated_at = now()
         WHERE products.source = 'am'`,
        [styleCode, p.product_id, name, category, launchDate, imageUrl, boxSize]
      );
      upserted += 1;
    }

    lastSync = { at: new Date().toISOString(), upserted, scanned, error: null, running: false };
  } catch (err) {
    lastSync = { at: new Date().toISOString(), upserted, scanned, error: err.message, running: false };
    throw err;
  }
  return lastSync;
}

module.exports = { syncFromAM, getSyncStatus, parseMidCode };
