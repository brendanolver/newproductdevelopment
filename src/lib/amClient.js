// Read-only Apparel Magic client. The token lives only here, server-side —
// unlike the Netlify-function proxies used by the single-file apps, this is
// a real backend process so the browser never needs to see it at all.

const AM_BASE = 'https://kohindustries.app.apparelmagic.com/api';

function getToken() {
  const token = process.env.AM_TOKEN;
  if (!token) throw new Error('AM_TOKEN is not set.');
  return token;
}

// AM 301-redirects a path missing a trailing slash, which silently
// downgrades a POST/PUT to a bodyless GET — not our concern here since this
// client is GET-only, but keep the trailing slash anyway to avoid the
// redirect round-trip.
async function amGet(pathSegment, extraParams = {}) {
  const params = new URLSearchParams({ ...extraParams, token: getToken(), time: Date.now() });
  const url = `${AM_BASE}/${pathSegment}/?${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`AM request failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  if (data.meta && data.meta.errors && data.meta.errors.length) {
    throw new Error(`AM API error: ${data.meta.errors.join('; ')}`);
  }
  return data;
}

// Crawls the full /products catalogue via the pagination[last_id] cursor.
async function fetchAllProducts({ onPage } = {}) {
  const all = [];
  let lastId;
  for (;;) {
    const params = lastId ? { 'pagination[last_id]': lastId } : {};
    const data = await amGet('products', params);
    const rows = data.response || [];
    if (rows.length === 0) break;
    all.push(...rows);
    if (onPage) onPage(rows, all.length);
    lastId = data.meta && data.meta.pagination && data.meta.pagination.last_id;
    if (!lastId) break;
  }
  return all;
}

module.exports = { fetchAllProducts };
