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

  setInterval(async () => {
    await fetchMaidRooms();
    await fetchMaidNotifications();
    await fetchPendingMb();
    recomputeCounters();
    if (document.getElementById('v-rooms')?.classList.contains('active')) {
      renderRooms(currentFilter);
    }
    if (document.getElementById('v-minibar')?.classList.contains('active')) {
      renderPendingMb();
    }
    renderOverview();
  }, 30000);
});

/* ==============================================================
   EFFECTIVE STATUS & COUNTER RECOMPUTE
   ============================================================== */

function getEffectiveStatus(roomId) {
  if (roomStates[roomId]) return roomStates[roomId];
  const room = maidRooms.find(r => r.id === roomId);
  return room ? room.status : 'pending';
}

function recomputeCounters() {
  if (maidRooms.length === 0) {
    const el = document.getElementById('done-count');
    if (el) el.textContent = '0';
    const totalEl = document.getElementById('total-count');
    if (totalEl) totalEl.textContent = '0';
    const pendEl = document.getElementById('pend-count');
    if (pendEl) pendEl.textContent = '0';
    const badgeRooms = document.getElementById('badge-rooms');
    if (badgeRooms) badgeRooms.textContent = '0';
    const badgeMb = document.getElementById('badge-mb');
    if (badgeMb) badgeMb.textContent = mbCount;
    const mbEl = document.getElementById('mb-count');
    if (mbEl) mbEl.textContent = mbCount;
    return;
  }

  const counts = { done: 0, urgent: 0, priority: 0, pending: 0, inprogress: 0 };
  maidRooms.forEach(r => {
    const s = getEffectiveStatus(r.id);
    counts[s] = (counts[s] || 0) + 1;
  });

  const doneCount = counts.done || 0;
  const urgentCount = counts.urgent || 0;
  const inProgressCount = counts.inprogress || 0;
  const pendingCount = maidRooms.length - doneCount;

  const totalEl = document.getElementById('total-count');
  if (totalEl) totalEl.textContent = maidRooms.length;
  const doneEl = document.getElementById('done-count');
  if (doneEl) doneEl.textContent = doneCount;
  const pendEl = document.getElementById('pend-count');
  if (pendEl) pendEl.textContent = pendingCount;
  const badgeRooms = document.getElementById('badge-rooms');
  if (badgeRooms) badgeRooms.textContent = pendingCount;

  const badgeMb = document.getElementById('badge-mb');
  if (badgeMb) badgeMb.textContent = mbCount;
  const mbEl = document.getElementById('mb-count');
  if (mbEl) mbEl.textContent = mbCount;

  const ovTotal = document.getElementById('ov-total');
  if (ovTotal) ovTotal.textContent = maidRooms.length;
  const ovDone = document.getElementById('ov-done');
  if (ovDone) ovDone.textContent = doneCount;
  const ovInProg = document.getElementById('ov-inprogress');
  if (ovInProg) ovInProg.textContent = inProgressCount;
  const ovUrgent = document.getElementById('ov-urgent');
  if (ovUrgent) ovUrgent.textContent = urgentCount;
  const ovPct = document.getElementById('ov-progress-pct');
  const ovFill = document.querySelector('.prog-fill');
  const pct = maidRooms.length > 0 ? Math.round(doneCount / maidRooms.length * 100) : 0;
  if (ovPct) ovPct.textContent = pct;
  if (ovFill) ovFill.style.width = pct + '%';

  const rptDone = document.getElementById('rpt-done');
  if (rptDone) rptDone.textContent = doneCount;

  updateFilterCounts();
}

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
  const rptDate = document.getElementById('rpt-date');
  if (rptDate) rptDate.textContent = new Date().toLocaleDateString('el-GR');
  await computeReportStats();
  renderOverview();
  recomputeCounters();
}

