let state = { stages: [], products: [], allProducts: [], teamMembers: [], stageDefaults: [], selectedProductIds: new Set(), expandedProductIds: new Set() };
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
    const [timeline, allProducts, syncStatus, teamMembers, stageDefaults] = await Promise.all([
      api('/timeline'),
      api('/products?archived=false'),
      api('/am/status'),
      api('/team-members'),
      api('/stage-defaults'),
    ]);
    state.stages = timeline.stages;
    state.products = timeline.products;
    state.allProducts = allProducts;
    state.teamMembers = teamMembers;
    state.stageDefaults = stageDefaults;
    // Products still active drop out of selection automatically.
    const activeIds = new Set(state.products.map((p) => p.id));
    state.selectedProductIds = new Set([...state.selectedProductIds].filter((id) => activeIds.has(id)));
    renderTimeline();
    renderBoard();
    renderProductsTable();
    renderTeamMembersTable();
    renderStageDefaultsTable();
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

async function sendWeeklyEmailNow() {
  if (!confirm('Send the weekly outstanding-styles email right now, to brendan@kohindustries.com and sheridan@kohindustries.com?')) return;
  try {
    const result = await api('/email/send-weekly', { method: 'POST' });
    toast(`Email sent: ${result.outstandingCount} outstanding (${result.atRiskCount} at risk)`);
  } catch (e) {
    toast(e.message, true);
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
          const dateLabel = done ? new Date(entry.completed_at).toLocaleDateString([], { day: '2-digit', month: 'short' }) : '';
          const ownerLabel = done ? entry.owner_name || '—' : '';
          return `<td class="stage-cell" data-product-id="${p.id}" data-stage-key="${s.key}">
            <span class="stage-pill ${done ? 'done' : 'pending'}">${done ? '✓' : '—'}</span>
            <div class="stage-meta">
              <div class="stage-meta-owner">${ownerLabel ? escapeHtml(ownerLabel) : '&nbsp;'}</div>
              <div class="stage-meta-date">${dateLabel ? escapeHtml(dateLabel) : '&nbsp;'}</div>
            </div>
          </td>`;
        })
        .join('');

      const thumb = p.image_url
        ? `<img class="product-thumb" src="${p.image_url}" alt="">`
        : `<div class="product-thumb placeholder">🧵</div>`;

      return `<tr>
        <td class="col-product">
          <div class="product-cell">
            <input type="checkbox" class="row-select" data-product-id="${p.id}" ${state.selectedProductIds.has(p.id) ? 'checked' : ''}>
            <button class="order-toggle" data-product-id="${p.id}" aria-label="Show milestone and order details">▸</button>
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

  const allSelected = state.products.length > 0 && state.products.every((p) => state.selectedProductIds.has(p.id));

  container.innerHTML = `
    <div class="timeline-scroll">
      <table class="timeline-grid">
        <thead><tr><th class="col-product"><input type="checkbox" class="row-select" id="select-all-rows" ${allSelected ? 'checked' : ''}> Product</th>${stageHeaders}</tr></thead>
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
      const productId = Number(btn.dataset.productId);
      const row = document.querySelector(`.order-detail-row[data-product-id="${productId}"]`);
      setDetailOpen(productId, row.style.display === 'none');
    });
  });

  container.querySelectorAll('.row-select[data-product-id]').forEach((cb) => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      const productId = Number(cb.dataset.productId);
      if (cb.checked) state.selectedProductIds.add(productId);
      else state.selectedProductIds.delete(productId);
      updateSelectionBar();
    });
  });

  const selectAllCb = document.getElementById('select-all-rows');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', () => {
      if (selectAllCb.checked) state.products.forEach((p) => state.selectedProductIds.add(p.id));
      else state.selectedProductIds.clear();
      renderTimeline();
      updateSelectionBar();
    });
  }

  updateSelectionBar();

  // Re-open any rows that were expanded before this re-render (e.g. after
  // saving a stage change) so bulk-expanded rows don't collapse on reload.
  state.expandedProductIds.forEach((productId) => {
    if (state.products.some((p) => p.id === productId)) setDetailOpen(productId, true);
  });
}

function updateSelectionBar() {
  const el = document.getElementById('selection-count');
  if (el) el.textContent = `${state.selectedProductIds.size} selected`;
}

function expandSelected() {
  state.selectedProductIds.forEach((id) => setDetailOpen(id, true));
}
function collapseSelected() {
  state.selectedProductIds.forEach((id) => setDetailOpen(id, false));
}
function collapseAll() {
  state.products.forEach((p) => setDetailOpen(p.id, false));
}

function setDetailOpen(productId, open) {
  const row = document.querySelector(`.order-detail-row[data-product-id="${productId}"]`);
  const toggleBtn = document.querySelector(`.order-toggle[data-product-id="${productId}"]`);
  if (!row || !toggleBtn) return;
  const isOpen = row.style.display !== 'none';
  if (open === isOpen) return;

  if (!open) {
    row.style.display = 'none';
    toggleBtn.textContent = '▸';
    toggleBtn.classList.remove('expanded');
    state.expandedProductIds.delete(productId);
    return;
  }

  row.style.display = 'table-row';
  toggleBtn.textContent = '▾';
  toggleBtn.classList.add('expanded');
  state.expandedProductIds.add(productId);
  loadDetailContent(productId);
}

