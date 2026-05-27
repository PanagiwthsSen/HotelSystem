import { supabase } from './supabase-config.js';
import { updateLiveTime } from './utils/ui.js';
import { fetchRooms, mapDbStatusToUI } from './services/api.js';
import { renderRoomMap } from './components/RoomMap.js';

/* ==============================================================
   STATE
   ============================================================== */
let hotelUser = null;
let maidRooms = [];
let inventoryItems = [];
let notifications = [];
let currentFilter = 'all';
let departures = [];
let completedRooms = [];
const vTitles = { overview: 'Επισκόπηση Βάρδιας', rooms: 'Δωμάτια Βάρδιας', linen: 'Ιματισμός — Αποστολή & Παραλαβή', stock: 'Αποθεματικό', report: 'Αναφορά Βάρδιας', laundry: 'Διαχείριση Ιματισμού' };

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

  /* Real-time subscriptions (live updates) */
  function subscribeToChanges() {
    supabase.channel('maid-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ROOM' }, async () => {
        await fetchMaidRooms();
        recomputeCounters();
        if (document.getElementById('v-rooms')?.classList.contains('active')) renderRooms(currentFilter);
        renderOverview();
      }).subscribe();

    supabase.channel('maid-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'NOTIFICATION' }, async () => {
        await fetchMaidNotifications();
        renderOverview();
      }).subscribe();

    supabase.channel('maid-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'RESERVATION' }, async () => {
        await fetchTodayDepartures();
        recomputeCounters();
        if (document.getElementById('v-rooms')?.classList.contains('active')) renderRooms(currentFilter);
        renderOverview();
      }).subscribe();

    supabase.channel('maid-inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'INVENTORY_ITEM' }, async () => {
        await fetchInventory();
        recomputeCounters();
        if (document.getElementById('v-stock')?.classList.contains('active')) renderStock();
        if (document.getElementById('v-linen')?.classList.contains('active')) renderLinen();
        renderOverview();
      }).subscribe();

    supabase.channel('maid-laundry')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'LAUNDRY_DISPATCH' }, async () => {
        await fetchLaundryDispatches();
        if (document.getElementById('v-laundry')?.classList.contains('active')) {
          renderLaundryDispatchForm();
          renderLaundryReceiveSelect();
          if (currentLaundrySub === 'history') renderLaundryHistory();
        }
      }).subscribe();

    supabase.channel('maid-laundry-receive')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'LAUNDRY_RECEIVE' }, async () => {
        await fetchLaundryReceives();
        if (document.getElementById('v-laundry')?.classList.contains('active')) {
          renderLaundryReceiveSelect();
          if (currentLaundrySub === 'history') renderLaundryHistory();
          if (currentLaundrySub === 'receive') renderLaundryReceiveForm();
        }
      }).subscribe();

    supabase.channel('maid-laundry-damage')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'LAUNDRY_DAMAGE' }, async () => {
        await fetchLaundryDamages();
        if (document.getElementById('v-laundry')?.classList.contains('active') && currentLaundrySub === 'damage') {
          renderLaundryDamages();
        }
      }).subscribe();

    supabase.channel('maid-inventory-updated')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'INVENTORY_ITEM' }, async () => {
        await fetchInventory();
        if (document.getElementById('v-laundry')?.classList.contains('active')) {
          if (currentLaundrySub === 'dispatch') renderLaundryDispatchForm();
          if (currentLaundrySub === 'receive') renderLaundryReceiveForm();
        }
        if (document.getElementById('v-stock')?.classList.contains('active')) renderStock();
        if (document.getElementById('v-linen')?.classList.contains('active')) renderLinen();
      }).subscribe();
  }
  subscribeToChanges();

  /* Fallback polling every 2 minutes in case WebSocket disconnects */
  setInterval(async () => {
    await fetchMaidRooms();
    await fetchMaidNotifications();
    await fetchTodayDepartures();
    await fetchInventory();
    await fetchLaundryDispatches();
    await fetchLaundryReceives();
    await fetchLaundryDamages();
    recomputeCounters();
    if (document.getElementById('v-rooms')?.classList.contains('active')) renderRooms(currentFilter);
    if (document.getElementById('v-stock')?.classList.contains('active')) renderStock();
    if (document.getElementById('v-linen')?.classList.contains('active')) renderLinen();
    if (document.getElementById('v-laundry')?.classList.contains('active')) {
      if (currentLaundrySub === 'dispatch') renderLaundryDispatchForm();
      if (currentLaundrySub === 'receive') { renderLaundryReceiveSelect(); renderLaundryReceiveForm(); }
      if (currentLaundrySub === 'history') renderLaundryHistory();
      if (currentLaundrySub === 'damage') renderLaundryDamages();
    }
    renderOverview();
  }, 120000);

  window.addEventListener('beforeunload', () => {
    supabase.removeAllChannels();
    const user = JSON.parse(localStorage.getItem('hotel_user'));
    if (user && user.id) {
      fetch(import.meta.env.VITE_SUPABASE_URL + '/rest/v1/EMPLOYEE?EmpID=eq.' + user.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_KEY, 'Authorization': 'Bearer ' + import.meta.env.VITE_SUPABASE_KEY },
        body: JSON.stringify({ IsLoggedIn: false }),
        keepalive: true
      });
    }
  });
});

