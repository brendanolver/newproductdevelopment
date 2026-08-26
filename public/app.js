let state = { stages: [], products: [], allProducts: [] };
let activeCell = null; // { productId, stageKey }

// ── API helpers ──────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  if (res.status === 401) {
    showPasswordScreen();
    throw new Error('Not authenticated');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ─────────────────────────────────────────────
async function login() {
  const password = document.getElementById('pw-input').value;
  const errEl = document.getElementById('pw-error');
  try {
    await api('/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
    errEl.classList.remove('show');
    showApp();
  } catch (e) {
    errEl.classList.add('show');
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  showPasswordScreen();
}

function showPasswordScreen() {
  document.getElementById('password-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('password-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadAll();
}

async function checkSession() {
  try {
    const { authenticated } = await api('/auth/session');
    if (authenticated) showApp();
    else showPasswordScreen();
  } catch (e) {
    showPasswordScreen();
  }
}

// ── Toast ────────────────────────────────────────────
function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Tabs ─────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Load & render ────────────────────────────────────
async function loadAll() {
  try {
    const [timeline, allProducts, syncStatus] = await Promise.all([
      api('/timeline'),
      api('/products?archived=false'),
      api('/am/status'),
    ]);
    state.stages = timeline.stages;
    state.products = timeline.products;
    state.allProducts = allProducts;
    renderTimeline();
    renderBoard();
    renderProductsTable();
    renderSyncStatus(syncStatus);
  } catch (e) {
    toast(e.message, true);
  }
}

function renderSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (!status || !status.at) {
    el.textContent = 'AM sync: not run yet';
    return;
  }
  const when = new Date(status.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (status.error) {
    el.textContent = `AM sync failed at ${when}`;
  } else {
    el.textContent = `AM sync: ${status.upserted} product(s) at ${when}`;
  }
}

async function syncNow() {
  const btn = document.getElementById('sync-now-btn');
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  try {
    const result = await api('/am/sync', { method: 'POST' });
    renderSyncStatus(result);
    toast(`Synced ${result.upserted} qualifying product(s) from Apparel Magic`);
    loadAll();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sync Apparel Magic';
  }
}

function daysToLaunchLabel(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) return `Launched ${Math.abs(days)}d ago`;
  if (days === 0) return 'Launches today';
  return `${days}d to launch`;
}

function renderTimeline() {
  const container = document.getElementById('timeline-container');
  if (state.products.length === 0) {
    container.innerHTML = `<div class="empty-state">No active products yet. Sync Apparel Magic, or add one manually with "+ New Product".</div>`;
    return;
  }

  const stageHeaders = state.stages.map((s) => `<th title="${escapeHtml(s.label)}">${escapeHtml(s.label)}</th>`).join('');

  const rows = state.products
    .map((p) => {
      const cells = state.stages
        .map((s) => {
          const entry = p.stages[s.key];
          const done = entry && entry.completed_at;
          const dateLabel = done ? new Date(entry.completed_at).toLocaleDateString([], { day: '2-digit', month: 'short' }) : '—';
          return `<td class="stage-cell" data-product-id="${p.id}" data-stage-key="${s.key}">
            <span class="stage-pill ${done ? 'done' : 'pending'}">${done ? (s.type === 'date' ? dateLabel : '✓') : '—'}</span>
          </td>`;
        })
        .join('');

      const thumb = p.image_url
        ? `<img class="product-thumb" src="${p.image_url}" alt="">`
        : `<div class="product-thumb placeholder">🧵</div>`;

      return `<tr>
        <td class="col-product">
          <div class="product-cell">
            <button class="order-toggle" data-product-id="${p.id}" aria-label="Show open sales orders">▸</button>
            ${thumb}
            <div>
              <div class="product-name">${escapeHtml(p.name)}<span class="source-badge ${p.source}">${p.source}</span></div>
              <div class="product-style">${escapeHtml(p.style_code)}</div>
              <div class="product-launch ${p.at_risk ? 'at-risk' : ''}">${p.launch_date ? new Date(p.launch_date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : 'No launch date'} ${p.days_to_launch !== null ? '· ' + daysToLaunchLabel(p.days_to_launch) : ''}</div>
            </div>
          </div>
        </td>
        ${cells}
      </tr>
      <tr class="order-detail-row" data-product-id="${p.id}" style="display:none;">
        <td class="order-detail-cell" colspan="${1 + state.stages.length}">
          <div class="order-detail" id="order-detail-${p.id}"></div>
        </td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `
    <div class="timeline-scroll">
      <table class="timeline-grid">
        <thead><tr><th class="col-product">Product</th>${stageHeaders}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.stage-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      openStageModal(Number(cell.dataset.productId), cell.dataset.stageKey);
    });
  });

  container.querySelectorAll('.order-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleOrderDetail(Number(btn.dataset.productId), btn);
    });
  });
}