async function fetchMaidRooms() {
  const prevRoomIds = new Set(maidRooms.map(r => r.id));
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

    maidRooms = rooms.map(r => {
      const guests = rrMap[r.RoomNumber];
      let status = 'pending';
      let note = '';
      if (r.Status === 'dirty') {
        status = 'urgent';
        note = 'Check-out — Απαιτείται καθαρισμός';
      } else if (r.Status === 'cleaning') {
        status = 'inprogress';
        note = 'Καθαρισμός σε εξέλιξη';
      } else if (r.Status === 'clean' || r.Status === 'free') {
        status = 'done';
      }
      if (guests && guests.length > 0) {
        note = guests.join(', ');
        if (r.Status === 'occ') status = 'priority';
      }
      return {
        id: String(r.RoomNumber),
        num: r.RoomNumber,
        type: r.RoomType || 'Standard',
        status: status,
        origStatus: r.Status,
        guest: guests ? guests.join(', ') : null,
        note: note
      };
    });

    const newIds = new Set(maidRooms.map(r => r.id));
    for (const id of Object.keys(roomStates)) {
      if (!newIds.has(id)) delete roomStates[id];
      else if (roomStates[id] === 'done') {
        const room = maidRooms.find(r => r.id === id);
        if (room && (room.status === 'done')) delete roomStates[id];
      }
    }
    for (const id of Object.keys(roomStates)) {
      if (roomStates[id] === 'inprogress') {
        const room = maidRooms.find(r => r.id === id);
        if (room && room.origStatus !== 'dirty' && room.origStatus !== 'cleaning') {
          delete roomStates[id];
        }
      }
    }

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
      reservationId: d.ReservationID,
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
  const list = document.getElementById('ov-notifications');
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
  const urgent = maidRooms.filter(r => getEffectiveStatus(r.id) === 'urgent').slice(0, 5);
  const priority = maidRooms.filter(r => getEffectiveStatus(r.id) === 'priority').slice(0, 5);
  const items = [...urgent, ...priority];
  if (items.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary)">Καμία εκκρεμότητα</div>';
    return;
  }
  list.innerHTML = items.map(r => {
    const st = getEffectiveStatus(r.id);
    const isUrg = st === 'urgent';
    const label = isUrg ? 'Check-out' : 'Προτεραιότητα';
    return `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
      <span style="font-weight:600;font-size:12px;min-width:50px">${r.num}</span>
      <span style="font-size:11px;color:var(--color-text-secondary);flex:1">${r.note || r.guest || r.type}</span>
      <span class="pill ${isUrg ? 'p-r' : 'p-a'}">${label}</span>
      <button class="btn btn-sm ${isUrg ? 'btn-teal' : ''}" style="font-size:10px" onclick="window.navTo('rooms')">
        ${isUrg ? 'Καθαρισμός' : 'Εξυπηρέτηση'} <i class="ti ti-arrow-right" aria-hidden="true"></i>
      </button>
    </div>`;
  }).join('');
}

function renderOverviewLinen() {
  const el = document.getElementById('ov-linen');
  if (!el) return;
  el.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);padding:4px 0">Παρακολούθηση ιματισμού στην καρτέλα Ιματισμός</div>';
}

const isLinenCategory = (cat, name) => ['linen', 'towel', 'robe', 'sheet', 'pillow', 'bedding', 'bath'].some(k => (cat || '').toLowerCase().includes(k) || (name || '').toLowerCase().includes(k));

/* ==============================================================
   ROOMS VIEW
   ============================================================== */