/* ==============================================================
   COUNTER RECOMPUTE
   ============================================================== */

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
    return;
  }

  const counts = {};
  maidRooms.forEach(r => {
    const s = r.status;
    counts[s] = (counts[s] || 0) + 1;
  });

  const doneCount = completedRooms.length;
  const urgentCount = counts.dirty || 0;
  const inProgressCount = counts.cleaning || 0;
  const pendingCount = (counts.dirty || 0) + (counts.cleaning || 0) + (counts.occ || 0);

  const totalEl = document.getElementById('total-count');
  if (totalEl) totalEl.textContent = pendingCount;
  const doneEl = document.getElementById('done-count');
  if (doneEl) doneEl.textContent = doneCount;
  const pendEl = document.getElementById('pend-count');
  if (pendEl) pendEl.textContent = pendingCount;
  const badgeRooms = document.getElementById('badge-rooms');
  if (badgeRooms) badgeRooms.textContent = pendingCount;

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
  const pct = (pendingCount + doneCount) > 0 ? Math.round(doneCount / (pendingCount + doneCount) * 100) : 0;
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
  if (id === 'stock') renderStock();
  if (id === 'linen') renderLinen();
  if (id === 'laundry') renderLaundryView();
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
      fetchTodayDepartures(),
      fetchLaundryDispatches(),
      fetchLaundryReceives(),
      fetchLaundryDamages()
    ]);
  } catch (e) {
    console.error('Σφάλμα φόρτωσης δεδομένων:', e);
  }
  const rptDate = document.getElementById('rpt-date');
  if (rptDate) rptDate.textContent = new Date().toLocaleDateString('el-GR');
  await computeReportStats();
  renderOverview();
  recomputeCounters();
  renderLaundryView();
}

async function fetchMaidRooms() {
  try {
    const rooms = await fetchRooms();
    if (!rooms || rooms.length === 0) { maidRooms = []; return; }

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

    maidRooms = rooms
      .filter(r => r.Status === 'dirty' || r.Status === 'cleaning' || r.Status === 'occ')
      .map(r => {
        const guests = rrMap[r.RoomNumber];
        let note = '';
        if (r.Status === 'dirty') {
          note = 'Check-out — Απαιτείται καθαρισμός';
        } else if (r.Status === 'cleaning') {
          note = 'Καθαρισμός σε εξέλιξη';
        } else if (r.Status === 'free' || r.Status === 'clean') {
          note = 'Έτοιμο προς χρήση';
        }
        if (guests && guests.length > 0) {
          note = guests.join(', ');
        }
        return {
          id: String(r.RoomNumber),
          num: r.RoomNumber,
          type: r.RoomType || 'Standard',
          status: r.Status,
          state: mapDbStatusToUI(r.Status),
          guest: guests ? guests.join(', ') : null,
          note
        };
      });
  } catch (e) {
    console.error('fetchMaidRooms error:', e);
  }
}

