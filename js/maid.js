/* ==============================================================
   STATE
   ============================================================== */
let hotelUser = null;
let maidRooms = [];
let inventoryItems = [];
let notifications = [];
let roomStates = {};
let doneCount = 0;
let inProgressCount = 0;
let urgentCount = 0;
let totalRoomsToday = 0;
let mbCount = 0;
let currentFilter = 'all';
const vTitles = { overview: 'Επισκόπηση Βάρδιας', rooms: 'Δωμάτια Βάρδιας', minibar: 'Mini-bar', linen: 'Ιματισμός — Αποστολή & Παραλαβή', stock: 'Αποθεματικό', report: 'Αναφορά Βάρδιας' };

/* ==============================================================
   INIT
   ============================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  try { hotelUser = JSON.parse(localStorage.getItem('hotel_user')); } catch (e) {}
  if (!hotelUser || !['maid', 'admin', 'manager'].includes(hotelUser.Role)) {
    window.location.href = '/pages/login.html';
    return;
  }

  setupUserInfo();
  await loadAllData();

  const loader = document.getElementById('app-loader');
  if (loader) loader.style.display = 'none';
  const app = document.querySelector('.app');
  if (app) app.style.display = 'flex';

  addLog('Έναρξη βάρδιας — ' + (hotelUser ? hotelUser.name || hotelUser.id : 'Καμαριέρα') + ' · ' + new Date().getHours().toString().padStart(2, '0') + ':00');

  renderOverview();
  renderRooms(currentFilter);
  renderStock();
  renderLinen();
  renderPendingMb();
  updateLiveTime();
  setInterval(updateLiveTime, 60000);
});

/* ==============================================================
   NAVIGATION
   ============================================================== */
function navTo(id) {
  document.querySelectorAll('.sb-item').forEach(i => i.classList.toggle('active', i.dataset.v === id));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
  const title = document.getElementById('tb-title');
  if (title) title.textContent = vTitles[id] || id;
  if (id === 'rooms') renderRooms(currentFilter);
  if (id === 'minibar') renderPendingMb();
  if (id === 'stock') renderStock();
  if (id === 'linen') renderLinen();
}
document.querySelectorAll('.sb-item').forEach(el => el.addEventListener('click', () => navTo(el.dataset.v)));

/* ==============================================================
   USER SETUP
   ============================================================== */
function setupUserInfo() {
  const name = hotelUser.name || hotelUser.id || 'Καμαριέρα';
  const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const circle = document.querySelector('.av-circle');
  const nameEl = document.querySelector('.av-name');
  if (circle) circle.textContent = initials;
  if (nameEl) nameEl.textContent = name;
}

/* ==============================================================
   DATA FETCHING
   ============================================================== */
async function loadAllData() {
  await Promise.all([
    fetchMaidRooms(),
    fetchInventory(),
    fetchMaidNotifications(),
    fetchPendingMb()
  ]);
}

