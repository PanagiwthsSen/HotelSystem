import { supabase } from './supabase-config.js';
import { updateLiveTime } from './utils/ui.js';

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
  const app = document.querySelector('.app');
  if (loader) loader.style.display = 'none';
  if (app) app.style.display = 'flex';

  const btnAll = document.querySelector('#v-rooms .btn-sm[data-filter="all"]');
  if (btnAll) btnAll.style.background = 'var(--color-background-secondary)';

  updateLiveTime();
  setInterval(updateLiveTime, 60000);
});

/* ==============================================================
   NAVIGATION
   ============================================================== */
window.navTo = function(id) {
  document.querySelectorAll('.sb-item').forEach(i => i.classList.toggle('active', i.dataset.v === id));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
  document.getElementById('tb-title').textContent = vTitles[id] || id;
  if (id === 'rooms') renderRooms(currentFilter);
  if (id === 'minibar') renderPendingMb();
  if (id === 'stock') renderStock();
  if (id === 'linen') renderLinen();
};

document.querySelectorAll('.sb-item').forEach(el => el.addEventListener('click', () => window.navTo(el.dataset.v)));

/* ==============================================================
   SETUP USER INFO
   ============================================================== */
function setupUserInfo() {
  const avCircle = document.querySelector('.av-circle');
  const avName = document.querySelector('.av-name');
  const avShift = document.querySelector('.av-shift');
  if (avCircle) avCircle.textContent = (hotelUser.name ? hotelUser.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() : 'Κ');
  if (avName) avName.textContent = hotelUser.name || 'Καμαριέρα';
  if (avShift) avShift.textContent = 'Σήμερα';
}

/* ==============================================================
   DATA LOADING (SUPABASE)
   ============================================================== */
async function loadAllData() {
  try {
    await Promise.all([
      fetchMaidRooms(),
      fetchInventory(),
      fetchMaidNotifications(),
      fetchPendingMb()
    ]);
  } catch (e) {
    console.error('Σφάλμα φόρτωσης δεδομένων:', e);
  }
  renderOverview();
  updateBadges();
}

async function fetchMaidRooms() {
  try {
    const { data: rooms, error: roomsErr } = await supabase
      .from('ROOM')
      .select('RoomNumber, RoomType, Status')
      .order('RoomNumber', { ascending: true });
    if (roomsErr) throw roomsErr;
    if (!rooms) return;

    const { data: resRooms, error: rrErr } = await supabase
      .from('RESERVATION_ROOM')
      .select('ReservationID, RoomNumber');
    if (rrErr) throw rrErr;

    const rrMap = {};
    if (resRooms) {
      const ids = [...new Set(resRooms.map(r => r.ReservationID))];
      if (ids.length > 0) {
        const { data: reservations, error: resErr } = await supabase
          .from('RESERVATION')
          .select('ReservationID, CUSTOMER(FirstName, LastName)')
          .in('ReservationID', ids)
          .not('Status', 'in', '("Cancelled","CheckedOut")');
        if (!resErr && reservations) {
          const custMap = {};
          reservations.forEach(r => {
            const c = r.CUSTOMER || {};
            custMap[r.ReservationID] = `${c.FirstName || ''} ${c.LastName || ''}`.trim() || 'Επισκέπτης';
          });
          resRooms.forEach(rr => {
            if (custMap[rr.ReservationID]) {
              if (!rrMap[rr.RoomNumber]) rrMap[rr.RoomNumber] = [];
              rrMap[rr.RoomNumber].push(custMap[rr.ReservationID]);
            }
          });
        }
      }
    }

    const { data: customers, error: custErr } = await supabase
      .from('CUSTOMER')
      .select('CustomerID, FirstName, LastName');
    if (custErr) throw custErr;

    maidRooms = rooms.map(r => {
      const guests = rrMap[r.RoomNumber];
      let status = 'pending';
      let note = '';
      if (r.Status === 'dirty') {
        status = 'urgent';
        note = 'Check-out — Απαιτείται καθαρισμός';
      } else if (r.Status === 'clean' || r.Status === 'free') {
        status = 'done';
      }
      if (guests && guests.length > 0) {
        note = guests.join(', ');
        if (r.Status === 'occ') status = 'priority';
      }
      return {
        id: r.RoomNumber,
        num: r.RoomNumber,
        type: r.RoomType || 'Standard',
        status: status,
        guest: guests ? guests.join(', ') : null,
        note: note
      };
    });

    urgentCount = maidRooms.filter(r => r.status === 'urgent').length;
    totalRoomsToday = maidRooms.length;
  } catch (e) {
    console.error('fetchMaidRooms error:', e);
  }
}