async function fetchInventory() {
  try {
    const { data, error } = await supabase
      .from('INVENTORY_ITEM')
      .select('*')
      .neq('Category', 'κηπος');
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



/* ==============================================================
   DEPARTURES (today's check-outs)
   ============================================================== */
async function fetchTodayDepartures() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: depList, error } = await supabase
      .from('RESERVATION')
      .select(`ReservationID, Status, RoomType, TotalCost, CUSTOMER(FirstName, LastName)`)
      .eq('CheckOutDate', today)
      .not('Status', 'in', '("Cancelled","CheckedOut")');
    if (error) throw error;
    if (!depList || depList.length === 0) { departures = []; return; }

    const ids = depList.map(d => d.ReservationID);
    const { data: rrData, error: rrErr } = await supabase
      .from('RESERVATION_ROOM')
      .select('ReservationID, RoomNumber')
      .in('ReservationID', ids);
    if (rrErr) throw rrErr;

    const roomByRes = {};
    (rrData || []).forEach(rr => { roomByRes[rr.ReservationID] = rr.RoomNumber; });

    const depIds = depList.map(d => d.ReservationID);
    const { data: mbData, error: mbErr } = await supabase
      .from('MINIBAR_CONSUMPTION')
      .select('ReservationID, Charge')
      .in('ReservationID', depIds);
    if (mbErr) throw mbErr;

    const mbTotalByRes = {};
    (mbData || []).forEach(m => {
      mbTotalByRes[m.ReservationID] = (mbTotalByRes[m.ReservationID] || 0) + parseFloat(m.Charge || 0);
    });

    departures = depList.map(d => {
      const c = d.CUSTOMER || {};
      const name = [c.FirstName, c.LastName].filter(Boolean).join(' ').trim() || 'Επισκέπτης';
      const room = roomByRes[d.ReservationID] || '—';
      const roomType = d.RoomType || '—';
      const mbTotal = mbTotalByRes[d.ReservationID] || 0;
      return { reservationId: d.ReservationID, customerName: name, room, roomType, mbTotal };
    });
  } catch (e) {
    console.error('fetchTodayDepartures error:', e);
    departures = [];
  }
}

