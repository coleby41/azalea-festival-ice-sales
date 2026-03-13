// ---- CONFIG ----
// Paste your Google Apps Script Web App URL here after deploying
const SHEET_URL = '';

// ---- STATE ----
let orders = JSON.parse(localStorage.getItem('pvmc_ice_orders') || '[]');
let currentFilter = 'all';
let orderCounter = orders.length ? Math.max(...orders.map(o => o.num)) : 0;

function save() { localStorage.setItem('pvmc_ice_orders', JSON.stringify(orders)); }

// ---- SHEET SYNC ----
async function sheetPost(payload) {
  if (!SHEET_URL) return;
  try {
    await fetch(SHEET_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('Sheet sync failed:', err);
  }
}

async function sheetGet(params) {
  if (!SHEET_URL) return null;
  try {
    const url = SHEET_URL + '?' + new URLSearchParams(params);
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    console.warn('Sheet fetch failed:', err);
    return null;
  }
}


function selectToggle(groupId, val) {
  document.querySelectorAll(`#${groupId} .toggle-opt`).forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
    if (groupId === 'festival-toggle' && b.dataset.val === 'yes') {
      b.classList.toggle('festival', b.dataset.val === val && val === 'yes');
    }
  });
}
function getToggleVal(groupId) {
  const active = document.querySelector(`#${groupId} .toggle-opt.active`);
  return active ? active.dataset.val : null;
}
function onFestivalToggle() {
  const isFestival = getToggleVal('festival-toggle') === 'yes';
  document.getElementById('festival-note').style.display = isFestival ? 'block' : 'none';
  document.getElementById('payment-field').style.display = isFestival ? 'none' : 'block';
  updatePrice();
}

// ---- PRICE ----
function adjustBags(delta) {
  const el = document.getElementById('bags');
  el.value = Math.max(1, parseInt(el.value || 1) + delta);
  updatePrice();
}
function updatePrice() {
  const bags  = parseInt(document.getElementById('bags').value) || 0;
  const price = parseFloat(document.getElementById('price-per-bag').value) || 0;
  const isFestival = getToggleVal('festival-toggle') === 'yes';
  const total = bags * price;
  const display = isFestival
    ? `<span style="font-size:.8rem;color:var(--azalea-dk);font-weight:700">$${total.toFixed(2)} <span style="font-weight:500;opacity:.8">— excluded from revenue</span></span>`
    : '$' + total.toFixed(2);
  document.getElementById('price-total').innerHTML = display;
}

// ---- SUBMIT ORDER ----
function submitOrder() {
  const phone       = document.getElementById('phone').value.trim();
  const contactName = document.getElementById('contact-name').value.trim();
  const vendorName  = document.getElementById('vendor-name').value.trim();
  const bags        = parseInt(document.getElementById('bags').value) || 0;
  const takenBy     = document.getElementById('taken-by').value.trim();
  const price       = parseFloat(document.getElementById('price-per-bag').value) || 0;
  const isFestival  = getToggleVal('festival-toggle') === 'yes';
  const payment     = getToggleVal('payment-toggle') || 'pay-now';

  if (!phone || !contactName || !vendorName || bags < 1 || !takenBy) {
    showToast('⚠️ Please fill in all required fields', '#E8A830', '#1A2744');
    return;
  }

  orderCounter++;
  const order = {
    num: orderCounter,
    id: Date.now(),
    phone,
    contactName,
    vendorName,
    bags,
    pricePerBag: price,
    total: bags * price,   // always store real amount
    isFestival,            // true = show amount but exclude from revenue total
    payment,               // 'pay-now' | 'credit'
    status: 'pending',
    takenBy,
    time: new Date().toISOString()
  };

  orders.unshift(order);
  save();
  sheetPost({ action: 'newOrder', ...order });

  // Reset form
  document.getElementById('phone').value = '';
  document.getElementById('contact-name').value = '';
  document.getElementById('vendor-name').value = '';
  document.getElementById('bags').value = 1;
  document.getElementById('taken-by').value = '';
  // Reset toggles to blank
  document.querySelectorAll('#festival-toggle .toggle-opt, #payment-toggle .toggle-opt').forEach(b => b.classList.remove('active'));
  document.getElementById('festival-note').style.display = 'none';
  document.getElementById('payment-field').style.display = 'none';
  updatePrice();

  showToast('✅ Order #' + order.num + ' submitted!');
  renderDash();
}