async function toggleOrderDetail(productId, toggleBtn) {
  const row = document.querySelector(`.order-detail-row[data-product-id="${productId}"]`);
  const isOpen = row.style.display !== 'none';
  if (isOpen) {
    row.style.display = 'none';
    toggleBtn.textContent = '▸';
    toggleBtn.classList.remove('expanded');
    return;
  }

  row.style.display = 'table-row';
  toggleBtn.textContent = '▾';
  toggleBtn.classList.add('expanded');

  const detailEl = document.getElementById(`order-detail-${productId}`);
  detailEl.innerHTML = `<span class="order-detail-loading">Loading open sales orders…</span>`;
  try {
    const orders = await api(`/products/${productId}/orders`);
    if (orders.length === 0) {
      detailEl.innerHTML = `<span class="order-detail-empty">No open Sales Orders for WNDRR ONLINE STORE.</span>`;
      return;
    }
    detailEl.innerHTML = `
      <table class="order-detail-table">
        <thead><tr><th>Customer PO</th><th>Qty On Order</th></tr></thead>
        <tbody>
          ${orders
            .map(
              (o) => `<tr><td>${escapeHtml(o.customer_po || '(no PO)')}</td><td>${o.qty_open}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  } catch (e) {
    detailEl.innerHTML = `<span class="order-detail-empty">Couldn't load orders: ${escapeHtml(e.message)}</span>`;
  }
}

// A product's "current stage" is the first stage (in sheet order) that
// isn't done yet — the thing actually holding it up. null means every
// stage is complete.
function currentStageFor(product) {
  return state.stages.find((s) => !(product.stages[s.key] && product.stages[s.key].completed_at)) || null;
}

function renderBoard() {
  const container = document.getElementById('board-container');
  if (state.products.length === 0) {
    container.innerHTML = `<div class="empty-state">No active products yet. Sync Apparel Magic, or add one manually with "+ New Product".</div>`;
    return;
  }

  const byStage = new Map(state.stages.map((s) => [s.key, []]));
  const complete = [];
  state.products.forEach((p) => {
    const stage = currentStageFor(p);
    if (stage) byStage.get(stage.key).push(p);
    else complete.push(p);
  });

  const columns = state.stages
    .map((s) => renderBoardColumn(s.label, byStage.get(s.key), false))
    .join('') + renderBoardColumn('Complete', complete, true);

  container.innerHTML = `<div class="board">${columns}</div>`;

  container.querySelectorAll('.board-card[data-product-id]').forEach((card) => {
    card.addEventListener('click', () => {
      openStageModal(Number(card.dataset.productId), card.dataset.stageKey);
    });
  });
}

function renderBoardColumn(label, cards, isComplete) {
  const cardsHtml = cards
    .map((p) => {
      const thumb = p.image_url
        ? `<img class="product-thumb" src="${p.image_url}" alt="">`
        : `<div class="product-thumb placeholder">🧵</div>`;
      const stage = isComplete ? null : currentStageFor(p);
      return `<div class="board-card ${isComplete ? 'complete-card' : ''}" ${stage ? `data-product-id="${p.id}" data-stage-key="${stage.key}"` : ''}>
        ${thumb}
        <div class="board-card-body">
          <div class="board-card-name">${escapeHtml(p.name)}<span class="source-badge ${p.source}">${p.source}</span></div>
          <div class="board-card-style">${escapeHtml(p.style_code)}</div>
          <div class="board-card-launch ${p.at_risk ? 'at-risk' : ''}">${p.launch_date ? new Date(p.launch_date).toLocaleDateString([], { day: '2-digit', month: 'short' }) : 'No launch date'} ${p.days_to_launch !== null ? '· ' + daysToLaunchLabel(p.days_to_launch) : ''}</div>
        </div>
      </div>`;
    })
    .join('');

  return `<div class="board-column ${isComplete ? 'complete-column' : ''}">
    <div class="board-column-header"><span>${escapeHtml(label)}</span><span class="board-column-count">${cards.length}</span></div>
    ${cardsHtml}
  </div>`;
}

