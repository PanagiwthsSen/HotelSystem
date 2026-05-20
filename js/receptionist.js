/* ==============================================================
   TOAST NOTIFICATION SYSTEM
   ============================================================== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `live-toast ${type}`;

    let iconClass = 'ti-circle-check'; 
    if (type === 'error') iconClass = 'ti-alert-circle';
    if (type === 'info') iconClass = 'ti-info-circle';
    if (type === 'warning') iconClass = 'ti-alert-triangle';

    toast.innerHTML = `<i class="ti ${iconClass}" aria-hidden="true"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/* ==============================================================
   NAVIGATION & LIVE TIME
   ============================================================== */
const viewTitles = {
    dash: 'Επισκόπηση', rooms: 'Κατάσταση Δωματίων', 'new-booking': 'Νέα Κράτηση',
    'room-search': 'Αναζήτηση Δωματίων',
    arrivals: 'Αφίξεις (Check-in)', departures: 'Αναχωρήσεις (Check-out)', 
    minibar: 'Χρεώσεις Mini-bar', policies: 'Πολιτική Ξενοδοχείου'
};

function navTo(id) {
    document.querySelectorAll('.sb-item').forEach(i => i.classList.toggle('active', i.dataset.v === id));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
    document.getElementById('tb-title').textContent = viewTitles[id] || id;
    if (id === 'new-booking') fetchAvailableRooms();
}

document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => navTo(el.dataset.v));
});

function updateLiveTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    const liveTimeEl = document.getElementById('live-time');
    if(liveTimeEl) liveTimeEl.innerHTML = now.toLocaleDateString('el-GR', options);
}
setInterval(updateLiveTime, 60000);
updateLiveTime();

/* ==============================================================
   STATE & ROOMS FETCHING (SUPABASE)
   ============================================================== */
let hotelRooms = [];
let currentOcc = 0, currentFree = 0, currentDirty = 0;
let selectedRoom = null;
let checkoutMap = {};

function isSoonCheckout(checkOutDate) {
  if (!checkOutDate) return false;
  const d = new Date(checkOutDate);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  return d <= tomorrow;
}

function roomStatusLabel(state, checkOutDate) {
  if (state === 'free' || state === 'clean') return 'Έτοιμο για νέο πελάτη';
  if (state === 'dirty') return 'Άδειο (χωρίς καθαριότητα)';
  if (state === 'occ') return isSoonCheckout(checkOutDate) ? 'Προσεχώς άδειο' : 'Κατειλημμένο';
  return 'Ελεύθερο';
}

function mapDbStatusToUI(dbStatus) {
    switch (dbStatus) {
        case 'occ': return 'occ';
        case 'free': return 'free';
        case 'dirty': return 'dirty';
        case 'clean': return 'free';
        default: return 'free';
    }
}

async function buildCheckoutMap() {
  const map = {};
  try {
    const { data: rrData } = await window.supabase
      .from('RESERVATION_ROOM')
      .select('RoomNumber, ReservationID');
    if (!rrData || rrData.length === 0) return map;
    const ids = rrData.map(r => r.ReservationID);
    const { data: resData } = await window.supabase
      .from('RESERVATION')
      .select('ReservationID, CheckOutDate')
      .in('ReservationID', ids)
      .neq('Status', 'CheckedOut');
    if (resData) {
      const dateMap = {};
      resData.forEach(r => dateMap[r.ReservationID] = r.CheckOutDate);
      rrData.forEach(rr => { if (dateMap[rr.ReservationID]) map[rr.RoomNumber] = dateMap[rr.ReservationID]; });
    }
  } catch (err) {
    console.warn('buildCheckoutMap error:', err);
  }
  return map;
}

async function fetchRoomsAndRender() {
    try {
        const { data: rooms, error } = await window.supabase
            .from('ROOM')
            .select('*')
            .order('RoomNumber', { ascending: true });

        if (error) throw error;

        checkoutMap = await buildCheckoutMap();

        hotelRooms = rooms.map(r => ({
            id: r.RoomNumber,
            type: r.RoomType,
            state: mapDbStatusToUI(r.Status),
            dbStatus: r.Status,
            checkOutDate: checkoutMap[r.RoomNumber] || null
        }));

        renderMap();
    } catch (err) {
        console.error("Σφάλμα κατά τη φόρτωση των δωματίων:", err.message);
        showToast("Αποτυχία φόρτωσης δωματίων από τη βάση.", "error");
    }
}

function calculateLiveStats() {
    currentOcc = 0; currentFree = 0; currentDirty = 0; currentClean = 0;
    
    hotelRooms.forEach(r => {
        if (r.state === 'occ') currentOcc++;
        else if (r.state === 'dirty') currentDirty++;
        else currentFree++;
    });
    
    const totalRooms = hotelRooms.length || 1;
    const occPct = Math.round((currentOcc / totalRooms) * 100);

    const liveBadge = document.getElementById('live-occ-badge');
    if(liveBadge) liveBadge.textContent = `Πληρ. ${occPct}%`;
    
    const dashOccVal = document.getElementById('dash-occ-val');
    if(dashOccVal) dashOccVal.textContent = `${occPct}%`;
    
    const dashOccSub = document.getElementById('dash-occ-sub');
    if(dashOccSub) dashOccSub.textContent = `${currentOcc} / ${totalRooms} δωμάτια`;
    
    const dashOccBar = document.getElementById('dash-occ-bar');
    if(dashOccBar) dashOccBar.style.width = `${occPct}%`;
    
    const dashFreeVal = document.getElementById('dash-free-val');
    if(dashFreeVal) dashFreeVal.textContent = currentFree;
    
    if(document.getElementById('stat-occ')) {
        document.getElementById('stat-occ').textContent = currentOcc;
        document.getElementById('stat-occ-bar').style.width = `${occPct}%`;
        document.getElementById('stat-free').textContent = currentFree;
        document.getElementById('stat-dirty').textContent = currentDirty;
    }
}