// ---- TOAST ----
function showToast(msg, bg, color) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  if (bg) t.style.background = bg;
  if (color) t.style.color = color;
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); t.style.background=''; t.style.color=''; }, 2800);
}

// ---- PAGES ----
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'dash') {
    renderDash();
    loadFromSheet();
  }
}

async function loadFromSheet() {
  if (!SHEET_URL) return;
  const indicator = document.getElementById('sync-indicator');
  if (indicator) { indicator.textContent = '🔄 Syncing…'; indicator.style.opacity = '1'; }
  const result = await sheetGet({ action: 'getOrders' });
  if (result && result.ok && Array.isArray(result.orders) && result.orders.length > 0) {
    // Merge sheet data — sheet is source of truth
    orders = result.orders.map(o => ({ ...o, id: o.id || o.num }));
    orderCounter = Math.max(...orders.map(o => o.num), orderCounter);
    save();
    renderDash();
    if (indicator) { indicator.textContent = '✅ Synced'; setTimeout(() => { indicator.style.opacity = '0'; }, 2000); }
  } else {
    if (indicator) { indicator.textContent = SHEET_URL ? '⚠️ Sync failed' : ''; indicator.style.opacity = SHEET_URL ? '1' : '0'; setTimeout(() => { indicator.style.opacity = '0'; }, 3000); }
  }
}

// ---- FILTER (multi-select) ----
// activeFilters: Set of statuses. Empty set = show all.
let activeFilters = new Set(); // empty = "All" mode

function toggleFilter(f, btn) {
  if (f === 'all') {
    // "All" clears everything and shows all
    activeFilters.clear();
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderOrderList();
    return;
  }

  // Remove "All" highlight when picking a specific status
  const allBtn = document.querySelector('.filter-btn[data-filter="all"]');

  if (activeFilters.has(f)) {
    // Deselect this filter
    activeFilters.delete(f);
    btn.classList.remove('active');
    // If nothing selected, revert to All
    if (activeFilters.size === 0) {
      allBtn.classList.add('active');
    }
  } else {
    // First specific selection — switch from All mode
    if (activeFilters.size === 0) allBtn.classList.remove('active');
    activeFilters.add(f);
    btn.classList.add('active');
  }
  renderOrderList();
}

// ---- RENDER DASHBOARD ----
function renderDash() {
  const nonFestival = orders.filter(o => !o.isFestival);
  const totalBags   = orders.reduce((s, o) => s + o.bags, 0);
  const totalRev    = nonFestival.reduce((s, o) => s + o.total, 0);
  const payNowAmt   = nonFestival.filter(o => o.payment !== 'credit').reduce((s, o) => s + o.total, 0);
  const creditAmt   = nonFestival.filter(o => o.payment === 'credit').reduce((s, o) => s + o.total, 0);

  document.getElementById('stat-total').textContent   = orders.length;
  document.getElementById('stat-bags').textContent    = totalBags;
  document.getElementById('stat-revenue').textContent = '$' + totalRev.toFixed(0);
  document.getElementById('stat-paynow').textContent  = '$' + payNowAmt.toFixed(0);
  document.getElementById('stat-credit').textContent  = '$' + creditAmt.toFixed(0);
  renderOrderList();
}