async function fetchMaidRooms() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: rooms, error: roomsErr } = await window.supabase
      .from('ROOM')
      .select('RoomNumber, RoomType, BasePrice, Status')
      .order('RoomNumber', { ascending: true });
    if (roomsErr) throw roomsErr;

    const { data: resRooms, error: rrErr } = await window.supabase
      .from('RESERVATION_ROOM')
      .select('RoomNumber, ReservationID');
    if (rrErr) throw rrErr;

    let reservationMap = {};
    let customerMap = {};
    if (resRooms && resRooms.length > 0) {
      const resIds = [...new Set(resRooms.map(r => r.ReservationID))];
      const { data: reservations, error: resErr } = await window.supabase
        .from('RESERVATION')
        .select('ReservationID, CustomerID, CheckInDate, CheckOutDate, Status')
        .in('ReservationID', resIds);
      if (resErr) throw resErr;

      if (reservations) {
        reservations.forEach(r => { reservationMap[r.ReservationID] = r; });
      }

      const custIds = [...new Set(reservations.map(r => r.CustomerID))];
      const { data: customers, error: custErr } = await window.supabase
        .from('CUSTOMER')
        .select('CustomerID, FirstName, LastName')
        .in('CustomerID', custIds);
      if (custErr) throw custErr;

      if (customers) {
        customers.forEach(c => { customerMap[c.CustomerID] = c; });
      }
    }

    const roomByRes = {};
    if (resRooms) {
      resRooms.forEach(rr => { roomByRes[rr.RoomNumber] = rr.ReservationID; });
    }

    maidRooms = (rooms || []).map(r => {
      const resId = roomByRes[r.RoomNumber];
      const res = reservationMap[resId] || null;
      const cust = res ? customerMap[res.CustomerID] : null;
      const guestName = cust ? [cust.FirstName || '', cust.LastName || ''].filter(Boolean).join(' ') : null;
      const checkInToday = res && res.CheckInDate === today;
      const checkOutToday = res && res.CheckOutDate === today;

      let status = null;
      let note = '';
      let guest = '';
      if (r.Status === 'dirty') {
        status = 'urgent';
        note = 'Αναχώρηση — καθαρισμός';
      } else if (r.Status === 'clean') {
        status = 'done';
      } else if (r.Status === 'occ') {
        if (checkOutToday) {
          status = 'urgent';
          note = 'Αναχώρηση σήμερα — καθαρισμός';
        }
      } else if (r.Status === 'free') {
        if (checkOutToday) {
          status = 'urgent';
          note = 'Αναχώρηση σήμερα — καθαρισμός';
        } else if (checkInToday) {
          status = 'priority';
          note = 'Άφιξη σήμερα — προετοιμασία';
          guest = 'Νέος πελάτης';
        }
      }

      return {
        id: r.RoomNumber,
        num: r.RoomNumber.toString(),
        type: r.RoomType || 'Δωμάτιο',
        guest: guestName || guest,
        status: status,
        note: note,
        dbStatus: r.Status,
        basePrice: r.BasePrice,
        hasReservation: !!res
      };
    }).filter(r => r.status !== null);
  } catch (err) {
    console.error('Σφάλμα φόρτωσης δωματίων:', err.message);
    maidRooms = [];
  }
}

async function fetchInventory() {
  try {
    const { data, error } = await window.supabase
      .from('INVENTORY_ITEM')
      .select('*')
      .order('Category', { ascending: true })
      .order('Name', { ascending: true });
    if (error) throw error;
    inventoryItems = data || [];
  } catch (err) {
    console.error('Σφάλμα φόρτωσης αποθέματος:', err.message);
    inventoryItems = [];
  }
}

async function fetchMaidNotifications() {
  try {
    const { data, error } = await window.supabase
      .from('NOTIFICATION')
      .select('NotificationID, Message, Type, CreatedAt, IsRead, ItemID')
      .eq('TargetRole', 'maid')
      .eq('IsRead', false)
      .order('CreatedAt', { ascending: false })
      .limit(20);
    if (error) throw error;
    notifications = data || [];
  } catch (err) {
    console.error('Σφάλμα φόρτωσης ειδοποιήσεων:', err.message);
    notifications = [];
  }
}

async function fetchPendingMb() {
  try {
    const { data, error } = await window.supabase
      .from('MINIBAR_CONSUMPTION')
      .select('ConsumptionID, ReservationID, Quantity, Charge, INVENTORY_ITEM (ItemID, Name)')
      .order('ConsumptionID', { ascending: false })
      .limit(50);
    if (error) throw error;

    if (!data || data.length === 0) {
      pendingMbRecords = [];
      return;
    }

    const resIds = [...new Set(data.map(r => r.ReservationID))];
    const [{ data: resRooms }, { data: reservations }] = await Promise.all([
      window.supabase.from('RESERVATION_ROOM').select('ReservationID, RoomNumber').in('ReservationID', resIds),
      window.supabase.from('RESERVATION').select('ReservationID, Status').in('ReservationID', resIds)
    ]);

    const roomByRes = {};
    (resRooms || []).forEach(rr => { roomByRes[rr.ReservationID] = rr.RoomNumber; });

    const activeRes = new Set();
    (reservations || []).forEach(r => {
      if (r.Status !== 'CheckedOut' && r.Status !== 'Cancelled') activeRes.add(r.ReservationID);
    });

    mbCount = 0;
    pendingMbRecords = (data || []).filter(r => activeRes.has(r.ReservationID)).map(r => {
      mbCount++;
      return {
        id: 'mb-' + r.ConsumptionID,
        room: roomByRes[r.ReservationID] || '-',
        itemName: r.INVENTORY_ITEM?.Name || 'Είδος',
        qty: r.Quantity || 0,
        charge: parseFloat(r.Charge) || 0,
        consumptionId: r.ConsumptionID,
        reservationId: r.ReservationID
      };
    });
  } catch (err) {
    console.error('Σφάλμα φόρτωσης mini-bar:', err.message);
    pendingMbRecords = [];
    mbCount = 0;
  }
}