// HotelSystem/js/receptionist.js (Αντικατάσταση της συνάρτησης renderMap)
function renderMap(filter = 'all') {
    const rmap = document.getElementById('rmap');
    if (!rmap) return;
    rmap.innerHTML = '';
    
    hotelRooms.forEach(r => {
        if (filter !== 'all' && r.state !== filter) return;
        const d = document.createElement('div');
        d.className = 'rc rc-' + r.state;
        
        let prefix = r.type ? r.type.charAt(0).toUpperCase() + '-' : '';
        d.textContent = prefix + r.id; 
        
        const sText = roomStatusLabel(r.state, r.checkOutDate);
        d.title = `${r.type || 'Άγνωστος Τύπος'} ${r.id} | ${sText}`;
        d.style.cursor = 'pointer';
        
        d.addEventListener('click', () => {
            alert(`Πληροφορίες Δωματίου\n--------------------\nΔωμάτιο: ${prefix}${r.id}\nΤύπος: ${r.type || 'Άγνωστος'}\nΚατάσταση: ${sText}`);
        });

        rmap.appendChild(d);
    });
    
    calculateLiveStats();
}

function filterRooms(f, el) {
    document.querySelectorAll('.active-filter').forEach(b => b.classList.remove('active-filter'));
    el.classList.add('active-filter');
    renderMap(f);
}

/* ==============================================================
   RESERVATIONS FETCHING (SUPABASE)
   ============================================================== */
async function fetchTodayReservations() {
    const today = new Date().toISOString().split('T')[0];

    try {
        // Αφίξεις Σήμερα
        const { data: arrivals, error: arrErr } = await window.supabase
            .from('RESERVATION')
            .select(`ReservationID, Status, RoomType, CUSTOMER ( FirstName, LastName, IsGroup )`)
            .eq('CheckInDate', today);

        // Αναχωρήσεις Σήμερα
        const { data: departures, error: depErr } = await window.supabase
            .from('RESERVATION')
            .select(`ReservationID, Status, TotalCost, CUSTOMER ( FirstName, LastName, IsGroup )`)
            .eq('CheckOutDate', today);

        if (arrErr) throw arrErr;
        if (depErr) throw depErr;

        const arrList = arrivals || [];
        const depList = departures || [];

        // Φόρτωση δωματίων από RESERVATION_ROOM για όλες τις κρατήσεις
        const allIds = [...arrList.map(a => a.ReservationID), ...depList.map(d => d.ReservationID)];
        const roomMap = {};

        if (allIds.length > 0) {
            const { data: rrData, error: rrErr } = await window.supabase
                .from('RESERVATION_ROOM')
                .select('ReservationID, RoomNumber')
                .in('ReservationID', allIds);
            if (!rrErr && rrData) {
                rrData.forEach(r => { roomMap[r.ReservationID] = r.RoomNumber; });
            }
        }

        arrList.forEach(a => a._roomNumber = roomMap[a.ReservationID] || '-');
        depList.forEach(d => d._roomNumber = roomMap[d.ReservationID] || '-');

        renderArrivals(arrList);
        renderDepartures(depList);
        
        const liveArrBadge = document.getElementById('live-arr-badge');
        if(liveArrBadge) liveArrBadge.textContent = `Αφίξεις: ${arrList.length}`;
        const dashArrCount = document.getElementById('dash-arr-count');
        if (dashArrCount) dashArrCount.textContent = arrList.length;
        const dashDepCount = document.getElementById('dash-dep-count');
        if (dashDepCount) dashDepCount.textContent = depList.length;

    } catch (err) {
        console.error("Σφάλμα κρατήσεων:", err.message);
        showToast("Σφάλμα φόρτωσης κρατήσεων: " + err.message, "error");
    }
}