function renderOrderList() {
  const list = document.getElementById('orders-list');
  const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

  let filtered = activeFilters.size === 0
    ? orders
    : orders.filter(o => activeFilters.has(o.status));

  if (query) {
    filtered = filtered.filter(o =>
      (o.vendorName   || '').toLowerCase().includes(query) ||
      (o.contactName  || '').toLowerCase().includes(query) ||
      (o.phone        || '').toLowerCase().includes(query) ||
      (o.takenBy      || '').toLowerCase().includes(query) ||
      String(o.num).includes(query)
    );
  }

  if (filtered.length === 0) {
    const msg = query ? `No orders matching "${query}"` : activeFilters.size > 0 ? 'No orders with selected status' : 'No orders yet';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🧊</div><p>${msg}</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(order => {
    const festBadge = order.isFestival
      ? `<span style="background:rgba(201,75,140,.12);color:var(--azalea-dk);padding:.15rem .55rem;border-radius:999px;font-size:.72rem;font-weight:700;">🌸 Festival Office</span>`
      : '';
    const payBadge = order.payment === 'credit'
      ? `<span style="background:#DBEAFE;color:#1E40AF;padding:.15rem .55rem;border-radius:999px;font-size:.72rem;font-weight:700;">📋 Credit</span>`
      : `<span style="background:#D0F0E3;color:#065F46;padding:.15rem .55rem;border-radius:999px;font-size:.72rem;font-weight:700;">💵 Pay Now</span>`;
    // Always show real dollar amount; festival orders flagged with strikethrough + note
    const revenueDisplay = order.isFestival
      ? `<span style="font-size:.82rem;font-weight:700;color:var(--muted);text-decoration:line-through">$${order.total.toFixed(2)}</span>
         <span style="font-size:.7rem;color:var(--azalea-dk);font-weight:600">excl. from revenue</span>`
      : `<span style="font-size:.82rem;font-weight:700;color:var(--earth)">$${order.total.toFixed(2)}</span>`;

    return `
    <div class="order-card" id="order-${order.id}">
      <div class="order-card-top">
        <div class="order-info">
          <div class="order-num">Order #${order.num} · ${formatDateTime(order.time)}</div>
          <div class="order-name">🏪 ${order.vendorName}</div>
          <div class="order-meta">
            <span>👤 ${order.contactName}</span>
            <span>📞 ${formatPhone(order.phone)}</span>
          </div>
        </div>
        <div class="order-right">
          <div class="order-bags-badge">🧊 ${order.bags} bag${order.bags !== 1 ? 's' : ''}</div>
          ${statusPill(order.status)}
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.15rem">
            ${revenueDisplay}
          </div>
          <div style="display:flex;gap:.3rem;flex-wrap:wrap;justify-content:flex-end;margin-top:.1rem">
            ${payBadge}${festBadge ? festBadge : ''}
          </div>
        </div>
      </div>
      <div class="order-card-actions">
        <span class="action-label">Status:</span>
        <select class="status-select" onchange="updateStatus(${order.id}, this.value)">
          <option value="pending"   ${order.status === 'pending'   ? 'selected' : ''}>⏳ Pending</option>
          <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>🔄 Preparing</option>
          <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>✅ Delivered</option>
          <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>❌ Cancelled</option>
        </select>
        <span class="order-taken-by">by ${order.takenBy}</span>
        <button class="btn-edit-card" onclick="openEditModal(${order.id})">✏️ Edit</button>
      </div>
    </div>
  `}).join('');
}

function statusPill(s) {
  const map = {
    pending:   ['⏳', 'Pending',   'status-pending'],
    preparing: ['🔄', 'Preparing', 'status-preparing'],
    delivered: ['✅', 'Delivered', 'status-delivered'],
    cancelled: ['❌', 'Cancelled', 'status-cancelled'],
  };
  const [icon, label, cls] = map[s] || map.pending;
  return `<span class="status-pill ${cls}">${icon} ${label}</span>`;
}

function updateStatus(id, newStatus) {
  const o = orders.find(x => x.id === id);
  if (o) {
    o.status = newStatus;
    save();
    sheetPost({ action: 'updateStatus', orderNum: o.num, status: newStatus });
    renderDash();
    showToast('✅ Status updated');
  }
}

function clearAllOrders() {
  if (confirm('Clear ALL orders? This cannot be undone.')) {
    orders = [];
    orderCounter = 0;
    localStorage.removeItem('pvmc_ice_orders');
    renderDash();
    showToast('🗑 All orders cleared', '#E03535');
  }
}


// ---- EDIT MODAL ----
let editingId = null;

function openEditModal(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  editingId = id;

  document.getElementById('modal-order-num').textContent = '#' + o.num;
  document.getElementById('edit-phone').value         = o.phone || '';
  document.getElementById('edit-contact-name').value  = o.contactName || '';
  document.getElementById('edit-vendor-name').value   = o.vendorName || '';
  document.getElementById('edit-bags').value          = o.bags || 1;
  document.getElementById('edit-price-per-bag').value = o.pricePerBag || 10;
  document.getElementById('edit-taken-by').value      = o.takenBy || '';

  selectToggle('edit-festival-toggle', o.isFestival ? 'yes' : 'no');
  selectToggle('edit-payment-toggle',  o.payment || 'pay-now');
  document.getElementById('edit-payment-field').style.display = o.isFestival ? 'none' : 'block';
  updateEditPrice();

  document.getElementById('edit-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('open');
  document.body.style.overflow = '';
  editingId = null;
}

function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('edit-modal')) closeModal();
}