async function fetchInventory() {
  try {
    const { data, error } = await supabase
      .from('INVENTORY_ITEM')
      .select('*');
    if (error) throw error;
    inventoryItems = data || [];
  } catch (e) {
    console.error('fetchInventory error:', e);
  }
}

async function fetchMaidNotifications() {
  try {
    const { data, error } = await supabase
      .from('NOTIFICATION')
      .select('*')
      .in('TargetRole', ['maid', 'both'])
      .eq('IsRead', false)
      .order('CreatedAt', { ascending: false });
    if (error) throw error;
    notifications = data || [];
  } catch (e) {
    console.error('fetchMaidNotifications error:', e);
  }
}

async function fetchPendingMb() {
  try {
    const now = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('MINIBAR_CONSUMPTION')
      .select('*, RESERVATION(CheckInDate, CheckOutDate, RESERVATION_ROOM(RoomNumber))')
      .not('ReservationID', 'is', null);
    if (error) throw error;
    if (!data || data.length === 0) { mbCount = 0; pendingMbRecords = []; return; }

    const resIds = [...new Set(data.filter(d => d.ReservationID && d.ReservationID !== 0).map(d => d.ReservationID))];
    if (resIds.length === 0) { mbCount = 0; pendingMbRecords = []; return; }

    const [rrRes, resRes] = await Promise.all([
      supabase.from('RESERVATION_ROOM').select('ReservationID, RoomNumber').in('ReservationID', resIds),
      supabase.from('RESERVATION').select('ReservationID, Status').in('ReservationID', resIds)
    ]);

    const rrMap = {};
    (rrRes.data || []).forEach(rr => { if (!rrMap[rr.ReservationID]) rrMap[rr.ReservationID] = []; rrMap[rr.ReservationID].push(rr.RoomNumber); });
    const activeIds = new Set((resRes.data || []).filter(r => r.Status !== 'Cancelled' && r.Status !== 'CheckedOut').map(r => r.ReservationID));

    pendingMbRecords = data.filter(d => activeIds.has(d.ReservationID)).map(d => ({
      id: 'mb-' + d.ConsumptionID,
      consumptionId: d.ConsumptionID,
      room: (rrMap[d.ReservationID] || ['—']).join(', '),
      itemName: d.ItemID ? 'Είδος #' + d.ItemID : 'Γενική χρέωση',
      qty: d.Quantity,
      charge: d.Charge
    }));
    mbCount = pendingMbRecords.length;
  } catch (e) {
    console.error('fetchPendingMb error:', e);
    mbCount = 0;
    pendingMbRecords = [];
  }
}

let pendingMbRecords = [];

/* ==============================================================
   OVERVIEW
   ============================================================== */
function renderOverview() {
  renderOverviewNotifications();
  renderOverviewRoomList();
  renderOverviewLinen();
}

function renderOverviewNotifications() {
  const list = document.getElementById('ov-notif');
  if (!list) return;
  if (notifications.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary)">Καμία νέα ειδοποίηση</div>';
    return;
  }
  list.innerHTML = notifications.slice(0, 5).map(n =>
    `<div style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
      <i class="ti ti-bell" style="color:#378ADD;font-size:14px;margin-top:2px"></i>
      <span style="font-size:12px;line-height:1.3">${n.Message || '—'}</span>
    </div>`
  ).join('');
}

function renderOverviewRoomList() {
  const list = document.getElementById('ov-room-list');
  if (!list) return;
  const urgent = maidRooms.filter(r => r.status === 'urgent').slice(0, 5);
  const priority = maidRooms.filter(r => r.status === 'priority').slice(0, 5);
  const items = [...urgent, ...priority];
  if (items.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary)">Καμία εκκρεμότητα</div>';
    return;
  }
  list.innerHTML = items.map(r =>
    `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
      <span style="font-weight:600;font-size:12px;min-width:50px">${r.num}</span>
      <span style="font-size:11px;color:var(--color-text-secondary);flex:1">${r.note || r.guest || r.type}</span>
      <span class="pill ${r.status === 'urgent' ? 'p-r' : 'p-a'}">${r.status === 'urgent' ? 'Check-out' : 'Προτεραιότητα'}</span>
    </div>`
  ).join('');
}

function renderOverviewLinen() {
  const el = document.getElementById('ov-linen');
  if (!el) return;
  el.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);padding:4px 0">Παρακολούθηση ιματισμού στην καρτέλα Ιματισμός</div>';
}

const isLinenCategory = (cat, name) => ['linen', 'towel', 'robe', 'sheet', 'pillow', 'bedding', 'bath'].some(k => (cat || '').toLowerCase().includes(k) || (name || '').toLowerCase().includes(k));