window.markDepartureCleaned = async function(roomNum) {
  const dep = departures.find(d => d.room == roomNum);
  if (!dep) return;
  const confirmed = await window.showConfirm(`Επιβεβαίωση καθαρισμού δωματίου ${roomNum} (${dep.customerName});`);
  if (!confirmed) return;
  try {
    const { error: roomErr } = await supabase.from('ROOM').update({ Status: 'clean' }).eq('RoomNumber', roomNum);
    if (roomErr) throw roomErr;
    const { error: notifErr } = await supabase.from('NOTIFICATION').insert({
      TargetRole: 'receptionist', Type: 'room_ready', IsRead: false,
      Message: `Δωμάτιο ${roomNum} (${dep.roomType}) — Check-out καθαρίστηκε και είναι έτοιμο.`
    });
    if (notifErr) throw notifErr;
    const depRoom = maidRooms.find(r => r.id === String(roomNum));
    if (depRoom) completedRooms.push({ ...depRoom, state: 'done', status: 'clean', completedAt: new Date().toISOString() });
    departures = departures.filter(d => d.room != roomNum);
    maidRooms = maidRooms.filter(r => r.id !== String(roomNum));
    showToast('room-toast', `Δωμάτιο ${roomNum} καθαρίστηκε — ειδοποιήθηκε η υποδοχή.`);
    addLog(`Check-out ${roomNum} (${dep.customerName}) — καθαρίστηκε`);
    recomputeCounters();
    renderRooms(currentFilter);
    renderOverview();
  } catch (err) {
    console.error('Σφάλμα:', err.message);
    showToast('room-toast', 'Σφάλμα: ' + err.message);
  }
};

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
  const urgent = maidRooms.filter(r => r.status === 'dirty').slice(0, 5);
  const priority = maidRooms.filter(r => r.status === 'occ').slice(0, 5);
  const items = [...urgent, ...priority];
  if (items.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary)">Καμία εκκρεμότητα</div>';
    return;
  }
  list.innerHTML = items.map(r => {
    const isUrg = r.status === 'dirty';
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

const isLinenCategory = (cat, name) => ['linen', 'towel', 'robe', 'sheet', 'pillow', 'bedding', 'bath', 'κρεβατιού', 'μπάνιου', 'πετσέτα', 'σεντόνι', 'μαξιλάρι', 'μπουρνούζι', 'τραπεζομάντηλο', 'ποδιά', 'πανί', 'στολή', 'δωμάτιο', 'κουζίνας', 'εστιατορίου', 'ειδικά'].some(k => (cat || '').toLowerCase().includes(k) || (name || '').toLowerCase().includes(k));

/* ==============================================================
   ROOMS VIEW
   ============================================================== */
function renderRooms(filter) {
    const data = filter === 'completed' ? completedRooms : maidRooms;
    renderRoomMap('room-list', data, {
        mode: 'cards',
        filter: filter === 'completed' ? 'all' : filter,
        departures: departures
    });
}

function updateFilterCounts() {
  const buttons = document.querySelectorAll('#v-rooms .btn-sm[data-filter]');
  buttons.forEach(btn => {
    const f = btn.dataset.filter;
    let count = 0;
    if (f === 'all') {
      count = maidRooms.length;
    } else if (f === 'completed') {
      count = completedRooms.length;
    } else {
      count = maidRooms.filter(r => r.state === f).length;
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
  const actionLabel = room && room.status === 'dirty' ? 'Καθαρισμός' : 'Έναρξη';
  try {
    if (room && (room.status === 'dirty' || room.status === 'occ')) {
      const { error } = await supabase.from('ROOM').update({ Status: 'cleaning' }).eq('RoomNumber', id);
      if (error) throw error;
      room._origStatus = room.status;
      room.status = 'cleaning';
      room.state = 'cleaning';
      room.note = 'Καθαρισμός σε εξέλιξη';
    }
    const { error: notifErr } = await supabase.from('NOTIFICATION').insert({
      TargetRole: 'receptionist',
      Type: 'room_in_progress',
      Message: `Δωμάτιο ${id}: ${actionLabel} σε εξέλιξη από καμαριέρα.`,
      IsRead: false
    });
    if (notifErr) throw notifErr;
  } catch (err) {
    console.error('Σφάλμα καταγραφής έναρξης:', err.message);
    showToast('room-toast', 'Σφάλμα: ' + err.message);
    return;
  }

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

  const targetStatus = room._origStatus === 'occ' ? 'occ' : 'clean';

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
    const { error: notifErr } = await supabase.from('NOTIFICATION').insert({
      TargetRole: 'receptionist',
      Type: 'room_ready',
      Message: `Δωμάτιο ${room.num} (${room.type}) καθαρίστηκε και είναι έτοιμο.`,
      IsRead: false
    });
    if (notifErr) throw notifErr;
  } catch (err) {
    console.error('Σφάλμα:', err.message);
    showToast('room-toast', 'Σφάλμα ενημέρωσης: ' + err.message);
    return;
  }

  const completedRoom = { ...room, state: 'done', status: 'clean', completedAt: new Date().toISOString() };
  completedRooms.push(completedRoom);
  maidRooms = maidRooms.filter(r => r.id !== id);

  const statusLabel = room._origStatus === 'dirty' ? 'check-out' : room._origStatus === 'occ' ? 'διαμονή' : 'καθαρισμός';
  recomputeCounters();
  showToast('room-toast', room.num + ' — Έτοιμο! Ειδοποιήθηκε η υποδοχή.');
  addLog(room.num + ' — ' + statusLabel + ' ολοκληρώθηκε, ειδοποιήθηκε η υποδοχή');
  renderRooms(currentFilter);
  renderOverview();
};

window.reportRoomIssue = function(id) {
  const room = maidRooms.find(r => r.id === id);
  if (!room) return;
  const overlay = document.getElementById('report-issue-overlay');
  const numEl = document.getElementById('ri-room-num');
  const descEl = document.getElementById('ri-desc');
  if (!overlay || !numEl || !descEl) return;
  numEl.textContent = room.num;
  descEl.value = '';
  overlay.style.display = 'flex';
  const close = () => { overlay.style.display = 'none'; };
  document.getElementById('ri-close').onclick = close;
  document.getElementById('ri-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.getElementById('ri-submit').onclick = async () => {
    const desc = descEl.value.trim();
    if (!desc) { alert('Περιγράψτε το πρόβλημα.'); return; }
    try {
      const { error } = await supabase.from('NOTIFICATION').insert({
        TargetRole: 'admin', Type: 'room_issue',
        Message: `Πρόβλημα δωματίου ${room.num} (${room.type}): ${desc}`,
        IsRead: false
      });
      if (error) throw error;
      showToast('room-toast', 'Αναφορά για ' + room.num + ' εστάλη στον διαχειριστή.');
      addLog('Αναφορά προβλήματος ' + room.num + ': ' + desc);
      close();
    } catch (err) {
      alert('Σφάλμα αποστολής αναφοράς: ' + err.message);
    }
  };
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
    const { error } = await supabase.from('NOTIFICATION').insert({
      TargetRole: 'admin',
      Type: 'low_stock',
      Message: `Ελλιπές απόθεμα: ${itemName} (ID: ${itemId}) — Απαιτείται παραγγελία.`,
      IsRead: false
    });
    if (error) throw error;
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
    const { error: updErr } = await supabase.from('INVENTORY_ITEM').update({ Quantity: item.Quantity + qty }).eq('ItemID', itemId);
    if (updErr) throw updErr;
    const { error: notifErr } = await supabase.from('NOTIFICATION').insert({
      TargetRole: 'admin', Type: 'linen_received', IsRead: false,
      Message: `Παραλαβή ιματισμού: ${qty} τεμάχια ${itemName}.`
    });
    if (notifErr) throw notifErr;
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
      const { error: updErr } = await supabase.from('INVENTORY_ITEM').update({ Quantity: Math.max(0, item.Quantity - qty) }).eq('ItemID', item.ItemID);
      if (updErr) throw updErr;
    } catch (err) {
      console.error('Σφάλμα ενημέρωσης αποθέματος:', err.message);
    }
  }

  if (totalItems > 0) {
    try {
      const { error: notifErr } = await supabase.from('NOTIFICATION').insert({
        TargetRole: 'admin', Type: 'linen_sent', IsRead: false,
        Message: `Αποστολή ιματισμού: ${totalSent} τεμάχια (${totalItems} είδη) στάλθηκαν στο καθαριστήριο.`
      });
      if (notifErr) throw notifErr;
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
    const { error } = await supabase.from('NOTIFICATION').insert({
      TargetRole: 'admin', Type: 'shift_report', Message: msg, IsRead: false
    });
    if (error) throw error;
    showToast('rep-toast');
    addLog('Αναφορά βάρδιας εστάλη στη διοίκηση' + (noteText ? ': ' + noteText : ''));
  } catch (err) {
    console.error('Σφάλμα αποστολής αναφοράς:', err.message);
    alert('Σφάλμα: ' + err.message);
  }
};

/* ==============================================================
   LAUNDRY MANAGEMENT
   ============================================================== */
let laundryDispatches = [];
let laundryReceives = [];
let laundryDamages = [];
let currentLaundrySub = 'dispatch';

window.laundrySubNav = function(view) {
  currentLaundrySub = view;
  document.querySelectorAll('#v-laundry .btn-sm[data-laundry]').forEach(b => {
    b.style.background = b.dataset.laundry === view ? 'var(--color-background-secondary)' : '';
  });
  document.querySelectorAll('#v-laundry .laundry-sub').forEach(el => {
    el.style.display = el.id === 'ls-' + view ? '' : 'none';
  });
  if (view === 'dispatch') renderLaundryDispatchForm();
  if (view === 'receive') renderLaundryReceiveForm();
  if (view === 'history') renderLaundryHistory();
  if (view === 'damage') renderLaundryDamages();
};

async function fetchLaundryDispatches() {
  try {
    const { data, error } = await supabase
      .from('LAUNDRY_DISPATCH')
      .select(`*, "INVENTORY_ITEM"("Name","Category")`)
      .order('DispatchID', { ascending: false })
      .limit(50);
    if (error) throw error;
    laundryDispatches = data || [];
  } catch (e) {
    console.error('fetchLaundryDispatches error:', e);
    laundryDispatches = [];
  }
}

async function fetchLaundryReceives() {
  try {
    const { data, error } = await supabase
      .from('LAUNDRY_RECEIVE')
      .select(`*, "LAUNDRY_DISPATCH"!inner("DispatchID","StaffName")`)
      .order('ReceiveID', { ascending: false })
      .limit(50);
    if (error) throw error;
    laundryReceives = data || [];
  } catch (e) {
    console.error('fetchLaundryReceives error:', e);
    laundryReceives = [];
  }
}

async function fetchLaundryDamages() {
  try {
    const { data, error } = await supabase
      .from('LAUNDRY_DAMAGE')
      .select(`*, "INVENTORY_ITEM"("Name")`)
      .order('DamageID', { ascending: false })
      .limit(50);
    if (error) throw error;
    laundryDamages = data || [];
  } catch (e) {
    console.error('fetchLaundryDamages error:', e);
    laundryDamages = [];
  }
}

function renderLaundryView() {
  document.querySelector('#v-laundry .btn-sm[data-laundry="dispatch"]').style.background = 'var(--color-background-secondary)';
  renderLaundryDispatchForm();
  renderLaundryReceiveForm();
  renderLaundryHistory();
  renderLaundryDamages();
  renderLaundryReceiveSelect();
}

function renderLaundryDispatchForm() {
  const container = document.getElementById('laundry-dispatch-items');
  const linen = inventoryItems.filter(i => isLinenCategory(i.Category, i.Name));
  if (!container) return;
  if (linen.length === 0) {
    container.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-secondary)">Δεν βρέθηκαν είδη ιματισμού</div>';
    return;
  }
  container.innerHTML = linen.map(item => `
    <div class="minibar-row" style="padding:8px 0">
      <div style="min-width:120px;font-size:12px"><strong>${item.Name}</strong><br><span style="font-size:10px;color:var(--color-text-secondary)">${item.Category} · Διαθ.: ${item.Quantity} ${item.Unit || 'τεμ.'}</span></div>
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:10px;color:var(--color-text-secondary)">Ποσ.</span>
        <input type="number" id="ld-qty-${item.ItemID}" class="fg-inp" style="width:60px" placeholder="0" min="0" max="${item.Quantity}" value="0">
      </div>
    </div>
  `).join('');
  document.getElementById('btn-dispatch-laundry').onclick = window.dispatchLaundry;
}

function renderLaundryReceiveSelect() {
  const sel = document.getElementById('laundry-receive-dispatch');
  if (!sel) return;
  const pending = laundryDispatches.filter(d => {
    const rcv = laundryReceives.filter(r => r.DispatchID === d.DispatchID);
    const totalRcv = rcv.reduce((s, r) => s + r.QuantitySent, 0);
    return totalRcv < d.Quantity;
  });
  sel.innerHTML = pending.map(d => {
    const name = d.INVENTORY_ITEM ? d.INVENTORY_ITEM.Name : 'Είδος #' + d.ItemID;
    return `<option value="${d.DispatchID}">#${d.DispatchID} · ${name} · ${d.Quantity} τεμ. · ${d.DispatchDate}</option>`;
  }).join('') || '<option>— Καμία εκκρεμής αποστολή —</option>';
  sel.onchange = renderLaundryReceiveForm;
}

function renderLaundryReceiveForm() {
  const sel = document.getElementById('laundry-receive-dispatch');
  const container = document.getElementById('laundry-receive-items');
  if (!sel || !container) return;
  const dispatchId = parseInt(sel.value);
  if (!dispatchId) {
    container.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-secondary)">Επιλέξτε αποστολή</div>';
    return;
  }
  const disp = laundryDispatches.find(d => d.DispatchID === dispatchId);
  if (!disp) return;
  const name = disp.INVENTORY_ITEM ? disp.INVENTORY_ITEM.Name : 'Είδος #' + disp.ItemID;
  container.innerHTML = `
    <div style="font-size:12px;padding:6px 0;border-bottom:0.5px solid var(--color-border-tertiary)">
      <strong>${name}</strong> · Απεστάλησαν: ${disp.Quantity} τεμ. · ${disp.DispatchDate}
    </div>
    <div class="fg-row" style="margin-top:8px">
      <div class="fg"><label>Παρελήφθησαν (καθαρά)</label><input type="number" id="lr-received" class="fg-inp" value="${disp.Quantity}" min="0" max="${disp.Quantity}"></div>
      <div class="fg"><label>Κατεστραμμένα</label><input type="number" id="lr-damaged" class="fg-inp" value="0" min="0"></div>
      <div class="fg"><label>Ελλείποντα</label><input type="number" id="lr-missing" class="fg-inp" value="0" min="0"></div>
    </div>
    <div class="fg"><label>Σημειώσεις</label><input type="text" id="lr-notes" class="fg-inp" placeholder="π.χ. 2 πετσέτες με λεκέ"></div>
  `;
  document.getElementById('btn-receive-laundry').onclick = window.receiveLaundry;
}

function renderLaundryHistory() {
  const dispatchContainer = document.getElementById('laundry-dispatch-history');
  if (dispatchContainer) {
    if (laundryDispatches.length === 0) {
      dispatchContainer.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-secondary)">Καμία αποστολή</div>';
    } else {
      dispatchContainer.innerHTML = `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--color-border-tertiary);background:var(--color-background-secondary)">
          <th style="padding:5px;text-align:left">#</th><th style="padding:5px;text-align:left">Είδος</th><th style="padding:5px;text-align:center">Ποσ.</th><th style="padding:5px;text-align:left">Ημ/νία</th><th style="padding:5px;text-align:left">Αποστολέας</th>
        </tr></thead><tbody>${laundryDispatches.slice(0, 20).map(d => {
          const name = d.INVENTORY_ITEM ? d.INVENTORY_ITEM.Name : 'Είδος #' + d.ItemID;
          return `<tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
            <td style="padding:5px">${d.DispatchID}</td><td style="padding:5px">${name}</td>
            <td style="padding:5px;text-align:center">${d.Quantity}</td>
            <td style="padding:5px">${d.DispatchDate}</td><td style="padding:5px">${d.StaffName || '—'}</td>
          </tr>`;
        }).join('')}</tbody></table>`;
      if (laundryDispatches.length > 20) dispatchContainer.innerHTML += `<div style="padding:4px;text-align:center;font-size:10px;color:var(--color-text-secondary)">... και ${laundryDispatches.length - 20} ακόμη</div>`;
    }
  }
  const receiveContainer = document.getElementById('laundry-receive-history');
  if (receiveContainer) {
    if (laundryReceives.length === 0) {
      receiveContainer.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-secondary)">Καμία παραλαβή</div>';
    } else {
      receiveContainer.innerHTML = `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--color-border-tertiary);background:var(--color-background-secondary)">
          <th style="padding:5px;text-align:left">Αποστολή #</th><th style="padding:5px;text-align:center">Στάλθηκαν</th><th style="padding:5px;text-align:center">Παρελήφθησαν</th><th style="padding:5px;text-align:center">Ζημιές</th><th style="padding:5px;text-align:center">Ελλείψεις</th><th style="padding:5px;text-align:left">Ημ/νία</th>
        </tr></thead><tbody>${laundryReceives.slice(0, 20).map(r => {
          return `<tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
            <td style="padding:5px">${r.DispatchID}</td><td style="padding:5px;text-align:center">${r.QuantitySent}</td>
            <td style="padding:5px;text-align:center">${r.QuantityReceived}</td>
            <td style="padding:5px;text-align:center">${r.QuantityDamaged > 0 ? `<span style="color:#D85A30">${r.QuantityDamaged}</span>` : r.QuantityDamaged}</td>
            <td style="padding:5px;text-align:center">${r.QuantityMissing > 0 ? `<span style="color:#D85A30">${r.QuantityMissing}</span>` : r.QuantityMissing}</td>
            <td style="padding:5px">${r.ReceiveDate}</td>
          </tr>`;
        }).join('')}</tbody></table>`;
    }
  }
}