function renderProductsTable() {
  const tbody = document.querySelector('#products-table tbody');
  tbody.innerHTML = state.allProducts
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.style_code)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.launch_date ? new Date(p.launch_date).toLocaleDateString() : '—'}</td>
        <td><span class="source-badge ${p.source}">${p.source}</span></td>
        <td>${p.archived ? 'Yes' : 'No'}</td>
        <td>
          <button class="link-btn" data-action="edit" data-id="${p.id}">Edit</button>
          &nbsp;·&nbsp;
          <button class="link-btn" data-action="toggle-archive" data-id="${p.id}" data-archived="${p.archived}">${p.archived ? 'Unarchive' : 'Archive'}</button>
        </td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const product = state.allProducts.find((p) => p.id === Number(btn.dataset.id));
      openProductModal(product);
    });
  });
  tbody.querySelectorAll('[data-action="toggle-archive"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const archived = btn.dataset.archived !== 'true';
      try {
        await api(`/products/${btn.dataset.id}`, { method: 'PUT', body: JSON.stringify({ archived }) });
        toast(archived ? 'Product archived' : 'Product unarchived');
        loadAll();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}

// ── Modals ───────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}
function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function openProductModal(product) {
  document.getElementById('product-modal-title').textContent = product ? 'Edit Product' : 'New Product';
  document.getElementById('product-id').value = product ? product.id : '';
  document.getElementById('product-style-code').value = product ? product.style_code : '';
  document.getElementById('product-style-code').disabled = !!product;
  document.getElementById('product-name').value = product ? product.name : '';
  document.getElementById('product-category').value = (product && product.category) || '';
  document.getElementById('product-launch-date').value = product && product.launch_date ? product.launch_date.slice(0, 10) : '';
  document.getElementById('product-image-url').value = (product && product.image_url) || '';
  document.getElementById('product-delete-btn').style.display = product ? 'inline-block' : 'none';
  openModal('product-modal');
}

async function saveProduct() {
  const id = document.getElementById('product-id').value;
  const payload = {
    style_code: document.getElementById('product-style-code').value,
    name: document.getElementById('product-name').value,
    category: document.getElementById('product-category').value || null,
    launch_date: document.getElementById('product-launch-date').value || null,
    image_url: document.getElementById('product-image-url').value || null,
  };
  if (!payload.name.trim()) return toast('Name is required', true);
  if (!id && !payload.style_code.trim()) return toast('Style code is required', true);

  try {
    if (id) {
      delete payload.style_code;
      await api(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('product-modal');
    toast('Product saved');
    loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteProduct() {
  const id = document.getElementById('product-id').value;
  if (!id) return;
  if (!confirm('Delete this product? This cannot be undone.')) return;
  try {
    await api(`/products/${id}`, { method: 'DELETE' });
    closeModal('product-modal');
    toast('Product deleted');
    loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

function openStageModal(productId, stageKey) {
  const product = state.products.find((p) => p.id === productId);
  const stage = state.stages.find((s) => s.key === stageKey);
  const entry = product.stages[stageKey] || {};
  activeCell = { productId, stageKey };

  document.getElementById('stage-modal-title').textContent = `${stage.label} — ${product.name}`;
  document.getElementById('stage-completed').checked = !!entry.completed_at;
  document.getElementById('stage-date').value = entry.completed_at ? entry.completed_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  document.getElementById('stage-note').value = entry.note || '';
  openModal('stage-modal');
}

async function saveStage() {
  if (!activeCell) return;
  const { productId, stageKey } = activeCell;
  const completed = document.getElementById('stage-completed').checked;
  const date = document.getElementById('stage-date').value;
  const note = document.getElementById('stage-note').value || null;

  try {
    await api(`/products/${productId}/stages/${stageKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed, date: completed ? date : null, note }),
    });
    closeModal('stage-modal');
    toast('Stage updated');
    loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

checkSession();