function updateBadges() {
  const bRooms = document.getElementById('badge-rooms');
  if (bRooms) bRooms.textContent = maidRooms.filter(r => r.status !== 'done').length;
  const bNotif = document.getElementById('badge-notifications');
  if (bNotif) bNotif.textContent = notifications.length;
  const bMb = document.getElementById('badge-mb');
  if (bMb) bMb.textContent = mbCount;
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
          ${!isInProgress ? `<button class="btn btn-sm btn-teal" onclick="window.setRoomInProgress('${r.id}')"><i class="ti ti-player-play" aria-hidden="true"></i> Έναρξη</button>` : ''}
          <button class="btn btn-sm btn-dark" onclick="window.setRoomDone('${r.id}')"><i class="ti ti-check" aria-hidden="true"></i> Έτοιμο</button>
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

window.filterRooms = function(f, el) {
  currentFilter = f;
  document.querySelectorAll('#v-rooms .btn-sm[data-filter]').forEach(b => b.style.background = '');
  if (el) el.style.background = 'var(--color-background-secondary)';
  renderRooms(f);
};

window.setRoomInProgress = function(id) {
  roomStates[id] = 'inprogress';
  showToast('room-toast', 'Καθαρισμός σε εξέλιξη...');
  renderRooms(currentFilter);
};

window.setRoomDone = async function(id) {
  const room = maidRooms.find(r => r.id === id);
  if (!room) return;

  const confirmed = await window.showConfirm(`Το δωμάτιο ${room.num} είναι έτοιμο;`);
  if (!confirmed) return;

  roomStates[id] = 'done';
  doneCount++;

  try {
    const { error } = await supabase
      .from('ROOM')
      .update({ Status: 'clean' })
      .eq('RoomNumber', id);
    if (error) {
      console.error('Σφάλμα ενημέρωσης δωματίου:', error.message);
      showToast('Σφάλμα ενημέρωσης κατάστασης δωματίου.', 'error');
    } else {
      await supabase.from('NOTIFICATION').insert({
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
};

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
      <button class="btn btn-sm btn-teal" onclick="window.chargeMb('${r.id}', ${r.consumptionId})">Καταχώρηση</button>
    </div>`
  ).join('');
}

window.chargeMb = async function(rowId, consumptionId) {
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
};

window.submitNewMb = async function() {
  const roomNum = document.getElementById('mb-room-inp').value.trim();
  const itemsText = document.getElementById('mb-items-inp').value.trim();
  const total = parseFloat(document.getElementById('mb-total-inp').value);

  if (!roomNum) { alert('Εισάγετε αριθμό δωματίου.'); return; }
  if (!total || total <= 0) { alert('Εισάγετε έγκυρο σύνολο χρέωσης.'); return; }

  try {
    const { data: rrData, error: rrErr } = await supabase
      .from('RESERVATION_ROOM')
      .select('ReservationID')
      .eq('RoomNumber', roomNum);

    if (rrErr) throw rrErr;

    let reservationId = null;
    if (rrData && rrData.length > 0) {
      const ids = rrData.map(r => r.ReservationID);
      const { data: resData } = await supabase
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

    const { error: insertErr } = await supabase
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
    alert('Σφάλμα υποβολής: ' + err.message);
  }
};

/* ==============================================================
   STOCK VIEW
   ============================================================== */
function renderStock() {
  const list = document.getElementById('stock-list');
  if (!list) return;

  if (inventoryItems.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary)">Δεν υπάρχουν καταχωρημένα υλικά.</div>';
    return;
  }

  list.innerHTML = inventoryItems.map(item => {
    const isLow = item.Quantity <= (item.MinThreshold || 0);
    return `<div class="minibar-row">
      <div class="mb-room">${item.ItemID}</div>
      <div class="mb-items"><strong>${item.Name}</strong></div>
      <div class="mb-total" style="font-size:12px">${item.Quantity} ${item.Unit || 'τεμ.'}</div>
      <span class="pill ${isLow ? 'p-r' : 'p-g'}">${isLow ? 'Χαμηλό' : 'Επαρκές'}</span>
      ${isLow ? `<button class="btn btn-sm btn-dark" onclick="window.reportLowStock(${item.ItemID}, '${item.Name}')"><i class="ti ti-bell" aria-hidden="true"></i></button>` : ''}
    </div>`;
  }).join('');
}

window.reportLowStock = async function(itemId, itemName) {
  try {
    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'admin',
      Type: 'low_stock',
      Message: `Ελλιπές απόθεμα: ${itemName} (ID: ${itemId}) — Απαιτείται παραγγελία.`,
      IsRead: false
    });
    showToast('rep-toast', 'Αναφορά για ' + itemName + ' εστάλη στον διαχειριστή.');
  } catch (err) {
    alert('Σφάλμα: ' + err.message);
  }
};

/* ==============================================================
   LINEN VIEW
   ============================================================== */
function renderLinen() {
  renderLinenSendList();
  renderLinenReceiveTable();
}

function renderLinenSendList() {
  const list = document.getElementById('linen-send-list');
  if (!list) return;
  const linenItems = inventoryItems.filter(i => isLinenCategory(i.Category, i.Name) && i.Name);
  if (linenItems.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);padding:1rem">Δεν βρέθηκαν είδη ιματισμού στην αποθήκη.</div>';
    return;
  }
  list.innerHTML = linenItems.map(item => {
    const qtyId = 'ls-qty-' + item.ItemID;
    return `<div class="minibar-row" style="padding:8px 0">
      <div class="mb-room" style="min-width:120px">${item.Name}</div>
      <div class="mb-items" style="font-size:12px;color:var(--color-text-secondary)">Διαθέσιμο: ${item.Quantity}</div>
      <input type="number" id="${qtyId}" class="fg-inp" style="width:70px" placeholder="0" min="0" value="0">
    </div>`;
  }).join('');

  const allDiv = document.createElement('div');
  allDiv.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--color-border-tertiary)';
  allDiv.innerHTML = `
    <button class="btn btn-sm" onclick="document.querySelectorAll('#v-linen input[type=number]').forEach(i => i.value = i.closest('.minibar-row').querySelector('.mb-items').textContent.replace('Διαθέσιμο: ','').trim())"><i class="ti ti-select-all"></i> Όλα</button>
    <span style="font-size:11px;color:var(--color-text-secondary)">Αυτόματη συμπλήρωση διαθέσιμων ποσοτήτων</span>`;
  list.appendChild(allDiv);
}

function renderLinenReceiveTable() {
  const table = document.getElementById('linen-receive-table');
  if (!table) return;
  const receiving = inventoryItems.filter(i => isLinenCategory(i.Category, i.Name) && i.Name);
  if (receiving.length === 0) {
    table.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);padding:1rem">Καμία προηγούμενη καταχώρηση παραλαβής.</div>';
    return;
  }
  table.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="border-bottom:1px solid var(--color-border-tertiary);text-align:left"><th style="padding:6px">Είδος</th><th style="padding:6px">Τελευταία Παραλαβή</th><th style="padding:6px">Κατάσταση</th><th style="padding:6px"></th></tr></thead>
    <tbody>${receiving.map(item => {
      const statusClass = item.Quantity > 0 ? 'p-g' : 'p-r';
      const statusText = item.Quantity > 0 ? 'Επαρκές' : 'Ελλιπές';
      return `<tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
        <td style="padding:6px">${item.Name}</td>
        <td style="padding:6px;color:var(--color-text-secondary)">—</td>
        <td style="padding:6px"><span class="pill ${statusClass}">${statusText}</span></td>
        <td style="padding:6px"><button class="btn btn-sm" onclick="window.addLog('Παραλαβή ${item.Name} — επιβεβαιώθηκε')"><i class="ti ti-check" aria-hidden="true"></i></button></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

window.submitLinen = function() {
  showToast('linen-toast');
  addLog('Αποστολή ιματισμού στο καθαριστήριο καταχωρήθηκε');
};

/* ==============================================================
   REPORT VIEW
   ============================================================== */
window.submitReport = function() {
  const notes = document.getElementById('rep-notes');
  const noteText = notes ? notes.value.trim() : '';
  showToast('rep-toast');
  addLog('Αναφορά βάρδιας εστάλη στη διοίκηση' + (noteText ? ': ' + noteText : ''));
};

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
window.logout = function() {
  localStorage.removeItem('hotel_user');
  window.location.href = '/pages/login.html';
};

/* ==============================================================
   LOG
   ============================================================== */
const logList = document.getElementById('log-list');

function addLog(msg) {
  if (!logList) return;
  const now = new Date();
  window.addLog = addLog;
  const t = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-bottom:0.5px solid var(--color-border-tertiary)';
  d.innerHTML = `<span style="font-size:11px;color:var(--color-text-secondary);min-width:36px;flex-shrink:0">${t}</span><span style="width:7px;height:7px;border-radius:50%;background:#1D9E75;flex-shrink:0;margin-top:3px"></span><span>${msg}</span>`;
  logList.insertBefore(d, logList.firstChild);
}