function renderLaundryDamages() {
  const container = document.getElementById('laundry-damage-list');
  if (!container) return;
  if (laundryDamages.length === 0) {
    container.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-secondary)">Καμία καταγεγραμμένη ζημιά</div>';
    return;
  }
  container.innerHTML = `<table style="width:100%;border-collapse:collapse">
    <thead><tr style="border-bottom:1px solid var(--color-border-tertiary);background:var(--color-background-secondary)">
      <th style="padding:5px;text-align:left">Είδος</th><th style="padding:5px;text-align:center">Ποσ.</th><th style="padding:5px;text-align:left">Τύπος</th><th style="padding:5px;text-align:left">Περιγραφή</th><th style="padding:5px;text-align:left">Αναφέρθηκε από</th><th style="padding:5px;text-align:left">Ημ/νία</th>
    </tr></thead><tbody>${laundryDamages.map(d => {
      const name = d.INVENTORY_ITEM ? d.INVENTORY_ITEM.Name : 'Είδος #' + d.ItemID;
      return `<tr style="border-bottom:0.5px solid var(--color-border-tertiary)">
        <td style="padding:5px">${name}</td><td style="padding:5px;text-align:center">${d.Quantity}</td>
        <td style="padding:5px">${d.DamageType}</td><td style="padding:5px">${d.Description || '—'}</td>
        <td style="padding:5px">${d.ReportedBy || '—'}</td><td style="padding:5px">${d.ReportDate || '—'}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