function renderRooms(filter) {
  const data = filter === 'all'
    ? maidRooms.filter(r => getEffectiveStatus(r.id) !== 'done')
    : maidRooms.filter(r => getEffectiveStatus(r.id) === filter);
  const list = document.getElementById('room-list');
  if (!list) return;
  if (data.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary)">Δεν υπάρχουν δωμάτια για αυτό το φίλτρο.</div>';
    return;
  }
  list.innerHTML = data.map(r => {
    const state = getEffectiveStatus(r.id);
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
        ${isDone && filter === 'done'
          ? `<button class="btn btn-sm" onclick="window.undoRoomDone('${r.id}')"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Αναίρεση</button>`
          : !isDone ? `
          ${isInProgress
            ? `<button class="btn btn-sm btn-dark" onclick="window.setRoomDone('${r.id}')"><i class="ti ti-check" aria-hidden="true"></i> Ολοκλήρωση</button>`
            : isUrgent
              ? `<button class="btn btn-sm btn-teal" onclick="window.setRoomInProgress('${r.id}')"><i class="ti ti-player-play" aria-hidden="true"></i> Καθαρισμός</button>`
              : isPriority
                ? `<button class="btn btn-sm btn-teal" onclick="window.setRoomInProgress('${r.id}')"><i class="ti ti-player-play" aria-hidden="true"></i> Εξυπηρέτηση</button>`
                : `<button class="btn btn-sm btn-teal" onclick="window.setRoomInProgress('${r.id}')"><i class="ti ti-player-play" aria-hidden="true"></i> Έναρξη</button>`
          }
          <button class="btn btn-sm" onclick="window.reportRoomIssue('${r.id}')"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Αναφορά</button>`
          : '<span style="font-size:11px;color:var(--color-text-secondary)">Ολοκληρώθηκε</span>'}
      </div>
    </div>`;
  }).join('');
}

function updateFilterCounts() {
  const buttons = document.querySelectorAll('#v-rooms .btn-sm[data-filter]');
  buttons.forEach(btn => {
    const f = btn.dataset.filter;
    let count = 0;
    if (f === 'all') {
      count = maidRooms.filter(r => getEffectiveStatus(r.id) !== 'done').length;
    } else {
      count = maidRooms.filter(r => getEffectiveStatus(r.id) === f).length;
    }
    const label = (btn.textContent || '').replace(/\(\d+\)$/, '').trim();
    btn.textContent = label + ' (' + count + ')';
  });
}

window.filterRooms = function(f, el) {
  currentFilter = f;
  document.querySelectorAll('#v-rooms .btn-sm[data-filter]').forEach(b => b.style.background = '');
  if (el) el.style.background = 'var(--color-background-secondary)';
  renderRooms(f);
};

window.setRoomInProgress = async function(id) {
  const room = maidRooms.find(r => r.id === id);
  const actionLabel = room && room.status === 'urgent' ? 'Καθαρισμός' : room && room.status === 'priority' ? 'Εξυπηρέτηση' : 'Έναρξη';
  try {
    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'receptionist',
      Type: 'room_in_progress',
      Message: `Δωμάτιο ${id}: ${actionLabel} σε εξέλιξη από καμαριέρα.`,
      IsRead: false
    });
    if (room && room.origStatus === 'dirty') {
      await supabase.from('ROOM').update({ Status: 'cleaning' }).eq('RoomNumber', id);
    }
  } catch (err) {
    console.error('Σφάλμα καταγραφής έναρξης:', err.message);
  }

  roomStates[id] = 'inprogress';

  try {
    showToast('room-toast', (room ? room.num : id) + ' — ' + actionLabel + ' σε εξέλιξη...');
    currentFilter = 'all';
    document.querySelectorAll('#v-rooms .btn-sm[data-filter]').forEach(b => b.style.background = '');
    const allBtn = document.querySelector('#v-rooms .btn-sm[data-filter="all"]');
    if (allBtn) allBtn.style.background = 'var(--color-background-secondary)';
    recomputeCounters();
    renderRooms(currentFilter);
  } catch (e) {
    console.error('setRoomInProgress error:', e);
    showToast('room-toast', 'Σφάλμα: ' + e.message);
  }
};

window.setRoomDone = async function(id) {
  const room = maidRooms.find(r => r.id === id);
  if (!room) return;

  const confirmed = await window.showConfirm(`Το δωμάτιο ${room.num} είναι έτοιμο;`);
  if (!confirmed) return;

  const targetStatus = room.origStatus === 'occ' ? 'occ' : 'clean';

  try {
    const { error } = await supabase
      .from('ROOM')
      .update({ Status: targetStatus })
      .eq('RoomNumber', id);
    if (error) {
      console.error('Σφάλμα ενημέρωσης δωματίου:', error.message);
      showToast('room-toast', 'Σφάλμα ενημέρωσης κατάστασης δωματίου.');
      return;
    }
    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'receptionist',
      Type: 'room_ready',
      Message: `Δωμάτιο ${room.num} (${room.type}) καθαρίστηκε και είναι έτοιμο.`,
      IsRead: false
    });
  } catch (err) {
    console.error('Σφάλμα:', err.message);
    showToast('room-toast', 'Σφάλμα ενημέρωσης: ' + err.message);
    return;
  }

  roomStates[id] = 'done';

  const statusLabel = room.status === 'urgent' ? 'check-out' : room.status === 'priority' ? 'διαμονή' : 'καθαρισμός';
  recomputeCounters();
  showToast('room-toast', room.num + ' — Έτοιμο! Ειδοποιήθηκε η υποδοχή.');
  addLog(room.num + ' — ' + statusLabel + ' ολοκληρώθηκε, ειδοποιήθηκε η υποδοχή');
  renderRooms(currentFilter);
  renderOverview();
};

window.reportRoomIssue = async function(id) {
  const room = maidRooms.find(r => r.id === id);
  if (!room) return;
  const desc = prompt('Περιγράψτε το πρόβλημα για το δωμάτιο ' + room.num + ':');
  if (!desc || !desc.trim()) return;
  try {
    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'admin',
      Type: 'room_issue',
      Message: `Πρόβλημα δωματίου ${room.num} (${room.type}): ${desc.trim()}`,
      IsRead: false
    });
    showToast('room-toast', 'Αναφορά για ' + room.num + ' εστάλη στον διαχειριστή.');
    addLog('Αναφορά προβλήματος ' + room.num + ': ' + desc.trim());
  } catch (err) {
    alert('Σφάλμα αποστολής αναφοράς: ' + err.message);
  }
};

window.undoRoomDone = async function(id) {
  const room = maidRooms.find(r => r.id === id);
  if (!room) return;
  const confirmed = await window.showConfirm('Επαναφορά δωματίου ' + room.num + ' σε εκκρεμότητα;');
  if (!confirmed) return;

  const revertStatus = room.origStatus === 'occ' ? 'occ' : 'dirty';

  try {
    const { error } = await supabase
      .from('ROOM')
      .update({ Status: revertStatus })
      .eq('RoomNumber', id);
    if (error) {
      console.error('Σφάλμα επαναφοράς δωματίου:', error.message);
      showToast('room-toast', 'Σφάλμα επαναφοράς κατάστασης δωματίου.');
      return;
    }
    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'receptionist',
      Type: 'room_reverted',
      Message: `Δωμάτιο ${room.num} (${room.type}) επαναφέρθηκε σε εκκρεμότητα από την καμαριέρα.`,
      IsRead: false
    });
  } catch (err) {
    console.error('Σφάλμα:', err.message);
    showToast('room-toast', 'Σφάλμα επαναφοράς: ' + err.message);
    return;
  }
  delete roomStates[id];
  recomputeCounters();
  showToast('room-toast', room.num + ' επαναφέρθηκε σε εκκρεμότητα.');
  addLog(room.num + ' επαναφέρθηκε σε εκκρεμότητα');
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
  const record = pendingMbRecords.find(r => r.consumptionId === consumptionId);
  if (!record) return;

  try {
    if (record.reservationId && record.reservationId !== 0) {
      const { error: recErr } = await supabase.from('RECEIPT').insert({
        ReservationID: record.reservationId,
        PaymentDate: new Date().toISOString(),
        Amount: record.charge,
        Category: 'minibar'
      });
      if (recErr) throw recErr;
    }
    await supabase.from('MINIBAR_CONSUMPTION').delete().eq('ConsumptionID', consumptionId);
  } catch (err) {
    console.error('Σφάλμα καταχώρησης χρέωσης:', err.message);
    showToast('room-toast', 'Σφάλμα καταχώρησης χρέωσης minibar.');
    return;
  }

  row.querySelector('.pill').className = 'pill p-g';
  row.querySelector('.pill').textContent = 'OK';
  const btn = row.querySelector('.btn-teal');
  if (btn) { btn.disabled = true; btn.style.opacity = '.4'; }

  mbCount = Math.max(0, mbCount - 1);
  pendingMbRecords = pendingMbRecords.filter(r => r.consumptionId !== consumptionId);
  recomputeCounters();

  addLog('Mini-bar χρέωση #' + consumptionId + ' — €' + record.charge.toFixed(2) + ' καταχωρήθηκε');
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

    const statusSel = document.getElementById('mb-status-sel');
    if (statusSel && statusSel.value === 'Προς καθαρισμό') {
      await supabase.from('ROOM').update({ Status: 'dirty' }).eq('RoomNumber', roomNum);
    }

    showToast('mb-toast');
    document.getElementById('mb-room-inp').value = '';
    document.getElementById('mb-items-inp').value = '';
    document.getElementById('mb-total-inp').value = '';
    addLog('Νέα χρέωση mini-bar ' + roomNum + ' — €' + total.toFixed(2));
    await fetchPendingMb();
    renderPendingMb();
    recomputeCounters();
  } catch (err) {
    alert('Σφάλμα υποβολής: ' + err.message);
  }
};

/* ==============================================================
   STOCK VIEW
   ============================================================== */
function renderStock() {
  const list = document.getElementById('stock-body');
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
  const table = document.getElementById('linen-receive-body');
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
        <td style="padding:6px"><button class="btn btn-sm" onclick="window.receiveLinen(${item.ItemID}, '${item.Name}')"><i class="ti ti-check" aria-hidden="true"></i></button></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

window.receiveLinen = async function(itemId, itemName) {
  if (!confirm(`Επιβεβαίωση παραλαβής ${itemName};`)) return;
  try {
    const item = inventoryItems.find(i => i.ItemID === itemId);
    if (!item) return;
    const qty = parseInt(prompt('Ποσότητα προς παραλαβή:', '10'), 10);
    if (!qty || qty <= 0) return;
    await supabase.from('INVENTORY_ITEM').update({ Quantity: item.Quantity + qty }).eq('ItemID', itemId);
    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'admin', Type: 'linen_received', IsRead: false,
      Message: `Παραλαβή ιματισμού: ${qty} τεμάχια ${itemName}.`
    });
    addLog(`Παραλαβή ${itemName}: ${qty} τεμάχια`);
    await fetchInventory();
    renderLinenReceiveTable();
  } catch (err) {
    console.error('Σφάλμα παραλαβής:', err.message);
    alert('Σφάλμα: ' + err.message);
  }
};

window.submitLinen = async function() {
  const linenItems = inventoryItems.filter(i => isLinenCategory(i.Category, i.Name) && i.Name);
  let totalSent = 0;
  let totalItems = 0;

  for (const item of linenItems) {
    const inp = document.getElementById('ls-qty-' + item.ItemID);
    if (!inp) continue;
    const qty = parseInt(inp.value, 10);
    if (!qty || qty <= 0) continue;
    totalItems++;
    totalSent += qty;
    try {
      await supabase.from('INVENTORY_ITEM').update({ Quantity: Math.max(0, item.Quantity - qty) }).eq('ItemID', item.ItemID);
    } catch (err) {
      console.error('Σφάλμα ενημέρωσης αποθέματος:', err.message);
    }
  }

  if (totalItems > 0) {
    try {
      await supabase.from('NOTIFICATION').insert({
        TargetRole: 'admin', Type: 'linen_sent', IsRead: false,
        Message: `Αποστολή ιματισμού: ${totalSent} τεμάχια (${totalItems} είδη) στάλθηκαν στο καθαριστήριο.`
      });
    } catch (err) { console.error(err); }
    addLog(`Ιματισμός: ${totalSent} τεμάχια στάλθηκαν στο καθαριστήριο`);
  }

  await fetchInventory();
  showToast('linen-toast');
};

/* ==============================================================
   REPORT STATS
   ============================================================== */
async function computeReportStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { count: mbCount, error: mbErr } = await supabase
      .from('RECEIPT')
      .select('*', { count: 'exact', head: true })
      .eq('Category', 'minibar')
      .gte('PaymentDate', today);
    if (!mbErr) {
      const mbEl = document.getElementById('rpt-mb-charges');
      if (mbEl) mbEl.textContent = mbCount || 0;
    }
    const { count: linenCount, error: lnErr } = await supabase
      .from('NOTIFICATION')
      .select('*', { count: 'exact', head: true })
      .eq('Type', 'linen_sent')
      .gte('CreatedAt', today);
    if (!lnErr) {
      const lnEl = document.getElementById('rpt-linen-sent');
      if (lnEl) lnEl.textContent = (linenCount || 0) + ' αποστολές';
    }
  } catch (e) {
    console.error('computeReportStats error:', e);
  }
}

/* ==============================================================
   REPORT VIEW
   ============================================================== */
window.submitReport = async function() {
  const notes = document.getElementById('rep-notes');
  const noteText = notes ? notes.value.trim() : '';
  const doneEl = document.getElementById('rpt-done');
  const doneVal = doneEl ? doneEl.textContent : '0';
  const msg = `Αναφορά βάρδιας — Ολοκληρωμένα δωμάτια: ${doneVal}.${noteText ? ' Σημειώσεις: ' + noteText : ''}`;
  try {
    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'admin', Type: 'shift_report', Message: msg, IsRead: false
    });
    showToast('rep-toast');
    addLog('Αναφορά βάρδιας εστάλη στη διοίκηση' + (noteText ? ': ' + noteText : ''));
  } catch (err) {
    console.error('Σφάλμα αποστολής αναφοράς:', err.message);
    alert('Σφάλμα: ' + err.message);
  }
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