function renderArrivals(arrivals) {
    const tbody = document.querySelector('#v-arrivals table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    arrivals.forEach(arr => {
        const c = arr.CUSTOMER || {};
        const customerName = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
        const roomNumber = arr._roomNumber || '-';
        const isCheckedIn = (arr.Status === 'CheckedIn' || arr.Status === 'CheckedOut');
        const isGroup = c.IsGroup === true;
        const hasRoom = roomNumber !== '-';
        const safeName = customerName.replace(/'/g, "\\'");
        const roomType = arr.RoomType || '—';
        const safeRoomType = roomType.replace(/'/g, "\\'");
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${customerName}</td>
            <td>${isGroup ? 'Γκρουπ' : 'Ιδιώτης'}</td>
            <td>${roomType}</td>
            <td>${roomNumber}</td>
            <td><span class="pill ${isCheckedIn ? 'p-g' : 'p-a'}">${isCheckedIn ? 'Ολοκλ.' : 'Εκκρεμεί'}</span></td>
            <td>
                <button class="btn btn-sm ${isCheckedIn ? '' : 'btn-dark'}" 
                        ${isCheckedIn ? 'disabled' : ''} 
                        onclick="openCheckinModal(${arr.ReservationID}, '${safeName}', '${safeRoomType}', ${hasRoom ? roomNumber : null})">
                    ${isCheckedIn ? 'C/I OK' : 'Check-in'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Dashboard mini-table
    const dashBody = document.getElementById('dash-arrivals-body');
    if (dashBody) {
        if (arrivals.length === 0) {
            dashBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:8px;">Δεν υπάρχουν αφίξεις σήμερα</td></tr>';
        } else {
            dashBody.innerHTML = arrivals.slice(0, 5).map(arr => {
                const c = arr.CUSTOMER || {};
                const name = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
                const room = arr._roomNumber || '—';
                const isCheckedIn = (arr.Status === 'CheckedIn' || arr.Status === 'CheckedOut');
                const statusHtml = isCheckedIn ? '<span class="pill p-g">Check-In</span>' : '<span class="pill p-a">Εκκρεμεί</span>';
                return `<tr><td><strong>${name}</strong></td><td>${room}</td><td>${statusHtml}</td></tr>`;
            }).join('');
        }
    }
}

function renderDepartures(departures) {
    const tbody = document.querySelector('#v-departures table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    departures.forEach(dep => {
        const c = dep.CUSTOMER || {};
        const customerName = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
        const roomNumber = dep._roomNumber || '-';
        const isCheckedOut = dep.Status === 'CheckedOut';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${customerName}</td>
            <td>${roomNumber}</td>
            <td><span class="pill p-g">OK</span></td>
            <td>€${dep.TotalCost || 0}</td>
            <td><span class="pill ${isCheckedOut ? 'p-g' : 'p-a'}">${isCheckedOut ? 'Ολοκλ.' : 'Εκκρεμεί'}</span></td>
            <td>
                <button class="btn btn-sm ${isCheckedOut ? '' : 'btn-dark'}" 
                        ${isCheckedOut ? 'disabled' : ''} 
                        onclick="doCheckout(this, '${customerName}', ${dep.ReservationID}, '${roomNumber}')">
                    ${isCheckedOut ? 'C/O OK' : 'Check-out'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Dashboard mini-table
    const dashBody = document.getElementById('dash-departures-body');
    if (dashBody) {
        if (departures.length === 0) {
            dashBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:8px;">Δεν υπάρχουν αναχωρήσεις σήμερα</td></tr>';
        } else {
            dashBody.innerHTML = departures.slice(0, 5).map(dep => {
                const c = dep.CUSTOMER || {};
                const name = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
                const room = dep._roomNumber || '—';
                const isCheckedOut = dep.Status === 'CheckedOut';
                const statusHtml = isCheckedOut ? '<span class="pill p-g">Check-Out</span>' : '<span class="pill p-a">Εκκρεμεί</span>';
                return `<tr><td><strong>${name}</strong></td><td>${room}</td><td>${statusHtml}</td></tr>`;
            }).join('');
        }
    }
}

/* ==============================================================
   ΛΕΙΤΟΥΡΓΙΑ ΑΠΟΣΥΝΔΕΣΗΣ (LOGOUT)
   ============================================================== */
function logout() {
    // 1. Διαγραφή των δεδομένων του χρήστη από το localStorage
    localStorage.removeItem('hotel_user');
    
    // 2. Εμφάνιση ενός μηνύματος (προαιρετικά)
    alert("Αποσυνδεθήκατε επιτυχώς!");
    
    // 3. Ανακατεύθυνση στη σελίδα Login
    window.location.href = "/pages/login.html";
}

/* ==============================================================
   BOOKING LOGIC (UI CALCS & SUBMIT)
   ============================================================== */
const prepayMap = {
    phone: { txt: 'Τηλεφωνική/Κάρτα (20%)', pct: 20 },
    prepaid: { txt: 'Προπληρωμένη (50%)', pct: 50 },
    group: { txt: 'Ειδική Γκρουπ (15%)', pct: 15 },
    walkin: { txt: 'Walk-in (100% κατά την άφιξη)', pct: 100 }
};

function calcNights() {
    const i = document.getElementById('nb-in')?.value;
    const o = document.getElementById('nb-out')?.value;
    if(!i || !o) return 1;
    return Math.max(1, Math.round((new Date(o) - new Date(i)) / 86400000));
}

function updatePrice() {
    const rtypeEl = document.getElementById('nb-rtype');
    if(!rtypeEl) return;
    const price = parseInt(rtypeEl.value || 140);
    const nights = calcNights();
    
    const total = price * nights;
    const typeText = rtypeEl.options[rtypeEl.selectedIndex].text;
    
    document.getElementById('sp-room').textContent = typeText;
    document.getElementById('sp-nights').textContent = nights;
    document.getElementById('sp-sub').textContent = `€${price} × ${nights}`;
    document.getElementById('sp-total').textContent = `€${total}`;
    
    updatePrepay(total);
}

function updatePrepay(totalVal) {
    const t = document.getElementById('nb-btype')?.value;
    if(!t) return;
    const total = totalVal || parseInt(document.getElementById('sp-total').textContent.replace('€',''));
    const config = prepayMap[t];
    const amt = Math.round(total * config.pct / 100);
    
    document.getElementById('prepay-box').innerHTML = `<i class="ti ti-info-circle" aria-hidden="true"></i> Προκαταβολή: ${config.txt} — <strong>€${amt}</strong>`;
}

async function submitBooking() {
    const firstName = document.getElementById('nb-first')?.value;
    const lastName = document.getElementById('nb-last')?.value;
    const phone = document.getElementById('nb-phone')?.value;
    const email = document.getElementById('nb-email')?.value;
    const checkIn = document.getElementById('nb-in')?.value;
    const checkOut = document.getElementById('nb-out')?.value;
    const bookingType = document.getElementById('nb-btype')?.value;
    const totalCostText = document.getElementById('sp-total').textContent;
    const totalCost = parseFloat(totalCostText.replace('€', ''));

    if (!lastName || !firstName || !phone || !email || !checkIn || !checkOut) {
        showToast('Παρακαλώ συμπληρώστε Όνομα, Επώνυμο, Τηλέφωνο, Email και ημερομηνίες.', 'error');
        return;
    }
    if (!selectedRoom) {
        showToast('Παρακαλώ επιλέξτε ένα διαθέσιμο δωμάτιο.', 'error');
        return;
    }

    try {
        if (!await window.showConfirm('Καταχώρηση κράτησης;')) return;
        const { data: customer, error: custError } = await window.supabase
            .from('CUSTOMER')
            .insert([{ FirstName: firstName, LastName: lastName, Phone: phone, Email: email, IsGroup: (bookingType === 'group') }])
            .select().single();

        if (custError) throw custError;

        const { data: result, error: rpcError } = await window.supabase
            .rpc('book_room_atomic', {
                p_customer_id: customer.CustomerID,
                p_check_in: checkIn,
                p_check_out: checkOut,
                p_total_cost: totalCost,
                p_status: 'Confirmed',
                p_room_number: Number(selectedRoom)
            });

        if (rpcError) {
            if (rpcError.message && rpcError.message.includes('ROOM_ALREADY_BOOKED')) {
                showToast('Η κράτηση απέτυχε: Το δωμάτιο μόλις κρατήθηκε από άλλον χρήστη.', 'error');
            } else {
                throw rpcError;
            }
            return;
        }

        const rtypeMap = { 85: 'Μονόκλινο', 140: 'Δίκλινο', 175: 'Φαρδύκλινο', 380: 'Σουίτα' };
        const roomType = rtypeMap[parseInt(document.getElementById('nb-rtype').value)];
        const resId = result?.ReservationID;
        if (resId && roomType) {
            await window.supabase.from('RESERVATION').update({ RoomType: roomType }).eq('ReservationID', resId);
        }

        showToast(`Η κράτηση καταχωρήθηκε! Εκχωρήθηκε το δωμάτιο ${selectedRoom}.`, 'success');
        selectedRoom = null;
        fetchTodayReservations();
        fetchRoomsAndRender();
        navTo('dash');
        
        document.getElementById('nb-first').value = '';
        document.getElementById('nb-last').value = '';

    } catch (err) {
        showToast("Αποτυχία καταχώρησης: " + err.message, "error");
    }
}

async function fetchAvailableRooms() {
    const checkIn = document.getElementById('nb-in').value;
    const checkOut = document.getElementById('nb-out').value;
    const rtypeEl = document.getElementById('nb-rtype');
    if (!checkIn || !checkOut || !rtypeEl) {
        showToast('Επιλέξτε πρώτα ημερομηνίες άφιξης και αναχώρησης.', 'error');
        return;
    }
    if (new Date(checkIn) >= new Date(checkOut)) {
        showToast('Η ημερομηνία αναχώρησης πρέπει να είναι μετά την άφιξη.', 'error');
        return;
    }

    const typeMap = { 85: 'Μονόκλινο', 140: 'Δίκλινο', 175: 'Φαρδύκλινο', 380: 'Σουίτα' };
    const roomType = typeMap[parseInt(rtypeEl.value)];

    try {
        const { data: overlapping, error: olErr } = await window.supabase
            .from('RESERVATION')
            .select('ReservationID')
            .lt('CheckInDate', checkOut)
            .gt('CheckOutDate', checkIn)
            .not('Status', 'in', '("Cancelled","CheckedOut")');

        if (olErr) throw olErr;

        let busyRoomNumbers = [];
        if (overlapping && overlapping.length > 0) {
            const ids = overlapping.map(r => r.ReservationID);
            const { data: busyRooms, error: brErr } = await window.supabase
                .from('RESERVATION_ROOM')
                .select('RoomNumber')
                .in('ReservationID', ids);
            if (brErr) throw brErr;
            busyRoomNumbers = (busyRooms || []).map(r => r.RoomNumber);
        }

        const { data: allRooms, error: allErr } = await window.supabase
            .from('ROOM')
            .select('*')
            .eq('RoomType', roomType);

        if (allErr) throw allErr;

        const available = (allRooms || []).filter(r =>
            !busyRoomNumbers.includes(r.RoomNumber) &&
            ['free', 'clean', 'dirty', 'occ'].includes(r.Status)
        );

        // Query checkout dates for 'occ' rooms
        let checkoutMap = {};
        const occNums = available.filter(r => r.Status === 'occ').map(r => r.RoomNumber);
        if (occNums.length > 0) {
            const { data: rrData } = await window.supabase
                .from('RESERVATION_ROOM')
                .select('RoomNumber, ReservationID')
                .in('RoomNumber', occNums);
            if (rrData && rrData.length > 0) {
                const ids = rrData.map(r => r.ReservationID);
                const { data: resData } = await window.supabase
                    .from('RESERVATION')
                    .select('ReservationID, CheckOutDate')
                    .in('ReservationID', ids)
                    .not('Status', 'in', '("Cancelled","CheckedOut")');
                if (resData) {
                    const map = {};
                    resData.forEach(r => map[r.ReservationID] = r.CheckOutDate);
                    rrData.forEach(rr => { if (map[rr.ReservationID]) checkoutMap[rr.RoomNumber] = map[rr.ReservationID]; });
                }
            }
        }
        const section = document.getElementById('nb-room-section');
        if (section) section.style.display = 'block';
        renderAvailableRooms(available, checkoutMap);

        const existing = section?.querySelector('.capacity-note');
        if (existing) existing.remove();
        try {
            const cap = await window.checkRoomTypeCapacity(roomType, checkIn, checkOut);
            if (cap.total > 0 && section) {
                const note = document.createElement('div');
                note.className = 'capacity-note';
                note.style.cssText = 'font-size:12px;margin-top:8px;padding:8px 10px;border-radius:6px;display:flex;align-items:center;gap:6px;';
                if (cap.isFull) {
                    note.style.cssText += 'background:#FEF2F2;color:#991B1B;border:1px solid #FECACA;';
                    note.innerHTML = '<i class="ti ti-alert-triangle"></i> ' + roomType + ': Πλήρως κλεισμένο (' + cap.booked + '/' + cap.total + ')';
                    section.appendChild(note);
                } else if (cap.available <= 5) {
                    note.style.cssText += 'background:#FFF8E6;color:#7A6118;border:1px solid #FDE68A;';
                    note.innerHTML = '<i class="ti ti-info-circle"></i> ' + roomType + ': Μόνο ' + cap.available + ' δωμάτια απομένουν (' + cap.booked + '/' + cap.total + ' κλεισμένα)';
                    section.appendChild(note);
                }
            }
        } catch (e) {
            console.warn('Capacity check failed:', e);
        }

    } catch (err) {
        showToast('Σφάλμα αναζήτησης: ' + err.message, 'error');
    }
}

function renderAvailableRooms(rooms, checkoutMap = {}) {
    const container = document.getElementById('avail-rooms');
    if (!container) return;

    rooms.sort((a, b) => parseInt(a.RoomNumber) - parseInt(b.RoomNumber));

    if (rooms.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;font-size:12px;color:var(--text-muted);padding:8px 0;">Δεν υπάρχουν διαθέσιμα δωμάτια αυτού του τύπου.</div>';
        return;
    }

    container.innerHTML = rooms.map(r => {
        const state = typeof r.Status === 'string'
            ? mapDbStatusToUI(r.Status)
            : (hotelRooms.find(h => h.id == r.RoomNumber)?.state || 'free');
        let label, color;
        if (state === 'free') { label = 'Έτοιμο για νέο πελάτη'; color = '#1D9E75'; }
        else if (state === 'dirty') { label = 'Άδειο (χωρίς καθαριότητα)'; color = '#EF9F27'; }
        else if (state === 'occ') {
          const soon = isSoonCheckout(checkoutMap[r.RoomNumber]);
          label = soon ? 'Προσεχώς άδειο' : 'Κατειλημμένο';
          color = soon ? '#D85A30' : '#991B1B';
        }
        else { label = 'Έτοιμο για νέο πελάτη'; color = '#1D9E75'; }
        return `
        <div class="room-opt${selectedRoom === r.RoomNumber ? ' selected' : ''}"
             onclick="selectRoom(${r.RoomNumber}, this)"
             data-room="${r.RoomNumber}">
            <div style="font-weight:600;font-size:14px;">${r.RoomNumber}</div>
            <div style="font-size:10px;color:${color};">${label}</div>
        </div>
    `}).join('');
}

window.selectRoom = function(roomNum, el) {
    if (selectedRoom === roomNum) {
        selectedRoom = null;
        document.querySelectorAll('.room-opt').forEach(opt => {
            opt.classList.remove('selected');
            opt.style.display = '';
        });
        return;
    }
    selectedRoom = roomNum;
    document.querySelectorAll('.room-opt').forEach(opt => {
        const match = opt.dataset.room == roomNum;
        opt.classList.toggle('selected', match);
        opt.style.display = match ? '' : 'none';
    });
};

/* ==============================================================
   PRO CHECK-IN (WITH MODAL) & CHECK-OUT LOGIC
   ============================================================== */
let activeCheckinResId = null;
let activeCheckinRoom = null;

function openCheckinModal(reservationId, customerName, roomType = '', preAssignedRoom = null) {
    activeCheckinResId = reservationId;
    activeCheckinRoom = preAssignedRoom;

    const custEl = document.getElementById('modal-cust-name');
    const roomWrap = document.getElementById('modal-room-wrap');
    const assignedWrap = document.getElementById('modal-assigned-wrap');
    const select = document.getElementById('modal-room-select');
    const typeEl = document.getElementById('modal-room-type');

    if (!custEl || !roomWrap || !assignedWrap || !select) {
        showToast('Σφάλμα: το modal δεν βρέθηκε', 'error');
        return;
    }
    custEl.textContent = customerName;
    if (typeEl) typeEl.textContent = roomType || '—';
    
    if (preAssignedRoom) {
        roomWrap.style.display = 'none';
        assignedWrap.style.display = 'block';
        const assignedVal = document.getElementById('modal-assigned-val');
        if (assignedVal) assignedVal.textContent = preAssignedRoom;
    } else {
        roomWrap.style.display = 'block';
        assignedWrap.style.display = 'none';

        if (hotelRooms.length === 0) {
            showToast('Τα δωμάτια δεν έχουν φορτωθεί ακόμα.', 'error');
            return;
        }

        select.innerHTML = '<option value="">-- Επιλέξτε Δωμάτιο --</option>';

        let availableRooms = hotelRooms.filter(r => r.state === 'free');
        if (roomType) {
            availableRooms = availableRooms.filter(r => r.type === roomType);
        }

        if (availableRooms.length === 0) {
            select.innerHTML += '<option value="" disabled>Δεν υπάρχουν διαθέσιμα δωμάτια</option>';
        } else {
            availableRooms.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.textContent = `Δωμάτιο ${r.id} (${r.type})`;
                select.appendChild(opt);
            });
        }
    }

    document.getElementById('checkin-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('checkin-modal').style.display = 'none';
    activeCheckinResId = null;
    activeCheckinRoom = null;
}

async function confirmCheckin() {
    let selectedRoom = activeCheckinRoom;

    if (!selectedRoom) {
        selectedRoom = document.getElementById('modal-room-select').value;
    }

    if (!selectedRoom) {
        showToast('Πρέπει να επιλέξετε ένα δωμάτιο για τον πελάτη!', 'error');
        return;
    }

    try {
        if (!await window.showConfirm('Επιβεβαίωση check-in;')) return;

        await window.supabase.from('RESERVATION').update({ Status: 'CheckedIn' }).eq('ReservationID', activeCheckinResId);

        if (activeCheckinRoom) {
            await window.supabase.from('ROOM').update({ Status: 'occ' }).eq('RoomNumber', selectedRoom);
        } else {
            await window.supabase.from('RESERVATION_ROOM').insert([{ ReservationID: activeCheckinResId, RoomNumber: selectedRoom }]);
            await window.supabase.from('ROOM').update({ Status: 'occ' }).eq('RoomNumber', selectedRoom);
        }

        showToast(`Το Check-in ολοκληρώθηκε! Εκχωρήθηκε το δωμάτιο ${selectedRoom}.`, 'success');

        closeModal();
        fetchTodayReservations();
        fetchRoomsAndRender();

    } catch (err) {
        showToast("Σφάλμα κατά το Check-in: " + err.message, "error");
    }
}

async function doCheckout(btn, name, reservationId, roomNumber) {
    if (!await window.showConfirm(`Επιβεβαίωση check-out για ${name};`)) return;
    try {
        // 1. Ενημέρωση κράτησης σε CheckedOut
        await window.supabase.from('RESERVATION').update({ Status: 'CheckedOut' }).eq('ReservationID', reservationId);
        
        // 2. Αν υπάρχει δωμάτιο, το κάνουμε "dirty" (Υπό καθαρισμό)
        if (roomNumber && roomNumber !== '-') {
            await window.supabase.from('ROOM').update({ Status: 'dirty' }).eq('RoomNumber', roomNumber);
        }

        showToast(`Επιτυχές Check-out! Το δωμάτιο ${roomNumber} στάλθηκε για καθάρισμα.`, 'success');
        
        fetchTodayReservations();
        fetchRoomsAndRender();

    } catch (err) {
        showToast("Σφάλμα Check-out: " + err.message, "error");
    }
}

/* ==============================================================
   ROOM SEARCH & BOOKING (v-room-search)
   ============================================================== */
let rsState = { checkIn: null, checkOut: null, selectedRoom: null, roomPrice: 0, roomType: '' };
let rsSort = { field: null, asc: true };

function sortRooms(field) {
    if (rsSort.field === field) { rsSort.asc = !rsSort.asc; }
    else { rsSort.field = field; rsSort.asc = true; }
    renderSearchResults(rsState.availableRooms);
}

window.searchAvailableRooms = async function () {
    const checkIn = document.getElementById('rs-checkin').value;
    const checkOut = document.getElementById('rs-checkout').value;

    if (!checkIn || !checkOut) {
        showToast('Επιλέξτε ημερομηνίες άφιξης και αναχώρησης.', 'error');
        return;
    }
    if (new Date(checkIn) >= new Date(checkOut)) {
        showToast('Η ημερομηνία αναχώρησης πρέπει να είναι μετά την άφιξη.', 'error');
        return;
    }

    try {
        // Query 1: overlapping active reservation IDs (overlap formula)
        const { data: overlapping, error: olErr } = await window.supabase
            .from('RESERVATION')
            .select('ReservationID')
            .lt('CheckInDate', checkOut)
            .gt('CheckOutDate', checkIn)
            .not('Status', 'in', '("Cancelled","CheckedOut")');

        if (olErr) throw olErr;

        // Collect busy room numbers
        let busyRoomNumbers = [];
        if (overlapping && overlapping.length > 0) {
            const ids = overlapping.map(r => r.ReservationID);
            const { data: busyRooms, error: brErr } = await window.supabase
                .from('RESERVATION_ROOM')
                .select('RoomNumber')
                .in('ReservationID', ids);

            if (brErr) throw brErr;
            busyRoomNumbers = (busyRooms || []).map(r => r.RoomNumber);
        }

        // Query 2: all rooms NOT busy and with bookable status
        const { data: allRooms, error: allErr } = await window.supabase
            .from('ROOM')
            .select('*');

        if (allErr) throw allErr;

        const available = (allRooms || []).filter(r =>
            !busyRoomNumbers.includes(r.RoomNumber) &&
            ['free', 'clean', 'dirty', 'occ'].includes(r.Status)
        );

        // Query checkout dates for 'occ' rooms
        let checkoutMap = {};
        const occNums = available.filter(r => r.Status === 'occ').map(r => r.RoomNumber);
        if (occNums.length > 0) {
            const { data: rrData } = await window.supabase
                .from('RESERVATION_ROOM')
                .select('RoomNumber, ReservationID')
                .in('RoomNumber', occNums);
            if (rrData && rrData.length > 0) {
                const ids = rrData.map(r => r.ReservationID);
                const { data: resData } = await window.supabase
                    .from('RESERVATION')
                    .select('ReservationID, CheckOutDate')
                    .in('ReservationID', ids)
                    .not('Status', 'in', '("Cancelled","CheckedOut")');
                if (resData) {
                    const map = {};
                    resData.forEach(r => map[r.ReservationID] = r.CheckOutDate);
                    rrData.forEach(rr => { if (map[rr.ReservationID]) checkoutMap[rr.RoomNumber] = map[rr.ReservationID]; });
                }
            }
        }
        rsState.checkoutMap = checkoutMap;
        rsState.availableRooms = available;
        rsState.checkIn = checkIn;
        rsState.checkOut = checkOut;
        renderSearchResults(available);

    } catch (err) {
        showToast('Σφάλμα αναζήτησης: ' + err.message, 'error');
    }
};

function renderSearchResults(rooms) {
    const card = document.getElementById('rs-results-card');
    const tbody = document.querySelector('#rs-results-table tbody');
    const count = document.getElementById('rs-count');
    if (!card || !tbody) return;

    card.style.display = 'block';

    if (!rooms || rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-text-secondary);padding:20px;">Δεν βρέθηκαν διαθέσιμα δωμάτια για τις επιλεγμένες ημερομηνίες.</td></tr>';
        count.textContent = '0 διαθέσιμα';
        return;
    }

    const sorted = [...rooms];
    if (rsSort.field) {
        const f = rsSort.field;
        sorted.sort((a, b) => {
            let va = a[f], vb = b[f];
            if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
            const cmp = va < vb ? -1 : va > vb ? 1 : 0;
            return rsSort.asc ? cmp : -cmp;
        });
    }

    document.querySelectorAll('#rs-results-table th[data-sort]').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (th.dataset.sort === rsSort.field) {
            arrow.textContent = rsSort.asc ? ' ▲' : ' ▼';
        } else {
            arrow.textContent = '';
        }
    });

    count.textContent = sorted.length + ' διαθέσιμα';
    tbody.innerHTML = sorted.map(r => {
        const st = r.Status;
        const isOcc = st === 'occ';
        const soon = isOcc && isSoonCheckout(rsState.checkoutMap[r.RoomNumber]);
        const label = st === 'free' || st === 'clean' ? 'Έτοιμο για νέο πελάτη' : st === 'dirty' ? 'Άδειο (χωρίς καθαριότητα)' : soon ? 'Προσεχώς άδειο' : 'Κατειλημμένο';
        const cls = st === 'free' || st === 'clean' ? 'p-g' : st === 'dirty' ? 'p-a' : soon ? 'p-a' : 'p-r';
        return `<tr>
            <td><strong>${r.RoomNumber}</strong></td>
            <td>${r.RoomType}</td>
            <td>€${r.BasePrice}</td>
            <td><span class="pill ${cls}">${label}</span></td>
            <td>
                <button class="btn btn-sm btn-dark" onclick="openRsBookingModal('${r.RoomNumber}', '${r.RoomType}', ${r.BasePrice})">
                    <i class="ti ti-calendar-plus"></i> Book Now
                </button>
            </td>
        </tr>`;
    }).join('');
}

window.openRsBookingModal = function (roomNum, roomType, basePrice) {
    rsState.selectedRoom = roomNum;
    rsState.roomType = roomType;
    rsState.roomPrice = basePrice;

    const nights = Math.max(1, Math.round((new Date(rsState.checkOut) - new Date(rsState.checkIn)) / 86400000));
    const total = basePrice * nights;

    document.getElementById('rs-modal-room').textContent = '— Δωμάτιο ' + roomNum;
    document.getElementById('rs-modal-room-type').textContent = roomType;
    document.getElementById('rs-modal-nights').textContent = nights;
    document.getElementById('rs-modal-rate').textContent = '€' + basePrice;
    document.getElementById('rs-modal-total').textContent = '€' + total;

    document.getElementById('rs-booking-modal').style.display = 'flex';
};

function closeRsModal() {
    document.getElementById('rs-booking-modal').style.display = 'none';
}

window.confirmRsBooking = async function () {
    const firstName = document.getElementById('rs-modal-first').value.trim();
    const lastName = document.getElementById('rs-modal-last').value.trim();
    const phone = document.getElementById('rs-modal-phone').value.trim();
    const email = document.getElementById('rs-modal-email').value.trim();
    const bookingType = document.getElementById('rs-modal-btype').value;

    if (!firstName || !lastName || !phone || !email) {
        showToast('Παρακαλώ συμπληρώστε Όνομα, Επώνυμο, Τηλέφωνο και Email.', 'error');
        return;
    }

    if (!await window.showConfirm('Επιβεβαίωση κράτησης δωματίου ' + rsState.selectedRoom + ';')) return;

    try {
        // 1. Insert customer (non-critical, safe to do first)
        const { data: customer, error: custErr } = await window.supabase
            .from('CUSTOMER')
            .insert([{
                FirstName: firstName,
                LastName: lastName,
                Phone: phone,
                Email: email,
                IsGroup: (bookingType === 'group')
            }])
            .select()
            .single();

        if (custErr) throw custErr;

        const nights = Math.max(1, Math.round((new Date(rsState.checkOut) - new Date(rsState.checkIn)) / 86400000));
        const totalCost = rsState.roomPrice * nights;

        // 2. Atomic booking via RPC (re-checks availability inside transaction)
        const { data: result, error: rpcError } = await window.supabase
            .rpc('book_room_atomic', {
                p_customer_id: customer.CustomerID,
                p_check_in: rsState.checkIn,
                p_check_out: rsState.checkOut,
                p_total_cost: totalCost,
                p_status: 'Confirmed',
                p_room_number: Number(rsState.selectedRoom)
            });

        if (rpcError) {
            if (rpcError.message && rpcError.message.includes('ROOM_ALREADY_BOOKED')) {
                showToast('Η κράτηση απέτυχε: Το δωμάτιο μόλις κρατήθηκε από άλλον χρήστη.', 'error');
            } else {
                throw rpcError;
            }
            return;
        }

        const resId = result?.ReservationID;
        if (resId && rsState.roomType) {
            await window.supabase.from('RESERVATION').update({ RoomType: rsState.roomType }).eq('ReservationID', resId);
        }

        showToast('Η κράτηση ολοκληρώθηκε! Δωμάτιο ' + rsState.selectedRoom + ' ανατέθηκε.', 'success');
        closeRsModal();

        // Refresh dashboard & room data
        fetchTodayReservations();
        fetchRoomsAndRender();
        searchAvailableRooms();

    } catch (err) {
        showToast('Αποτυχία κράτησης: ' + err.message, 'error');
    }
};

/* ==============================================================
   SEARCH / FILTER FOR ARRIVALS & DEPARTURES
   ============================================================== */
function normalizeGreek(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/ς/g, 'σ');
}

function filterArrivals() {
    const q = normalizeGreek(document.getElementById('arrivals-search').value);
    document.querySelectorAll('#v-arrivals table tbody tr').forEach(row => {
        const name = normalizeGreek(row.cells[0]?.textContent || '');
        const room = normalizeGreek(row.cells[2]?.textContent || '');
        row.style.display = (name.includes(q) || room.includes(q)) ? '' : 'none';
    });
}
function filterDepartures() {
    const q = normalizeGreek(document.getElementById('departures-search').value);
    document.querySelectorAll('#v-departures table tbody tr').forEach(row => {
        const name = normalizeGreek(row.cells[0]?.textContent || '');
        const room = normalizeGreek(row.cells[1]?.textContent || '');
        row.style.display = (name.includes(q) || room.includes(q)) ? '' : 'none';
    });
}

/* ==============================================================
   INITIALIZATION
   ============================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    while (!window.supabase) await new Promise(r => setTimeout(r, 50));

    const loader = document.getElementById('app-loader');
    if (loader) loader.style.display = 'none';
    document.querySelector('.app').style.display = 'flex';

    fetchRoomsAndRender();
    fetchTodayReservations();

    // Set default dates: today & today + 3 days
    const today = new Date();
    const plus3 = new Date(today);
    plus3.setDate(plus3.getDate() + 3);
    const fmt = d => d.toISOString().split('T')[0];
    const nbIn = document.getElementById('nb-in');
    const nbOut = document.getElementById('nb-out');
    if (nbIn) nbIn.value = fmt(today);
    if (nbOut) nbOut.value = fmt(plus3);
    const rsIn = document.getElementById('rs-checkin');
    const rsOut = document.getElementById('rs-checkout');
    if (rsIn) rsIn.value = fmt(today);
    if (rsOut) rsOut.value = fmt(plus3);
    if (document.getElementById('nb-rtype')) updatePrice();
});