window.dispatchLaundry = async function() {
  const linen = inventoryItems.filter(i => isLinenCategory(i.Category, i.Name));
  const items = [];
  for (const item of linen) {
    const inp = document.getElementById('ld-qty-' + item.ItemID);
    if (!inp) continue;
    const qty = parseInt(inp.value, 10);
    if (!qty || qty <= 0) continue;
    items.push({ item, qty });
  }
  if (items.length === 0) { alert('Επιλέξτε τουλάχιστον ένα είδος με ποσότητα > 0.'); return; }
  const confirmed = await window.showConfirm(`Αποστολή ${items.reduce((s,i) => s + i.qty, 0)} τεμαχίων στο πλυντήριο;`);
  if (!confirmed) return;
  try {
    for (const { item, qty } of items) {
      const { error: dispatchErr } = await supabase.from('LAUNDRY_DISPATCH').insert({
        ItemID: item.ItemID, Quantity: qty, StaffName: hotelUser?.name || 'Καμαριέρα',
        Notes: `Αποστολή ${item.Name}`
      });
      if (dispatchErr) throw dispatchErr;
      const newQty = Math.max(0, item.Quantity - qty);
      const { error: updErr } = await supabase.from('INVENTORY_ITEM').update({ Quantity: newQty }).eq('ItemID', item.ItemID);
      if (updErr) throw updErr;
    }
    showToast('laundry-toast', `Αποστολή ${items.reduce((s,i) => s + i.qty, 0)} τεμαχίων ολοκληρώθηκε!`);
    addLog(`Αποστολή ιματισμού: ${items.reduce((s,i) => s + i.qty, 0)} τεμάχια`);
    await fetchInventory();
    await fetchLaundryDispatches();
    renderLaundryDispatchForm();
    renderLaundryReceiveSelect();
    renderLaundryHistory();
  } catch (err) {
    console.error('Σφάλμα αποστολής:', err.message);
    alert('Σφάλμα: ' + err.message);
  }
};