/* ==============================================================
   LIVE TIME
   ============================================================== */
function updateLiveTime() {
  const el = document.getElementById('live-time');
  if (!el) return;
  const now = new Date();
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  el.textContent = now.toLocaleDateString('el-GR', opts) + ' · Βάρδια 09:00–17:00';
}

/* ==============================================================
   OVERVIEW RENDER
   ============================================================== */
function renderOverview() {
  const urgent = maidRooms.filter(r => r.status === 'urgent');
  const done = maidRooms.filter(r => r.status === 'done');
  const inProg = maidRooms.filter(r => roomStates[r.id] === 'inprogress');
  const all = maidRooms.filter(r => r.status !== 'done' || roomStates[r.id] === 'inprogress');

  totalRoomsToday = all.length + done.length;
  doneCount = done.length;
  inProgressCount = inProg.length;
  urgentCount = urgent.length;

  const totalEl = document.getElementById('ov-total');
  if (totalEl) totalEl.textContent = totalRoomsToday;

  const doneEl = document.getElementById('ov-done');
  if (doneEl) doneEl.textContent = doneCount;

  const progPct = totalRoomsToday > 0 ? Math.round(doneCount / totalRoomsToday * 100) : 0;
  const progPctEl = document.getElementById('ov-progress-pct');
  if (progPctEl) progPctEl.textContent = progPct;
  const progFill = document.getElementById('ov-progress-fill');
  if (progFill) progFill.style.width = progPct + '%';

  const inProgEl = document.getElementById('ov-inprogress');
  if (inProgEl) inProgEl.textContent = inProgressCount;

  const urgentEl = document.getElementById('ov-urgent');
  if (urgentEl) urgentEl.textContent = urgentCount;

  updateBadges();
  updateFilterCounts();

  renderOverviewNotifications();
  renderOverviewRoomList();
  renderOverviewLinen();
}

function renderOverviewNotifications() {
  const container = document.getElementById('ov-notifications');
  if (!container) return;
  const items = [];

  const urgentRooms = maidRooms.filter(r => r.status === 'urgent' && r.guest);
  urgentRooms.slice(0, 3).forEach(r => {
    items.push({ type: 'e', icon: 'alert-triangle', msg: `<strong>${r.num}:</strong> ${r.guest} · ${r.note || 'Αναχώρηση — καθαρισμός'}` });
  });

  const priorityRooms = maidRooms.filter(r => r.status === 'priority');
  priorityRooms.slice(0, 3).forEach(r => {
    items.push({ type: 'w', icon: 'clock', msg: `<strong>${r.num}:</strong> Νέος πελάτης άφιξη σήμερα · Προετοιμασία` });
  });

  notifications.slice(0, 3).forEach(n => {
    const cls = n.Type === 'alert' ? 'e' : 'w';
    const icon = n.Type === 'alert' ? 'alert-triangle' : 'info-circle';
    items.push({ type: cls, icon: icon, msg: n.Message });
  });

  if (items.length === 0) {
    items.push({ type: 'ok', icon: 'circle-check', msg: 'Δεν υπάρχουν ειδοποιήσεις.' });
  }

  container.innerHTML = items.map(i =>
    `<div class="ns ns-${i.type}"><i class="ti ti-${i.icon}" aria-hidden="true"></i><div>${i.msg}</div></div>`
  ).join('');

  const doneRooms = maidRooms.filter(r => r.status === 'done').slice(0, 2);
  if (doneRooms.length > 0) {
    const doneMsg = doneRooms.map(r => r.num).join(', ') + ': Καθαρίστηκαν · Κατάσταση ενημερώθηκε';
    container.innerHTML += `<div class="ns ns-ok"><i class="ti ti-circle-check" aria-hidden="true"></i><div><strong>${doneRooms.map(r => r.num).join(', ')}:</strong> Καθαρίστηκαν · Κατάσταση ενημερώθηκε</div></div>`;
  }
}

