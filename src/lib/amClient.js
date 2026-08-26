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

// WNDRR ONLINE STORE customer_id in AM — confirmed against real orders
// (same id demandplanning targets for its AM order push).
const WNDRR_ONLINE_STORE_CUSTOMER_ID = '1068';

// Open Sales Orders (customer PO + outstanding qty) for a style, restricted
// to the WNDRR ONLINE STORE customer. order_items can be filtered directly
// by style_number, but doesn't carry customer_id or the PO number — those
// live on the order header, so each distinct order_id needs a follow-up
// lookup. Open-order counts per style are small in practice (a handful),
// so the extra round trips are cheap for an on-demand dropdown fetch.
async function fetchOpenOrdersForStyle(styleNumber) {
  const itemsData = await amGet('order_items', { style_number: styleNumber });
  const items = itemsData.response || [];

  const qtyOpenByOrder = new Map();
  for (const item of items) {
    const qtyOpen = parseFloat(item.qty_open) || 0;
    if (qtyOpen <= 0) continue;
    qtyOpenByOrder.set(item.order_id, (qtyOpenByOrder.get(item.order_id) || 0) + qtyOpen);
  }
  if (qtyOpenByOrder.size === 0) return [];

  const orders = await Promise.all(
    [...qtyOpenByOrder.keys()].map((orderId) => amGet('orders', { order_id: orderId }))
  );

  const results = [];
  orders.forEach((data, i) => {
    const order = (data.response || [])[0];
    const orderId = [...qtyOpenByOrder.keys()][i];
    if (!order || order.customer_id !== WNDRR_ONLINE_STORE_CUSTOMER_ID) return;
    results.push({
      order_id: orderId,
      customer_po: order.customer_po || null,
      qty_open: qtyOpenByOrder.get(orderId),
    });
  });
  return results;
}

module.exports = { fetchAllProducts, fetchOpenOrdersForStyle };