window.receiveLaundry = async function() {
  const sel = document.getElementById('laundry-receive-dispatch');
  if (!sel) return;
  const dispatchId = parseInt(sel.value);
  if (!dispatchId) { alert('Επιλέξτε αποστολή.'); return; }
  const dispatched = parseInt(document.getElementById('lr-received')?.value || '0');
  const damaged = parseInt(document.getElementById('lr-damaged')?.value || '0');
  const missing = parseInt(document.getElementById('lr-missing')?.value || '0');
  const notes = document.getElementById('lr-notes')?.value?.trim() || '';
  const total = dispatched + damaged + missing;
  const disp = laundryDispatches.find(d => d.DispatchID === dispatchId);
  if (!disp) return;
  if (total === 0) { alert('Καταχωρήστε τουλάχιστον μία ποσότητα.'); return; }
  const confirmed = await window.showConfirm(`Παραλαβή: ${dispatched} καθαρά, ${damaged} κατεστραμμένα, ${missing} ελλείποντα;`);
  if (!confirmed) return;
  try {
    const { error: rcvErr } = await supabase.from('LAUNDRY_RECEIVE').insert({
      ItemID: disp.ItemID, DispatchID: dispatchId, QuantitySent: disp.Quantity,
      QuantityReceived: dispatched, QuantityDamaged: damaged, QuantityMissing: missing,
      StaffName: hotelUser?.name || 'Καμαριέρα', Notes: notes
    });
    if (rcvErr) throw rcvErr;
    const { data: itemData, error: itemErr } = await supabase.from('INVENTORY_ITEM').select('Quantity').eq('ItemID', disp.ItemID).single();
    if (itemErr) throw itemErr;
    const currentQty = itemData?.Quantity || 0;
    const { error: updErr } = await supabase.from('INVENTORY_ITEM').update({ Quantity: currentQty + dispatched }).eq('ItemID', disp.ItemID);
    if (updErr) throw updErr;
    if (damaged > 0 || missing > 0) {
      const damageType = damaged > 0 ? (notes.toLowerCase().includes('τρύπ') ? 'Torn' : 'Stained') : 'Missing';
      const { error: dmgErr } = await supabase.from('LAUNDRY_DAMAGE').insert({
        ItemID: disp.ItemID, DispatchID: dispatchId, Quantity: damaged + missing,
        DamageType: damageType, Description: notes || `${damaged} κατεστραμμένα, ${missing} ελλείποντα`,
        ReportedBy: hotelUser?.name || 'Καμαριέρα', ActionTaken: damaged > 0 ? 'Απόσυρση' : 'Αναφορά ελλείμματος'
      });
      if (dmgErr) throw dmgErr;
    }
    showToast('laundry-toast', 'Παραλαβή καταχωρήθηκε με επιτυχία!');
    addLog(`Παραλαβή #${dispatchId}: ${dispatched} καθαρά, ${damaged} ζημιές, ${missing} ελλείψεις`);
    await fetchInventory();
    await fetchLaundryDispatches();
    await fetchLaundryReceives();
    await fetchLaundryDamages();
    renderLaundryReceiveSelect();
    renderLaundryReceiveForm();
    renderLaundryHistory();
    renderLaundryDamages();
  } catch (err) {
    console.error('Σφάλμα παραλαβής:', err.message);
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
window.logout = async function() {
  const user = JSON.parse(localStorage.getItem('hotel_user'));
  if (user) await supabase.from('EMPLOYEE').update({ IsLoggedIn: false }).eq('EmpID', user.id);
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