function renderOverviewRoomList() {
  const container = document.getElementById('ov-room-list');
  if (!container) return;
  const urgent = maidRooms.filter(r => r.status === 'urgent').slice(0, 3);
  const priority = maidRooms.filter(r => r.status === 'priority').slice(0, 2);
  const pending = maidRooms.filter(r => r.status === 'pending').slice(0, 2);
  const items = [...urgent, ...priority, ...pending];

  if (items.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--color-text-secondary);font-size:12px">Όλα τα δωμάτια είναι καθαρά</div>';
    return;
  }

  container.innerHTML = items.map(r => {
    const pillClass = r.status === 'urgent' ? 'p-r' : r.status === 'priority' ? 'p-a' : 'p-b';
    const pillText = r.status === 'urgent' ? 'Επείγον' : r.status === 'priority' ? 'Προτεραιότητα' : 'Εκκρεμεί';
    const guestText = r.guest || r.note || 'Κανονικός καθαρισμός';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--color-background-secondary);border-radius:var(--border-radius-md)">
      <div><div style="font-weight:500;font-size:12px">${r.num}</div><div style="font-size:11px;color:var(--color-text-secondary)">${guestText}</div></div>
      <span class="pill ${pillClass}">${pillText}</span>
    </div>`;
  }).join('');
}

function renderOverviewLinen() {
  const container = document.getElementById('ov-linen');
  if (!container) return;
  const linenItems = inventoryItems.filter(i => isLinenCategory(i.Category, i.Name)).slice(0, 4);
  if (linenItems.length === 0) {
    container.innerHTML = '<div style="padding:8px;color:var(--color-text-secondary);font-size:12px">Δεν υπάρχουν δεδομένα ιματισμού</div>';
    return;
  }
  container.innerHTML = linenItems.map(item =>
    `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
      <span style="color:var(--color-text-secondary)">${item.Name}</span>
      <span style="font-weight:500">${item.Quantity} τεμ.</span>
    </div>`
  ).join('');
}

function isLinenCategory(cat, name) {
  if (!cat) return false;
  const c = cat.toLowerCase();
  const n = name.toLowerCase();
  const keywords = ['σεντόν', 'πετσέτ', 'μπουρνούζ', 'μαξιλαροθήκ', 'κλινοσκεπάσ', 'πάπλωμ', 'κουβέρτ', 'τραπεζομάντ', 'σεντον', 'πετσετ', 'μπουρνουζ', 'μαξιλαροθηκ'];
  return keywords.some(k => c.includes(k) || n.includes(k));
}

/* ==============================================================
   BADGES
   ============================================================== */
function updateBadges() {
  const badgeRooms = document.getElementById('badge-rooms');
  if (badgeRooms) badgeRooms.textContent = maidRooms.filter(r => r.status !== 'done').length;

  const badgeMb = document.getElementById('badge-mb');
  if (badgeMb) badgeMb.textContent = mbCount;

  const doneEl = document.getElementById('done-count');
  if (doneEl) doneEl.textContent = doneCount;

  const pendEl = document.getElementById('pend-count');
  if (pendEl) pendEl.textContent = maidRooms.filter(r => r.status !== 'done').length;

  const mbCountEl = document.getElementById('mb-count');
  if (mbCountEl) mbCountEl.textContent = mbCount;
}

/* ==============================================================
   ROOMS VIEW
   ============================================================== */
function renderRooms(filter) {
  const data = filter === 'all' ? maidRooms : maidRooms.filter(r => r.status === filter);
  const list = document.getElementById('room-list');
  if (!list) return;
  if (data.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary)">Δεν υπάρχουν δωμάτια για αυτό το φίλτρο.</div>';
    return;
  }
  list.innerHTML = data.map(r => {
    const state = roomStates[r.id] || r.status;
    const isDone = state === 'done';
    const isUrgent = state === 'urgent';
    const isPriority = state === 'priority';
    const isInProgress = state === 'inprogress';
    const pillClass = isDone ? 'p-g' : isUrgent ? 'p-r' : isPriority ? 'p-a' : isInProgress ? 'p-t' : 'p-b';
    const pillText = isDone ? 'Ολοκλ.' : isUrgent ? 'Επείγον' : isPriority ? 'Προτεραιότητα' : isInProgress ? 'Σε εξέλιξη' : 'Εκκρεμεί';
    const guestText = r.guest || (isUrgent ? 'Αναχώρηση' : '');
    return `<div class="room-card ${isUrgent && !isDone ? 'urgent' : ''} ${isDone ? 'done' : ''}" id="rc-${r.id}">
      <div>
        <div class="room-num">${r.num}</div>
        <div class="room-type">${r.type}</div>
      </div>
      <div class="room-info">
        <div style="font-size:12px;font-weight:500">${guestText || 'Κανονικός καθαρισμός'}</div>
        ${r.note ? `<div class="room-guest">${r.note}</div>` : ''}
      </div>
      <div class="room-actions">
        <span class="pill ${pillClass}">${pillText}</span>
        ${!isDone ? `
          ${!isInProgress ? `<button class="btn btn-sm btn-teal" onclick="setRoomInProgress('${r.id}')"><i class="ti ti-player-play" aria-hidden="true"></i> Έναρξη</button>` : ''}
          <button class="btn btn-sm btn-dark" onclick="setRoomDone('${r.id}')"><i class="ti ti-check" aria-hidden="true"></i> Έτοιμο</button>
        ` : '<span style="font-size:11px;color:var(--color-text-secondary)">Ολοκληρώθηκε</span>'}
      </div>
    </div>`;
  }).join('');
}

function updateFilterCounts() {
  const buttons = document.querySelectorAll('#v-rooms .btn-sm[data-filter]');
  buttons.forEach(btn => {
    const f = btn.dataset.filter;
    let count = 0;
    if (f === 'all') count = maidRooms.length;
    else count = maidRooms.filter(r => r.status === f).length;
    const label = btn.textContent.replace(/\(\d+\)$/, '').trim();
    btn.textContent = label + ' (' + count + ')';
  });
}

function filterRooms(f, el) {
  currentFilter = f;
  document.querySelectorAll('#v-rooms .btn-sm[data-filter]').forEach(b => b.style.background = '');
  if (el) el.style.background = 'var(--color-background-secondary)';
  renderRooms(f);
}

function setRoomInProgress(id) {
  roomStates[id] = 'inprogress';
  showToast('room-toast', 'Καθαρισμός σε εξέλιξη...');
  renderRooms(currentFilter);
}

async function setRoomDone(id) {
  const room = maidRooms.find(r => r.id === id);
  if (!room) return;

  const confirmed = await window.showConfirm(`Το δωμάτιο ${room.num} είναι έτοιμο;`);
  if (!confirmed) return;

  roomStates[id] = 'done';
  doneCount++;

  try {
    const { error } = await window.supabase
      .from('ROOM')
      .update({ Status: 'clean' })
      .eq('RoomNumber', id);
    if (error) {
      console.error('Σφάλμα ενημέρωσης δωματίου:', error.message);
      showToast('Σφάλμα ενημέρωσης κατάστασης δωματίου.', 'error');
    } else {
      await window.supabase.from('NOTIFICATION').insert({
        TargetRole: 'receptionist',
        Type: 'room_ready',
        Message: `Δωμάτιο ${room.num} (${room.type}) καθαρίστηκε και είναι έτοιμο.`,
        IsRead: false
      });
    }
  } catch (err) {
    console.error('Σφάλμα:', err.message);
  }

  const pend = document.getElementById('pend-count');
  const done = document.getElementById('done-count');
  if (pend) pend.textContent = Math.max(0, parseInt(pend.textContent) - 1);
  if (done) done.textContent = doneCount;
  const badgeRooms = document.getElementById('badge-rooms');
  if (badgeRooms) badgeRooms.textContent = Math.max(0, parseInt(badgeRooms.textContent) - 1);
  const rptDone = document.getElementById('rpt-done');
  if (rptDone) rptDone.textContent = doneCount;
  const prog = document.querySelector('.prog-fill');
  const total = parseInt(document.getElementById('ov-total')?.textContent || '1') || 1;
  if (prog) prog.style.width = Math.round(doneCount / totalRoomsToday * 100) + '%';
  showToast('room-toast', room.num + ' — Έτοιμο! Ειδοποιήθηκε η υποδοχή.');
  addLog(room.num + ' καθαρίστηκε — κατάσταση ενημερώθηκε στην υποδοχή');
  renderRooms(currentFilter);
  renderOverview();
}

/* ==============================================================
   MINI-BAR VIEW
   ============================================================== */
function renderPendingMb() {
  const list = document.getElementById('mb-list');
  if (!list) return;

  if (pendingMbRecords.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--color-text-secondary);font-size:12px">Δεν υπάρχουν εκκρεμείς χρεώσεις mini-bar.</div>';
    return;
  }

  list.innerHTML = pendingMbRecords.map(r =>
    `<div class="minibar-row" id="${r.id}">
      <div class="mb-room">${r.room}</div>
      <div class="mb-items">${r.qty}× ${r.itemName}</div>
      <div class="mb-total">€${r.charge.toFixed(2)}</div>
      <span class="pill p-r" style="margin-left:4px">Εκκρ.</span>
      <button class="btn btn-sm btn-teal" onclick="chargeMb('${r.id}', ${r.consumptionId})">Καταχώρηση</button>
    </div>`
  ).join('');
}

async function chargeMb(rowId, consumptionId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.querySelector('.pill').className = 'pill p-g';
  row.querySelector('.pill').textContent = 'OK';
  const btn = row.querySelector('.btn-teal');
  if (btn) { btn.disabled = true; btn.style.opacity = '.4'; }

  mbCount = Math.max(0, mbCount - 1);
  document.getElementById('mb-count').textContent = mbCount;
  document.getElementById('badge-mb').textContent = mbCount;

  pendingMbRecords = pendingMbRecords.filter(r => r.consumptionId !== consumptionId);

  const record = pendingMbRecords.find(r => r.consumptionId === consumptionId);
  addLog('Mini-bar ' + (record ? record.room : '') + ' — €' + (record ? record.charge.toFixed(2) : '?') + ' χρεώθηκε στον λογαριασμό πελάτη');
}

async function submitNewMb() {
  const roomNum = document.getElementById('mb-room-inp').value.trim();
  const itemsText = document.getElementById('mb-items-inp').value.trim();
  const total = parseFloat(document.getElementById('mb-total-inp').value);

  if (!roomNum) { alert('Εισάγετε αριθμό δωματίου.'); return; }
  if (!total || total <= 0) { alert('Εισάγετε έγκυρο σύνολο χρέωσης.'); return; }

  try {
    const { data: rrData, error: rrErr } = await window.supabase
      .from('RESERVATION_ROOM')
      .select('ReservationID')
      .eq('RoomNumber', roomNum);

    if (rrErr) throw rrErr;

    let reservationId = null;
    if (rrData && rrData.length > 0) {
      const ids = rrData.map(r => r.ReservationID);
      const { data: resData } = await window.supabase
        .from('RESERVATION')
        .select('ReservationID')
        .in('ReservationID', ids)
        .neq('Status', 'Cancelled')
        .neq('Status', 'CheckedOut')
        .limit(1);
      if (resData && resData.length > 0) reservationId = resData[0].ReservationID;
    }

    let itemId = null;
    const itemMatch = inventoryItems.find(i => itemsText.toLowerCase().includes(i.Name.toLowerCase()));
    if (itemMatch) itemId = itemMatch.ItemID;

    if (!itemId && inventoryItems.length > 0) {
      itemId = inventoryItems[0].ItemID;
    }

    const insertData = {
      ReservationID: reservationId || 0,
      ItemID: itemId || 0,
      Quantity: 1,
      Charge: total
    };

    if (!reservationId) {
      addLog('Προσοχή: Δεν βρέθηκε ενεργή κράτηση για το δωμάτιο ' + roomNum + ' — η χρέωση καταχωρήθηκε με ReservationID=0');
    }

    const { error: insertErr } = await window.supabase
      .from('MINIBAR_CONSUMPTION')
      .insert([insertData]);

    if (insertErr) throw insertErr;

    showToast('mb-toast');
    document.getElementById('mb-room-inp').value = '';
    document.getElementById('mb-items-inp').value = '';
    document.getElementById('mb-total-inp').value = '';
    addLog('Νέα χρέωση mini-bar ' + roomNum + ' — €' + total.toFixed(2));
    await fetchPendingMb();
    renderPendingMb();
    updateBadges();
  } catch (err) {
    console.error('Σφάλμα καταχώρησης mini-bar:', err.message);
    alert('Σφάλμα καταχώρησης. Δοκιμάστε ξανά.');
  }
}

/* ==============================================================
   STOCK VIEW
   ============================================================== */
function renderStock() {
  const tbody = document.getElementById('stock-body');
  if (!tbody) return;
  if (inventoryItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--color-text-secondary)">Δεν υπάρχουν είδη στην αποθήκη.</td></tr>';
    return;
  }
  tbody.innerHTML = inventoryItems.map(item => {
    let statusHtml = '';
    let statusClass = 'p-g';
    let statusText = 'Επαρκές';
    if (item.Quantity === 0) { statusClass = 'p-r'; statusText = 'Εξαντλήθηκε'; }
    else if (item.Quantity <= item.MinThreshold) { statusClass = 'p-a'; statusText = 'Οριακό Απόθεμα'; }
    return `<tr>
      <td><strong>${item.Name}</strong></td>
      <td>${item.Category || '-'}</td>
      <td>${item.Quantity}</td>
      <td>${item.MinThreshold}</td>
      <td><span class="pill ${statusClass}">${statusText}</span></td>
      <td>${item.Quantity <= item.MinThreshold ? `<button class="btn btn-sm btn-warn" onclick="reportLowStock(${item.ItemID},'${item.Name}')">Αναφορά</button>` : '—'}</td>
    </tr>`;
  }).join('');
}

async function reportLowStock(itemId, itemName) {
  try {
    await window.supabase.from('NOTIFICATION').insert({
      TargetRole: 'manager',
      Type: 'restock',
      Message: `Χαμηλό απόθεμα: ${itemName} (ID: ${itemId}) — παρακαλώ παραγγελία.`,
      IsRead: false
    });
    showToast('rep-toast', 'Αναφορά για ' + itemName + ' εστάλη στον διαχειριστή.');
    addLog('Αναφορά χαμηλού αποθέματος: ' + itemName);
  } catch (err) {
    console.error('Σφάλμα αναφοράς:', err.message);
    alert('Σφάλμα αποστολής αναφοράς.');
  }
}

/* ==============================================================
   LINEN VIEW
   ============================================================== */
function renderLinen() {
  renderLinenSendList();
  renderLinenReceiveTable();
}

function renderLinenSendList() {
  const linenItems = inventoryItems.filter(i => isLinenCategory(i.Category, i.Name));
  const container = document.getElementById('linen-send-list');
  if (!container) return;

  const headerHtml = `<div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:5px 0;border-bottom:0.5px solid var(--color-border-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--color-text-secondary)">
    <span>Είδος</span><span style="text-align:center">Απόθεμα</span><span style="text-align:center">Ελάχ. Απόθ.</span>
  </div>`;

  if (linenItems.length === 0) {
    container.innerHTML = headerHtml + '<div style="text-align:center;padding:1rem;color:var(--color-text-secondary);font-size:12px">Δεν βρέθηκαν είδη ιματισμού στη βάση.</div>';
    return;
  }

  const rowsHtml = linenItems.map(item => {
    const belowThreshold = item.Quantity < item.MinThreshold ? 'style="color:#D85A30;font-weight:500"' : '';
    return `<div class="linen-row">
      <div class="linen-name"><i class="ti ti-bed" aria-hidden="true" style="font-size:14px;margin-right:5px"></i>${item.Name}</div>
      <div class="linen-qty"><input type="number" value="${item.Quantity}" min="0" style="width:60px;padding:3px 5px;font-size:12px;border:0.5px solid var(--color-border-secondary);border-radius:var(--border-radius-md);background:var(--color-background-primary);color:var(--color-text-primary)"></div>
      <div class="linen-min" ${belowThreshold}>${item.MinThreshold}</div>
    </div>`;
  }).join('');

  container.innerHTML = headerHtml + rowsHtml;

  const alerts = document.getElementById('linen-alerts');
  if (alerts) {
    const below = linenItems.filter(i => i.Quantity < i.MinThreshold);
    if (below.length > 0) {
      alerts.innerHTML = below.map(i =>
        `<div class="ns ns-w" style="margin-bottom:0;margin-top:6px"><i class="ti ti-info-circle" aria-hidden="true"></i><div>${i.Name} (${i.Quantity}) κάτω από ελάχ. απόθεμα (${i.MinThreshold})</div></div>`
      ).join('');
    } else {
      alerts.innerHTML = '';
    }
  }
}

function renderLinenReceiveTable() {
  const tbody = document.getElementById('linen-receive-body');
  if (!tbody) return;
  const linenItems = inventoryItems.filter(i => isLinenCategory(i.Category, i.Name));
  if (linenItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--color-text-secondary)">Δεν υπάρχουν δεδομένα</td></tr>';
    return;
  }
  tbody.innerHTML = linenItems.map(item => {
    const statusClass = item.Quantity >= item.MinThreshold ? 'p-g' : 'p-a';
    const statusText = item.Quantity >= item.MinThreshold ? 'OK' : 'Χαμηλό απόθεμα';
    return `<tr>
      <td>${item.Name}</td>
      <td>${item.Quantity}</td>
      <td>${item.MinThreshold}</td>
      <td><span class="pill ${statusClass}">${statusText}</span></td>
      <td><button class="btn btn-sm" onclick="addLog('Παραλαβή ${item.Name} — επιβεβαιώθηκε')"><i class="ti ti-check" aria-hidden="true"></i></button></td>
    </tr>`;
  }).join('');
}

function submitLinen() {
  showToast('linen-toast');
  addLog('Αποστολή ιματισμού στο καθαριστήριο καταχωρήθηκε');
}

/* ==============================================================
   REPORT VIEW
   ============================================================== */
function submitReport() {
  const notes = document.getElementById('rep-notes');
  const noteText = notes ? notes.value.trim() : '';
  showToast('rep-toast');
  addLog('Αναφορά βάρδιας εστάλη στη διοίκηση' + (noteText ? ': ' + noteText : ''));
}

/* ==============================================================
   TOAST
   ============================================================== */
function showToast(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  const sp = el.querySelector('span');
  if (sp && msg) sp.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}

/* ==============================================================
   LOGOUT
   ============================================================== */
function logout() {
  localStorage.removeItem('hotel_user');
  window.location.href = '/pages/login.html';
}

/* ==============================================================
   LOG
   ============================================================== */
const logList = document.getElementById('log-list');

function addLog(msg) {
  if (!logList) return;
  const now = new Date();
  const t = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-bottom:0.5px solid var(--color-border-tertiary)';
  d.innerHTML = `<span style="font-size:11px;color:var(--color-text-secondary);min-width:36px;flex-shrink:0">${t}</span><span style="width:7px;height:7px;border-radius:50%;background:#1D9E75;flex-shrink:0;margin-top:3px"></span><span>${msg}</span>`;
  logList.insertBefore(d, logList.firstChild);
}


