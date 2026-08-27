let state = { stages: [], products: [], stageDefinitions: [], teamMembers: [], stageDefaults: [], emailSchedule: null, selectedProductIds: new Set(), expandedProductIds: new Set() };
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
    const [timeline, stageDefinitions, syncStatus, teamMembers, stageDefaults, emailSchedule] = await Promise.all([
      api('/timeline'),
      api('/stage-definitions'),
      api('/am/status'),
      api('/team-members'),
      api('/stage-defaults'),
      api('/email/schedule'),
    ]);
    state.stages = timeline.stages;
    state.products = timeline.products;
    state.stageDefinitions = stageDefinitions;
    state.teamMembers = teamMembers;
    state.stageDefaults = stageDefaults;
    state.emailSchedule = emailSchedule;
    // Products still active drop out of selection automatically.
    const activeIds = new Set(state.products.map((p) => p.id));
    state.selectedProductIds = new Set([...state.selectedProductIds].filter((id) => activeIds.has(id)));
    renderTimeline();
    renderBoard();
    renderProductsTable();
    renderTeamMembersTable();
    renderStageDefinitionsTable();
    renderSyncStatus(syncStatus);
    renderEmailSchedule();
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

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function renderEmailSchedule() {
  const schedule = state.emailSchedule;
  if (!schedule) return;
  document.getElementById('email-schedule-day').value = String(schedule.weekday);
  document.getElementById('email-schedule-time').value = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
  document.getElementById('email-schedule-current').textContent =
    `Currently sends every ${WEEKDAY_NAMES[schedule.weekday]} at ${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')} AEST.`;
}

async function saveEmailSchedule() {
  const weekday = Number(document.getElementById('email-schedule-day').value);
  const time = document.getElementById('email-schedule-time').value;
  if (!time) return toast('Pick a time', true);
  const [hour, minute] = time.split(':').map(Number);

  try {
    state.emailSchedule = await api('/email/schedule', { method: 'PUT', body: JSON.stringify({ weekday, hour, minute }) });
    renderEmailSchedule();
    toast('Weekly email schedule updated');
  } catch (e) {
    toast(e.message, true);
  }
}

function renderPercentComplete(pct) {
  return `<div class="percent-bar"><div class="percent-bar-fill" style="width:${pct}%"></div></div><div class="percent-text">${pct}%</div>`;
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
          // Not yet ticked: still show the configured default owner (so you
          // can see who's on the hook before the stage is done), but never a
          // date — it hasn't happened. Marked "default" (dimmed/italic) since
          // it's a prediction, not a confirmed owner for this product.
          const defaultOwner = state.stageDefaults.find((d) => d.stage_key === s.key);
          const ownerName = done ? entry.owner_name || '—' : (defaultOwner && defaultOwner.owner_name) || '';
          const ownerClass = done ? 'stage-meta-owner' : 'stage-meta-owner default';
          return `<td class="stage-cell" data-product-id="${p.id}" data-stage-key="${s.key}">
            <span class="stage-pill ${done ? 'done' : 'pending'}">${done ? '✓' : '—'}</span>
            <div class="stage-meta">
              <div class="${ownerClass}">${ownerName ? escapeHtml(ownerName) : '&nbsp;'}</div>
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
        <td class="col-percent">${renderPercentComplete(p.percent_complete)}</td>
        ${cells}
      </tr>
      <tr class="order-detail-row" data-product-id="${p.id}" style="display:none;">
        <td class="order-detail-cell" colspan="${2 + state.stages.length}">
          <div class="order-detail" id="order-detail-${p.id}"></div>
        </td>
      </tr>`;
    })
    .join('');

  const allSelected = state.products.length > 0 && state.products.every((p) => state.selectedProductIds.has(p.id));

  container.innerHTML = `
    <div class="timeline-scroll">
      <table class="timeline-grid">
        <thead><tr><th class="col-product"><input type="checkbox" class="row-select" id="select-all-rows" ${allSelected ? 'checked' : ''}> Product</th><th class="col-percent">% Complete</th>${stageHeaders}</tr></thead>
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
          <div class="board-card-percent">${renderPercentComplete(p.percent_complete)}</div>
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
  tbody.innerHTML = state.products
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.style_code)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.launch_date ? new Date(p.launch_date).toLocaleDateString() : '—'}</td>
        <td>${p.percent_complete}%</td>
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
      const product = state.products.find((p) => p.id === Number(btn.dataset.id));
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

// ── Milestones (drag to reorder, inline owner, add/edit/remove) ──
let dragSourceKey = null;

function renderStageDefinitionsTable() {
  const container = document.getElementById('milestones-list');
  const list = state.stageDefinitions;
  container.innerHTML = list
    .map((s, i) => {
      const def = state.stageDefaults.find((d) => d.stage_key === s.stage_key);
      return `<div class="milestone-row" data-key="${s.stage_key}">
        <span class="drag-handle" draggable="true" title="Drag to reorder"></span>
        <span class="milestone-index">${i + 1}</span>
        <span class="milestone-name">${escapeHtml(s.label)}</span>
        <span class="milestone-type-badge">${s.type === 'date' ? 'Date' : 'Checkbox'}</span>
        <select class="milestone-owner-select" data-stage-key="${s.stage_key}">
          <option value="">— unassigned —</option>
          ${state.teamMembers.map((m) => `<option value="${m.id}" ${def && def.owner_id === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" data-action="edit-milestone" data-key="${s.stage_key}">Edit</button>
      </div>`;
    })
    .join('');

  container.querySelectorAll('[data-action="edit-milestone"]').forEach((btn) => {
    btn.addEventListener('click', () => openMilestoneModal(btn.dataset.key));
  });

  container.querySelectorAll('.milestone-owner-select').forEach((sel) => {
    sel.addEventListener('change', () => saveMilestoneOwner(sel.dataset.stageKey, sel.value));
  });

  setupMilestoneDragAndDrop(container);
}