async function loadDetailContent(productId) {
  const detailEl = document.getElementById(`order-detail-${productId}`);
  detailEl.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Completed Milestones</div>
      ${renderMilestonesTable(productId)}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Open Sales Orders — WNDRR ONLINE STORE</div>
      <span class="order-detail-loading">Loading…</span>
    </div>
  `;

  const ordersSection = detailEl.querySelector('.detail-section:last-child');
  try {
    const orders = await api(`/products/${productId}/orders`);
    if (orders.length === 0) {
      ordersSection.innerHTML = `<div class="detail-section-title">Open Sales Orders — WNDRR ONLINE STORE</div><span class="order-detail-empty">No open Sales Orders.</span>`;
      return;
    }
    ordersSection.innerHTML = `
      <div class="detail-section-title">Open Sales Orders — WNDRR ONLINE STORE</div>
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
    ordersSection.innerHTML = `<div class="detail-section-title">Open Sales Orders — WNDRR ONLINE STORE</div><span class="order-detail-empty">Couldn't load orders: ${escapeHtml(e.message)}</span>`;
  }
}

function renderMilestonesTable(productId) {
  const product = state.products.find((p) => p.id === productId);
  const done = state.stages.filter((s) => product.stages[s.key] && product.stages[s.key].completed_at);
  if (done.length === 0) {
    return `<span class="order-detail-empty">No milestones completed yet.</span>`;
  }
  return `
    <table class="order-detail-table milestones-table">
      <thead><tr><th>Milestone</th><th>Date</th><th>Owner</th><th>Note</th></tr></thead>
      <tbody>
        ${done
          .map((s) => {
            const entry = product.stages[s.key];
            const dateLabel = new Date(entry.completed_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
            return `<tr>
              <td>${escapeHtml(s.label)}</td>
              <td>${dateLabel}</td>
              <td>${escapeHtml(entry.owner_name || '—')}</td>
              <td>${escapeHtml(entry.note || '—')}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
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
  const ownerSelect = document.getElementById('stage-owner');
  ownerSelect.innerHTML = '<option value="">— unassigned —</option>' + state.teamMembers.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  // If this specific product's stage has never had an owner set, pre-fill
  // with the configured default for this stage (Admin > Milestone Default
  // Owners) rather than starting unassigned every time.
  const defaultOwner = state.stageDefaults.find((d) => d.stage_key === stageKey);
  ownerSelect.value = entry.owner_id || (defaultOwner && defaultOwner.owner_id) || '';
  document.getElementById('stage-note').value = entry.note || '';
  openModal('stage-modal');
}

async function saveStage() {
  if (!activeCell) return;
  const { productId, stageKey } = activeCell;
  const completed = document.getElementById('stage-completed').checked;
  const date = document.getElementById('stage-date').value;
  const owner_id = document.getElementById('stage-owner').value || null;
  const note = document.getElementById('stage-note').value || null;

  try {
    await api(`/products/${productId}/stages/${stageKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed, date: completed ? date : null, owner_id, note }),
    });
    closeModal('stage-modal');
    toast('Stage updated');
    loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

// ── Team members ─────────────────────────────────────
function renderTeamMembersTable() {
  const tbody = document.querySelector('#team-members-table tbody');
  tbody.innerHTML = state.teamMembers
    .map(
      (m) => `<tr><td>${escapeHtml(m.name)}</td><td><button class="link-btn" data-action="delete-member" data-id="${m.id}">Remove</button></td></tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-action="delete-member"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this team member? Any milestones they own will become unassigned.')) return;
      try {
        await api(`/team-members/${btn.dataset.id}`, { method: 'DELETE' });
        toast('Team member removed');
        loadAll();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}

function openTeamMemberModal() {
  document.getElementById('team-member-name').value = '';
  openModal('team-member-modal');
}

async function saveTeamMember() {
  const name = document.getElementById('team-member-name').value;
  if (!name.trim()) return toast('Name is required', true);
  try {
    await api('/team-members', { method: 'POST', body: JSON.stringify({ name }) });
    closeModal('team-member-modal');
    toast('Team member added');
    loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

// ── Milestone default owners ─────────────────────────
function renderStageDefaultsTable() {
  const tbody = document.querySelector('#stage-defaults-table tbody');
  tbody.innerHTML = state.stageDefaults
    .map(
      (d) => `<tr>
        <td>${escapeHtml(d.label)}</td>
        <td>
          <select data-stage-key="${d.stage_key}" class="stage-default-select">
            <option value="">— unassigned —</option>
            ${state.teamMembers.map((m) => `<option value="${m.id}" ${d.owner_id === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
          </select>
        </td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('.stage-default-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/stage-defaults/${sel.dataset.stageKey}`, {
          method: 'PUT',
          body: JSON.stringify({ owner_id: sel.value || null }),
        });
        toast('Default owner updated');
        const d = state.stageDefaults.find((x) => x.stage_key === sel.dataset.stageKey);
        if (d) d.owner_id = sel.value ? Number(sel.value) : null;
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

checkSession();
