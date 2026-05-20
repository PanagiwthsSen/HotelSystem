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
    bookings: 'Όλες οι Κρατήσεις',
    minibar: 'Χρεώσεις Mini-bar', policies: 'Πολιτική Ξενοδοχείου'
};

function navTo(id) {
    document.querySelectorAll('.sb-item').forEach(i => i.classList.toggle('active', i.dataset.v === id));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
    document.getElementById('tb-title').textContent = viewTitles[id] || id;
    if (id === 'new-booking') fetchAvailableRooms();
    if (id === 'bookings') fetchAllReservations();
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
  if (state === 'soon') return 'Προσεχώς άδειο';
  if (state === 'occ') return 'Κατειλημμένο';
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

        hotelRooms = rooms.map(r => {
            const state = mapDbStatusToUI(r.Status);
            const checkOutDate = checkoutMap[r.RoomNumber] || null;
            return {
                id: r.RoomNumber,
                type: r.RoomType,
                state: state === 'occ' && isSoonCheckout(checkOutDate) ? 'soon' : state,
                dbStatus: r.Status,
                checkOutDate
            };
        });

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
    const paymentMethod = document.getElementById('nb-payment')?.value;
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
        if (resId && paymentMethod) {
            await window.supabase.from('RESERVATION').update({ PaymentMethod: paymentMethod }).eq('ReservationID', resId);
        }
        if (resId && bookingType) {
            await window.supabase.from('RESERVATION').update({ BookingType: bookingType, NumberOfGuests: 1, Deposit: 0 }).eq('ReservationID', resId);
        }

        // Create initial history entry
        if (resId) {
            const user = JSON.parse(localStorage.getItem('hotel_user') || '{}');
            await window.supabase.from('RESERVATION_HISTORY').insert([{
                ReservationID: resId,
                Action: 'created',
                ChangedBy: user.name || 'Σύστημα',
                ChangedByEmpID: user.id || null
            }]);
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
        else if (state === 'dirty') { label = 'Άδειο (χωρίς καθαριότητα)'; color = '#EAB308'; }
        else if (state === 'soon') { label = 'Προσεχώς άδειο'; color = '#F97316'; }
        else if (state === 'occ') { label = 'Κατειλημμένο'; color = '#DC2626'; }
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

    let custEl = document.getElementById('modal-cust-name');
    let roomWrap = document.getElementById('modal-room-wrap');
    let assignedWrap = document.getElementById('modal-assigned-wrap');
    let select = document.getElementById('modal-room-select');
    let typeEl = document.getElementById('modal-room-type');

    if (!custEl || !roomWrap || !assignedWrap || !select) {
        const modal = document.createElement('div');
        modal.id = 'checkin-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
        <div class="pw-modal">
            <div class="pw-head">
                <i class="ti ti-key"></i>
                <span>Εκχώρηση Δωματίου</span>
                <span class="pw-close" onclick="closeModal()">&times;</span>
            </div>
            <div class="pw-body">
                <p style="margin-bottom:16px;font-size:13px;color:#6B7280;">
                    Πελάτης: <strong id="modal-cust-name" style="color:#111827;"></strong><br>
                    <span style="font-size:12px;color:#9CA3AF;">Τύπος Δωματίου: <strong id="modal-room-type" style="color:#111827;">—</strong></span>
                </p>
                <div id="modal-room-wrap" class="pw-field">
                    <label for="modal-room-select">Διαθέσιμο δωμάτιο:</label>
                    <select id="modal-room-select" style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;font-family:inherit;"></select>
                </div>
                <div id="modal-assigned-wrap" style="display:none;padding:10px 12px;border-radius:6px;background:#F3F4F6;font-size:13px;">
                    Θα γίνει check-in στο δωμάτιο <strong id="modal-assigned-val"></strong>
                </div>
            </div>
            <div class="pw-foot">
                <button class="btn" onclick="closeModal()">Ακύρωση</button>
                <button class="btn btn-dark" onclick="confirmCheckin()"><i class="ti ti-check"></i> Επιβεβαίωση</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        custEl = document.getElementById('modal-cust-name');
        roomWrap = document.getElementById('modal-room-wrap');
        assignedWrap = document.getElementById('modal-assigned-wrap');
        select = document.getElementById('modal-room-select');
        typeEl = document.getElementById('modal-room-type');
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
    const paymentMethod = document.getElementById('rs-modal-payment').value;

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
        if (resId && paymentMethod) {
            await window.supabase.from('RESERVATION').update({ PaymentMethod: paymentMethod }).eq('ReservationID', resId);
        }
        if (resId && bookingType) {
            await window.supabase.from('RESERVATION').update({ BookingType: bookingType, NumberOfGuests: 1, Deposit: 0 }).eq('ReservationID', resId);
        }

        // Create initial history entry
        if (resId) {
            const user = JSON.parse(localStorage.getItem('hotel_user') || '{}');
            await window.supabase.from('RESERVATION_HISTORY').insert([{
                ReservationID: resId,
                Action: 'created',
                ChangedBy: user.name || 'Σύστημα',
                ChangedByEmpID: user.id || null
            }]);
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
   ALL BOOKINGS VIEW (v-bookings)
   ============================================================== */
let allReservations = [];

async function fetchAllReservations() {
    try {
        const { data, error } = await window.supabase
            .from('RESERVATION')
            .select(`ReservationID, CheckInDate, CheckOutDate, TotalCost, Status, RoomType, PaymentMethod, Notes, NumberOfGuests, Deposit, BookingType, EditedAt, EditedBy, CUSTOMER ( CustomerID, FirstName, LastName, Phone, Email, IsGroup )`);

        if (error) throw error;

        const ids = (data || []).map(r => r.ReservationID);
        const roomMap = {};
        if (ids.length > 0) {
            const { data: rrData, error: rrErr } = await window.supabase
                .from('RESERVATION_ROOM')
                .select('ReservationID, RoomNumber')
                .in('ReservationID', ids);
            if (!rrErr && rrData) {
                rrData.forEach(r => { roomMap[r.ReservationID] = r.RoomNumber; });
            }
        }

        data.forEach(r => { r._roomNumber = roomMap[r.ReservationID] || '—'; });
        allReservations = data;
        renderAllBookings(data);
    } catch (err) {
        console.error('fetchAllReservations error:', err.message);
        showToast('Σφάλμα φόρτωσης κρατήσεων: ' + err.message, 'error');
    }
}

function renderAllBookings(reservations) {
    const tbody = document.getElementById('bk-body');
    const countEl = document.getElementById('bk-count');
    if (!tbody) return;

    if (!reservations || reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--color-text-secondary);padding:24px;">Δεν βρέθηκαν κρατήσεις.</td></tr>';
        if (countEl) countEl.textContent = '0 κρατήσεις';
        return;
    }

    if (countEl) countEl.textContent = reservations.length + ' κρατήσεις';

    const statusLabels = {
        'Confirmed': { label: 'Επιβεβαιωμένη', cls: 'p-g' },
        'CheckedIn': { label: 'Check-in', cls: 'p-b' },
        'CheckedOut': { label: 'Check-out', cls: 'p-r' },
        'Cancelled': { label: 'Ακυρωμένη', cls: 'p-a' }
    };

    tbody.innerHTML = reservations.map(r => {
        const c = r.CUSTOMER || {};
        const name = [c.FirstName, c.LastName].filter(Boolean).join(' ') || 'Άγνωστος';
        const type = c.IsGroup ? 'Γκρουπ' : 'Ιδιώτης';
        const st = statusLabels[r.Status] || { label: r.Status, cls: 'p-a' };
        const safeName = name.replace(/'/g, "\\'");
        const canCancel = r.Status === 'Confirmed';
        const canCheckin = r.Status === 'Confirmed';
        const isPast = new Date(r.CheckInDate) < new Date(new Date().toISOString().split('T')[0]);

        return `<tr>
            <td style="font-size:11px;color:var(--color-text-secondary)">${r.ReservationID}</td>
            <td><strong>${name}</strong></td>
            <td>${type}</td>
            <td>${r.CheckInDate}</td>
            <td>${r.CheckOutDate}</td>
            <td>${r._roomNumber}</td>
            <td>€${Number(r.TotalCost).toFixed(2)}</td>
            <td><span class="pill ${st.cls}">${st.label}</span></td>
            <td style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-sm" onclick="viewReservation(${r.ReservationID})" title="Λεπτομέρειες"><i class="ti ti-eye"></i></button>
                <button class="btn btn-sm" onclick="openEditReservationModal(${r.ReservationID})" title="Επεξεργασία"><i class="ti ti-edit"></i></button>
                ${canCheckin ? `<button class="btn btn-sm btn-dark" onclick="navTo('arrivals')" title="Check-in"><i class="ti ti-door-enter"></i></button>` : ''}
                ${canCancel ? `<button class="btn btn-sm" style="color:#E24B4A;" onclick="cancelReservation(${r.ReservationID})" title="Ακύρωση"><i class="ti ti-x"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

/* ==============================================================
   EDIT RESERVATION MODAL
   ============================================================== */
let editState = {};

function closeEditModal() {
    const overlay = document.getElementById('edit-reservation-overlay');
    if (overlay) overlay.remove();
    editState = {};
}

function recalcEditPrice() {
    const checkIn = document.getElementById('edit-checkin')?.value;
    const checkOut = document.getElementById('edit-checkout')?.value;
    const roomSelect = document.getElementById('edit-room');
    if (!roomSelect || !checkIn || !checkOut) return;

    const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
    const basePrice = parseFloat(roomSelect.options[roomSelect.selectedIndex]?.dataset?.price || editState.basePrice || 0);
    const manualTotal = parseFloat(document.getElementById('edit-total-cost')?.value) || 0;
    const deposit = parseFloat(document.getElementById('edit-deposit')?.value) || 0;

    const calcTotal = basePrice * nights;
    const total = manualTotal > 0 ? manualTotal : calcTotal;
    const balance = total - deposit;

    const nightsEl = document.getElementById('edit-nights');
    const totalDisplayEl = document.getElementById('edit-total-display');
    const balanceEl = document.getElementById('edit-balance');
    const depositDisplayEl = document.getElementById('edit-deposit-display');

    if (nightsEl) nightsEl.textContent = nights;
    if (totalDisplayEl) totalDisplayEl.textContent = `€${total.toFixed(2)}`;
    if (depositDisplayEl) depositDisplayEl.textContent = `€${deposit.toFixed(2)}`;
    if (balanceEl) balanceEl.textContent = `€${balance.toFixed(2)}`;
    if (balanceEl) balanceEl.style.color = balance <= 0 ? '#1D9E75' : '#DC2626';
}

window.openEditReservationModal = async function (reservationId) {
    const r = allReservations.find(x => x.ReservationID === reservationId);
    if (!r) { showToast('Η κράτηση δεν βρέθηκε.', 'error'); return; }

    const existing = document.getElementById('edit-reservation-overlay');
    if (existing) existing.remove();

    const c = r.CUSTOMER || {};
    const user = JSON.parse(localStorage.getItem('hotel_user') || '{}');

    editState = {
        reservationId: r.ReservationID,
        originalCustomer: { ...c },
        originalReservation: { ...r },
        basePrice: 0
    };

    const overlay = document.createElement('div');
    overlay.id = 'edit-reservation-overlay';
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `<div class="pw-modal edit-modal"><div class="edit-loading" id="edit-loading"><i class="ti ti-loader"></i>Φόρτωση στοιχείων...</div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEditModal(); });
    document.body.appendChild(overlay);

    try {
        const { data: rooms, error: roomsErr } = await window.supabase
            .from('ROOM')
            .select('*')
            .order('RoomNumber');
        if (roomsErr) throw roomsErr;

        const { data: rrData } = await window.supabase
            .from('RESERVATION_ROOM')
            .select('RoomNumber')
            .eq('ReservationID', r.ReservationID)
            .maybeSingle();
        const currentRoomNumber = rrData?.RoomNumber;

        const { data: historyData } = await window.supabase
            .from('RESERVATION_HISTORY')
            .select('*')
            .eq('ReservationID', r.ReservationID)
            .order('ChangedAt', { ascending: false })
            .limit(20);

        const roomOptionsHtml = rooms.map(room => {
            const isCurrent = room.RoomNumber === currentRoomNumber;
            const isFree = room.Status === 'free' || room.Status === 'clean';
            const availableLabel = isFree ? '' : ' (κατειλημμένο)';
            const disabled = !isFree && !isCurrent;
            return `<option value="${room.RoomNumber}" 
                data-price="${room.BasePrice}" 
                data-type="${room.RoomType}"
                ${isCurrent ? 'selected' : ''} 
                ${disabled ? 'disabled' : ''}>
                Δωμ. ${room.RoomNumber} — ${room.RoomType} (€${room.BasePrice})${availableLabel}
            </option>`;
        }).join('');

        const roomPrice = rooms.find(rr => rr.RoomNumber === currentRoomNumber)?.BasePrice || 0;
        editState.basePrice = roomPrice;
        editState.currentRoomNumber = currentRoomNumber;
        editState.rooms = rooms;

        const bookingTypeLabels = {
            phone: 'Τηλεφωνική (20% Προκαταβολή)',
            prepaid: 'Προπληρωμένη (50% Προπληρωμή)',
            group: 'Γκρουπ (Ειδική Προκαταβολή)',
            walkin: 'Walk-in (Άμεση Πληρωμή)'
        };
        const statusLabels = {
            Confirmed: 'Επιβεβαιωμένη',
            CheckedIn: 'Check-in',
            CheckedOut: 'Check-out',
            Cancelled: 'Ακυρωμένη'
        };
        const paymentLabels = {
            cash: 'Μετρητά',
            card: 'Κάρτα',
            bank_transfer: 'Τραπεζικό Έμβασμα'
        };

        const btypeOptions = Object.entries(bookingTypeLabels).map(([v, lbl]) =>
            `<option value="${v}"${r.BookingType === v ? ' selected' : ''}>${lbl}</option>`
        ).join('');
        const statusOptions = Object.entries(statusLabels).map(([v, lbl]) =>
            `<option value="${v}"${r.Status === v ? ' selected' : ''}>${lbl}</option>`
        ).join('');
        const paymentOptions = Object.entries(paymentLabels).map(([v, lbl]) =>
            `<option value="${v}"${r.PaymentMethod === v ? ' selected' : ''}>${lbl}</option>`
        ).join('');

        const nights = Math.max(1, Math.round((new Date(r.CheckOutDate) - new Date(r.CheckInDate)) / 86400000));
        const total = parseFloat(r.TotalCost) || 0;
        const deposit = parseFloat(r.Deposit) || 0;
        const balance = total - deposit;

        let historyHtml = '';
        if (historyData && historyData.length > 0) {
            const actionLabels = {
                created: 'Δημιουργήθηκε',
                edited: 'Επεξεργασία',
                extended: 'Παράταση διαμονής',
                early_checkout: 'Πρόωρη αναχώρηση'
            };
            const actionDots = {
                created: 'created',
                edited: 'edited',
                extended: 'extended',
                early_checkout: 'early'
            };
            historyHtml = historyData.map(h => {
                const dot = actionDots[h.Action] || 'other';
                const label = actionLabels[h.Action] || h.Action;
                const date = new Date(h.ChangedAt).toLocaleString('el-GR');
                return `<div class="edit-history-item">
                    <span class="edit-history-dot ${dot}"></span>
                    <span class="edit-history-text"><strong>${label}</strong> από ${h.ChangedBy}</span>
                    <span class="edit-history-date">${date}</span>
                </div>`;
            }).join('');
        } else {
            historyHtml = '<div style="color:#9CA3AF;font-size:11px;">Δεν υπάρχει ιστορικό αλλαγών.</div>';
        }

        const createdHistory = historyData && historyData.find(h => h.Action === 'created');
        const createdDate = createdHistory ? new Date(createdHistory.ChangedAt).toLocaleString('el-GR') : '—';
        const createdBy = createdHistory?.ChangedBy || '—';

        overlay.innerHTML = `
        <div class="pw-modal edit-modal">
            <div class="pw-head">
                <i class="ti ti-edit"></i>
                <span>Επεξεργασία Κράτησης #${r.ReservationID}</span>
                <span class="pw-close" onclick="closeEditModal()">&times;</span>
            </div>
            <div class="pw-body">

                <!-- Guest Info -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-user"></i> Στοιχεία Πελάτη</div>
                    <div class="form-grid">
                        <div class="fg"><label>Όνομα *</label><input type="text" id="edit-first" value="${c.FirstName || ''}"></div>
                        <div class="fg"><label>Επώνυμο *</label><input type="text" id="edit-last" value="${c.LastName || ''}"></div>
                        <div class="fg"><label>Τηλέφωνο *</label><input type="tel" id="edit-phone" value="${c.Phone || ''}"></div>
                        <div class="fg"><label>Email *</label><input type="email" id="edit-email" value="${c.Email || ''}"></div>
                        <div class="fg"><label>Αριθμός Ατόμων</label><input type="number" id="edit-guests" min="1" max="20" value="${r.NumberOfGuests || 1}"></div>
                    </div>
                </div>

                <!-- Stay Details -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-building"></i> Στοιχεία Διαμονής</div>
                    <div class="form-grid">
                        <div class="fg"><label>Check-in *</label><input type="date" id="edit-checkin" value="${r.CheckInDate}" onchange="recalcEditPrice()"></div>
                        <div class="fg"><label>Check-out *</label><input type="date" id="edit-checkout" value="${r.CheckOutDate}" onchange="recalcEditPrice()"></div>
                        <div class="fg" style="grid-column:span 2;">
                            <label>Δωμάτιο</label>
                            <select id="edit-room" onchange="recalcEditPrice()">${roomOptionsHtml}</select>
                        </div>
                        <div class="fg"><label>Τύπος Κράτησης</label>
                            <select id="edit-btype">${btypeOptions}</select>
                        </div>
                        <div class="fg"><label>Κατάσταση</label>
                            <select id="edit-status">${statusOptions}</select>
                        </div>
                    </div>
                    <div id="edit-room-warning" class="edit-warning" style="display:none;margin-top:8px;"></div>
                </div>

                <!-- Payment -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-coin"></i> Στοιχεία Πληρωμής</div>
                    <div class="edit-summary">
                        <div>Τιμή δωματίου: <strong>€${roomPrice.toFixed(2)}</strong> /διαν.</div>
                        <div>Διανυκτερεύσεις: <strong id="edit-nights">${nights}</strong></div>
                        <div>Συνολικό Κόστος: <strong id="edit-total-display">€${total.toFixed(2)}</strong></div>
                        <div>Προκαταβολή: <strong id="edit-deposit-display">€${deposit.toFixed(2)}</strong></div>
                        <div>Υπόλοιπο: <strong id="edit-balance" style="color:${balance <= 0 ? '#1D9E75' : '#DC2626'}">€${balance.toFixed(2)}</strong></div>
                    </div>
                    <div class="form-grid">
                        <div class="fg"><label>Συνολικό Κόστος (€)</label><input type="number" id="edit-total-cost" step="0.01" value="${total.toFixed(2)}" onchange="recalcEditPrice()"></div>
                        <div class="fg"><label>Προκαταβολή (€)</label><input type="number" id="edit-deposit" step="0.01" value="${deposit.toFixed(2)}" onchange="recalcEditPrice()"></div>
                        <div class="fg"><label>Τρόπος Πληρωμής</label>
                            <select id="edit-payment">${paymentOptions}</select>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-notes"></i> Σημειώσεις</div>
                    <textarea id="edit-notes" rows="4" style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;font-family:inherit;resize:vertical;">${r.Notes || ''}</textarea>
                </div>

                <!-- History -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-history"></i> Ιστορικό Αλλαγών</div>
                    <div style="font-size:11px;color:#9CA3AF;margin-bottom:6px;">Δημιουργήθηκε: <strong>${createdDate}</strong> από <strong>${createdBy}</strong></div>
                    <div class="edit-history-list">${historyHtml}</div>
                </div>

                <div id="edit-save-warning" class="edit-warning" style="display:none;"></div>
            </div>
            <div class="pw-foot">
                <button class="btn" onclick="closeEditModal()">Ακύρωση</button>
                <button class="btn btn-dark" id="edit-save-btn" onclick="saveEditReservation()">
                    <i class="ti ti-check"></i> Αποθήκευση Αλλαγών
                </button>
            </div>
        </div>`;

    } catch (err) {
        overlay.innerHTML = `<div class="pw-modal edit-modal"><div class="edit-loading" style="color:#E24B4A;"><i class="ti ti-alert-circle"></i>Σφάλμα φόρτωσης: ${err.message}</div></div>`;
        showToast('Σφάλμα φόρτωσης: ' + err.message, 'error');
    }
};

window.saveEditReservation = async function () {
    const overlay = document.getElementById('edit-reservation-overlay');
    if (!overlay) return;

    const saveBtn = overlay.querySelector('#edit-save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Αποθήκευση...';

    try {
        const firstName = overlay.querySelector('#edit-first').value.trim();
        const lastName = overlay.querySelector('#edit-last').value.trim();
        const phone = overlay.querySelector('#edit-phone').value.trim();
        const email = overlay.querySelector('#edit-email').value.trim();
        const guests = parseInt(overlay.querySelector('#edit-guests').value) || 1;
        const checkIn = overlay.querySelector('#edit-checkin').value;
        const checkOut = overlay.querySelector('#edit-checkout').value;
        const roomNumber = parseInt(overlay.querySelector('#edit-room').value);
        const bookingType = overlay.querySelector('#edit-btype').value;
        const status = overlay.querySelector('#edit-status').value;
        const totalCost = parseFloat(overlay.querySelector('#edit-total-cost').value) || 0;
        const deposit = parseFloat(overlay.querySelector('#edit-deposit').value) || 0;
        const paymentMethod = overlay.querySelector('#edit-payment').value;
        const notes = overlay.querySelector('#edit-notes').value.trim();

        if (!firstName || !lastName || !phone || !email || !checkIn || !checkOut) {
            showToast('Συμπληρώστε Όνομα, Επώνυμο, Τηλέφωνο, Email και ημερομηνίες.', 'error');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
            return;
        }
        if (new Date(checkOut) <= new Date(checkIn)) {
            showToast('Η ημερομηνία αναχώρησης πρέπει να είναι μετά την άφιξη.', 'error');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
            return;
        }

        const rid = editState.reservationId;
        const orig = editState.originalReservation;
        const origCust = editState.originalCustomer;

        const changes = {};
        if (firstName !== origCust.FirstName) changes.Πελάτης = `${firstName} ${lastName}`;
        if (phone !== origCust.Phone) changes.Τηλέφωνο = phone;
        if (email !== origCust.Email) changes.Email = email;
        if (guests !== (orig.NumberOfGuests || 1)) changes.Άτομα = guests;
        if (checkIn !== orig.CheckInDate) changes.CheckIn = checkIn;
        if (checkOut !== orig.CheckOutDate) changes.CheckOut = checkOut;
        if (roomNumber !== editState.currentRoomNumber) changes.Δωμάτιο = roomNumber;
        if (bookingType !== (orig.BookingType || 'phone')) changes.Τύπος = bookingType;
        const editStatusLabels = { Confirmed: 'Επιβεβαιωμένη', CheckedIn: 'Check-in', CheckedOut: 'Check-out', Cancelled: 'Ακυρωμένη' };
        if (status !== orig.Status) changes.Κατάσταση = editStatusLabels[status] || status;
        if (Math.abs(totalCost - parseFloat(orig.TotalCost)) > 0.01) changes.Σύνολο = `€${totalCost}`;
        if (Math.abs(deposit - parseFloat(orig.Deposit || 0)) > 0.01) changes.Προκαταβολή = `€${deposit}`;
        if (paymentMethod !== (orig.PaymentMethod || 'cash')) changes.Πληρωμή = paymentMethod;
        if (notes !== (orig.Notes || '')) changes.Σημειώσεις = 'Ενημερώθηκαν';

        if (Object.keys(changes).length === 0) {
            showToast('Δεν υπάρχουν αλλαγές προς αποθήκευση.', 'info');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
            return;
        }

        // Room availability check if dates or room changed
        if (checkIn !== orig.CheckInDate || checkOut !== orig.CheckOutDate || roomNumber !== editState.currentRoomNumber) {
            const { data: overlapping } = await window.supabase
                .from('RESERVATION')
                .select('ReservationID')
                .lt('CheckInDate', checkOut)
                .gt('CheckOutDate', checkIn)
                .not('Status', 'in', '("Cancelled","CheckedOut")')
                .neq('ReservationID', rid);

            if (overlapping && overlapping.length > 0) {
                const ids = overlapping.map(r => r.ReservationID);
                const { data: busyRooms } = await window.supabase
                    .from('RESERVATION_ROOM')
                    .select('RoomNumber')
                    .in('ReservationID', ids);
                const busyNums = (busyRooms || []).map(r => r.RoomNumber);
                if (busyNums.includes(roomNumber)) {
                    showToast('Το δωμάτιο είναι ήδη κλεισμένο για αυτές τις ημερομηνίες.', 'error');
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
                    return;
                }
            }
        }

        const summaryLines = Object.entries(changes)
            .map(([k, v]) => `• ${k}: ${v}`).join('\n');

        if (!await window.showConfirm(
            `Αποθήκευση αλλαγών στην κράτηση #${rid};\n\nΑλλαγές:\n${summaryLines}`
        )) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
            return;
        }

        const user = JSON.parse(localStorage.getItem('hotel_user') || '{}');
        const editorName = user.name || 'Άγνωστος';
        const editorId = user.id || null;

        // Update CUSTOMER
        const { error: custErr } = await window.supabase
            .from('CUSTOMER')
            .update({
                FirstName: firstName,
                LastName: lastName,
                Phone: phone,
                Email: email
            })
            .eq('CustomerID', origCust.CustomerID);
        if (custErr) throw custErr;

        // Update RESERVATION
        const updateData = {
            CheckInDate: checkIn,
            CheckOutDate: checkOut,
            TotalCost: totalCost,
            Status: status,
            BookingType: bookingType,
            PaymentMethod: paymentMethod,
            NumberOfGuests: guests,
            Deposit: deposit,
            Notes: notes,
            EditedAt: new Date().toISOString(),
            EditedBy: editorName
        };

        // If room type changed, update it based on the selected room
        const selectedRoomData = editState.rooms.find(rr => rr.RoomNumber === roomNumber);
        if (selectedRoomData) {
            updateData.RoomType = selectedRoomData.RoomType;
        }

        const { error: resErr } = await window.supabase
            .from('RESERVATION')
            .update(updateData)
            .eq('ReservationID', rid);
        if (resErr) throw resErr;

        // Update RESERVATION_ROOM if room changed
        if (roomNumber !== editState.currentRoomNumber) {
            await window.supabase
                .from('RESERVATION_ROOM')
                .delete()
                .eq('ReservationID', rid);
            await window.supabase
                .from('RESERVATION_ROOM')
                .insert([{ ReservationID: rid, RoomNumber: roomNumber }]);
        }

        // Determine action type
        let action = 'edited';
        if (new Date(checkOut) > new Date(orig.CheckOutDate)) action = 'extended';
        else if (new Date(checkOut) < new Date(orig.CheckOutDate)) action = 'early_checkout';

        // Insert history
        await window.supabase
            .from('RESERVATION_HISTORY')
            .insert([{
                ReservationID: rid,
                Action: action,
                ChangedBy: editorName,
                ChangedByEmpID: editorId,
                OldValues: {
                    CheckInDate: orig.CheckInDate,
                    CheckOutDate: orig.CheckOutDate,
                    TotalCost: orig.TotalCost,
                    Status: orig.Status,
                    RoomNumber: editState.currentRoomNumber,
                    PaymentMethod: orig.PaymentMethod,
                    BookingType: orig.BookingType,
                    Notes: orig.Notes,
                    NumberOfGuests: orig.NumberOfGuests,
                    Deposit: orig.Deposit
                },
                NewValues: {
                    CheckInDate: checkIn,
                    CheckOutDate: checkOut,
                    TotalCost: totalCost,
                    Status: status,
                    RoomNumber: roomNumber,
                    PaymentMethod: paymentMethod,
                    BookingType: bookingType,
                    Notes: notes,
                    NumberOfGuests: guests,
                    Deposit: deposit
                }
            }]);

        showToast(`Η κράτηση #${rid} ενημερώθηκε επιτυχώς!`, 'success');
        closeEditModal();
        fetchAllReservations();
        fetchTodayReservations();
        fetchRoomsAndRender();

    } catch (err) {
        showToast('Σφάλμα αποθήκευσης: ' + err.message, 'error');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
    }
};

window.filterBookings = function () {
    const q = normalizeGreek(document.getElementById('bk-search')?.value || '');
    const statusFilter = document.getElementById('bk-status-filter')?.value || 'all';

    let filtered = allReservations;

    if (statusFilter !== 'all') {
        filtered = filtered.filter(r => r.Status === statusFilter);
    }

    if (q) {
        filtered = filtered.filter(r => {
            const c = r.CUSTOMER || {};
            const name = normalizeGreek([c.FirstName, c.LastName].filter(Boolean).join(' '));
            const room = normalizeGreek(String(r._roomNumber || ''));
            return name.includes(q) || room.includes(q);
        });
    }

    renderAllBookings(filtered);
};

window.cancelReservation = async function (reservationId) {
    if (!await window.showConfirm('Είστε σίγουροι ότι θέλετε να ακυρώσετε αυτή την κράτηση;')) return;
    try {
        const { error } = await window.supabase
            .from('RESERVATION')
            .update({ Status: 'Cancelled' })
            .eq('ReservationID', reservationId);

        if (error) throw error;

        showToast('Η κράτηση ακυρώθηκε επιτυχώς.', 'success');
        fetchAllReservations();
        fetchTodayReservations();
    } catch (err) {
        showToast('Σφάλμα ακύρωσης: ' + err.message, 'error');
    }
};

window.viewReservation = function (reservationId) {
    const r = allReservations.find(x => x.ReservationID === reservationId);
    if (!r) return;
    const c = r.CUSTOMER || {};
    const name = [c.FirstName, c.LastName].filter(Boolean).join(' ') || 'Άγνωστος';
    const statusLabels = {
        'Confirmed': 'Επιβεβαιωμένη', 'CheckedIn': 'Check-in',
        'CheckedOut': 'Check-out', 'Cancelled': 'Ακυρωμένη'
    };
    const paymentLabels = { cash: 'Μετρητά', card: 'Κάρτα', bank_transfer: 'Τραπεζικό Έμβασμα' };
    const bookingTypeLabels = { phone: 'Τηλεφωνική', prepaid: 'Προπληρωμένη', group: 'Γκρουπ', walkin: 'Walk-in' };
    const deposit = parseFloat(r.Deposit) || 0;
    const balance = parseFloat(r.TotalCost) - deposit;
    alert(
        `Λεπτομέρειες Κράτησης #${r.ReservationID}\n` +
        `───────────────\n` +
        `Πελάτης: ${name}\n` +
        `Τηλέφωνο: ${c.Phone || '—'}\n` +
        `Email: ${c.Email || '—'}\n` +
        `Άτομα: ${r.NumberOfGuests || 1}\n` +
        `Check-in: ${r.CheckInDate}\n` +
        `Check-out: ${r.CheckOutDate}\n` +
        `Δωμάτιο: ${r._roomNumber}\n` +
        `Τύπος Κράτησης: ${bookingTypeLabels[r.BookingType] || r.BookingType || '—'}\n` +
        `Σύνολο: €${Number(r.TotalCost).toFixed(2)}\n` +
        `Προκαταβολή: €${deposit.toFixed(2)}\n` +
        `Υπόλοιπο: €${balance.toFixed(2)}\n` +
        `Τρόπος Πληρωμής: ${paymentLabels[r.PaymentMethod] || r.PaymentMethod || '—'}\n` +
        `Κατάσταση: ${statusLabels[r.Status] || r.Status}\n` +
        `Σημειώσεις: ${r.Notes || '—'}`
    );
};

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
    fetchAllReservations();

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