function setupMilestoneDragAndDrop(container) {
  container.querySelectorAll('.drag-handle').forEach((handle) => {
    handle.addEventListener('dragstart', (e) => {
      dragSourceKey = handle.closest('.milestone-row').dataset.key;
      e.dataTransfer.effectAllowed = 'move';
    });
    handle.addEventListener('dragend', () => {
      dragSourceKey = null;
      container.querySelectorAll('.milestone-row.drag-over').forEach((row) => row.classList.remove('drag-over'));
    });
  });

  container.querySelectorAll('.milestone-row').forEach((row) => {
    row.addEventListener('dragover', (e) => {
      if (!dragSourceKey) return;
      e.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const targetKey = row.dataset.key;
      if (!dragSourceKey || dragSourceKey === targetKey) return;
      reorderMilestones(dragSourceKey, targetKey);
    });
  });
}

async function reorderMilestones(sourceKey, targetKey) {
  const order = state.stageDefinitions.map((s) => s.stage_key);
  const fromIndex = order.indexOf(sourceKey);
  const toIndex = order.indexOf(targetKey);
  if (fromIndex === -1 || toIndex === -1) return;
  order.splice(fromIndex, 1);
  order.splice(toIndex, 0, sourceKey);

  try {
    state.stageDefinitions = await api('/stage-definitions/reorder', { method: 'PUT', body: JSON.stringify({ order }) });
    renderStageDefinitionsTable();
    loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

async function saveMilestoneOwner(stageKey, ownerId) {
  try {
    await api(`/stage-defaults/${stageKey}`, { method: 'PUT', body: JSON.stringify({ owner_id: ownerId || null }) });
    const d = state.stageDefaults.find((x) => x.stage_key === stageKey);
    if (d) d.owner_id = ownerId ? Number(ownerId) : null;
    toast('Default owner updated');
  } catch (e) {
    toast(e.message, true);
  }
}

function openMilestoneModal(stageKey) {
  const stage = stageKey ? state.stageDefinitions.find((s) => s.stage_key === stageKey) : null;
  document.getElementById('milestone-modal-title').textContent = stage ? 'Edit Milestone' : 'New Milestone';
  document.getElementById('milestone-key').value = stageKey || '';
  document.getElementById('milestone-label').value = stage ? stage.label : '';
  document.getElementById('milestone-type').value = stage ? stage.type : 'boolean';
  document.getElementById('milestone-delete-btn').style.display = stage ? 'inline-block' : 'none';
  openModal('milestone-modal');
}

async function saveMilestone() {
  const stageKey = document.getElementById('milestone-key').value;
  const label = document.getElementById('milestone-label').value;
  const type = document.getElementById('milestone-type').value;
  if (!label.trim()) return toast('Milestone name is required', true);

  try {
    if (stageKey) {
      await api(`/stage-definitions/${stageKey}`, { method: 'PUT', body: JSON.stringify({ label, type }) });
    } else {
      await api('/stage-definitions', { method: 'POST', body: JSON.stringify({ label, type }) });
    }
    closeModal('milestone-modal');
    toast('Milestone saved');
    loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteMilestoneFromModal() {
  const stageKey = document.getElementById('milestone-key').value;
  if (!stageKey) return;
  const stage = state.stageDefinitions.find((s) => s.stage_key === stageKey);
  if (!confirm(`Remove "${stage ? stage.label : 'this milestone'}"? Any progress logged against it for every product will be permanently deleted.`)) return;
  try {
    await api(`/stage-definitions/${stageKey}`, { method: 'DELETE' });
    closeModal('milestone-modal');
    toast('Milestone removed');
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