function adjustEditBags(delta) {
  const el = document.getElementById('edit-bags');
  el.value = Math.max(1, parseInt(el.value || 1) + delta);
  updateEditPrice();
}

function updateEditPrice() {
  const bags  = parseInt(document.getElementById('edit-bags').value) || 0;
  const price = parseFloat(document.getElementById('edit-price-per-bag').value) || 0;
  const isFestival = getToggleVal('edit-festival-toggle') === 'yes';
  const total = bags * price;
  const display = isFestival
    ? `<span style="font-size:.8rem;color:var(--azalea-dk);font-weight:700">$${total.toFixed(2)} <span style="font-weight:500;opacity:.8">— excluded from revenue</span></span>`
    : '$' + total.toFixed(2);
  document.getElementById('edit-price-total').innerHTML = display;
}

function saveEdit() {
  const o = orders.find(x => x.id === editingId);
  if (!o) return;

  const bags  = parseInt(document.getElementById('edit-bags').value) || 0;
  const price = parseFloat(document.getElementById('edit-price-per-bag').value) || 0;

  o.phone       = document.getElementById('edit-phone').value.trim();
  o.contactName = document.getElementById('edit-contact-name').value.trim();
  o.vendorName  = document.getElementById('edit-vendor-name').value.trim();
  o.bags        = bags;
  o.pricePerBag = price;
  o.total       = bags * price;
  o.isFestival  = getToggleVal('edit-festival-toggle') === 'yes';
  o.payment     = getToggleVal('edit-payment-toggle') || 'pay-now';
  o.takenBy     = document.getElementById('edit-taken-by').value.trim();

  save();
  sheetPost({ action: 'updateOrder', orderNum: o.num, ...o });
  closeModal();
  renderDash();
  showToast('✅ Order #' + o.num + ' updated!');
}

function deleteOrder() {
  const o = orders.find(x => x.id === editingId);
  if (!o) return;
  if (confirm(`Delete Order #${o.num}? This cannot be undone.`)) {
    sheetPost({ action: 'deleteOrder', orderNum: o.num });
    orders = orders.filter(x => x.id !== editingId);
    save();
    closeModal();
    renderDash();
    showToast('🗑 Order deleted', '#E03535');
  }
}

function formatPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return p;
}

function formatDateTime(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}