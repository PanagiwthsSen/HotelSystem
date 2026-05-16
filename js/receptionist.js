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
    arrivals: 'Αφίξεις (Check-in)', departures: 'Αναχωρήσεις (Check-out)', 
    minibar: 'Χρεώσεις Mini-bar', policies: 'Πολιτική Ξενοδοχείου'
};

function navTo(id) {
    document.querySelectorAll('.sb-item').forEach(i => i.classList.toggle('active', i.dataset.v === id));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
    document.getElementById('tb-title').textContent = viewTitles[id] || id;
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
let currentOcc = 0, currentFree = 0, currentDirty = 0, currentClean = 0;

function mapDbStatusToUI(dbStatus) {
    switch (dbStatus) {
        case 'Occupied': case 'occ': return 'occ';
        case 'Available': case 'free': return 'free'; 
        case 'Cleaning': case 'dirty': return 'dirty';
        case 'Clean': case 'clean': return 'clean'; 
        default: return 'free';
    }
}

async function fetchRoomsAndRender() {
    try {
        const { data: rooms, error } = await window.supabase
            .from('ROOM')
            .select('*')
            .order('RoomNumber', { ascending: true });

        if (error) throw error;

        hotelRooms = rooms.map(r => ({
            id: r.RoomNumber,
            type: r.RoomType,
            state: mapDbStatusToUI(r.Status),
            dbStatus: r.Status 
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
        else if (r.state === 'free') currentFree++;
        else if (r.state === 'dirty') currentDirty++;
        else if (r.state === 'clean') currentClean++;
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
    if(dashFreeVal) dashFreeVal.textContent = currentFree + currentClean;
    
    if(document.getElementById('stat-occ')) {
        document.getElementById('stat-occ').textContent = currentOcc;
        document.getElementById('stat-occ-bar').style.width = `${occPct}%`;
        document.getElementById('stat-free').textContent = currentFree;
        document.getElementById('stat-dirty').textContent = currentDirty;
        document.getElementById('stat-clean').textContent = currentClean;
    }
}

function renderMap(filter = 'all') {
    const rmap = document.getElementById('rmap');
    if (!rmap) return;
    rmap.innerHTML = '';
    
    hotelRooms.forEach(r => {
        if (filter !== 'all' && r.state !== filter) return;
        const d = document.createElement('div');
        d.className = 'rc rc-' + r.state;
        d.textContent = r.id; 
        
        let sText = r.state === 'occ' ? 'Κατειλημμένο' : r.state === 'free' ? 'Άδειο χωρίς καθαριότητα' : r.state === 'dirty' ? 'Υπό καθαρισμό' : 'Έτοιμο';
        d.title = `${r.type} ${r.id} | ${sText}`;
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
            .select(`ReservationID, Status, CUSTOMER ( FirstName, LastName ), RESERVATION_ROOM ( RoomNumber )`)
            .eq('CheckInDate', today);

        // Αναχωρήσεις Σήμερα
        const { data: departures, error: depErr } = await window.supabase
            .from('RESERVATION')
            .select(`ReservationID, Status, TotalCost, CUSTOMER ( FirstName, LastName ), RESERVATION_ROOM ( RoomNumber )`)
            .eq('CheckOutDate', today);

        if (arrErr) throw arrErr;
        if (depErr) throw depErr;

        renderArrivals(arrivals || []);
        renderDepartures(departures || []);
        
        const liveArrBadge = document.getElementById('live-arr-badge');
        if(liveArrBadge) liveArrBadge.textContent = `Αφίξεις: ${arrivals ? arrivals.length : 0}`;

    } catch (err) {
        console.error("Σφάλμα κρατήσεων:", err.message);
    }
}

function renderArrivals(arrivals) {
    const tbody = document.querySelector('#v-arrivals table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    arrivals.forEach(arr => {
        const c = arr.CUSTOMER || {};
        const customerName = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
        const roomNumber = arr.RESERVATION_ROOM?.[0]?.RoomNumber || '-';
        const isCheckedIn = (arr.Status === 'CheckedIn' || arr.Status === 'CheckedOut');
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${customerName}</td>
            <td>-</td>
            <td><span class="pill p-g">ΟΚ</span></td>
            <td>${roomNumber}</td>
            <td><span class="pill ${isCheckedIn ? 'p-g' : 'p-a'}">${isCheckedIn ? 'Ολοκλ.' : 'Εκκρεμεί'}</span></td>
            <td>
                <button class="btn btn-sm ${isCheckedIn ? '' : 'btn-dark'}" 
                        ${isCheckedIn ? 'disabled' : ''} 
                        onclick="openCheckinModal(${arr.ReservationID}, '${customerName}')">
                    ${isCheckedIn ? 'C/I OK' : 'Check-in'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderDepartures(departures) {
    const tbody = document.querySelector('#v-departures table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    departures.forEach(dep => {
        const c = dep.CUSTOMER || {};
        const customerName = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
        const roomNumber = dep.RESERVATION_ROOM?.[0]?.RoomNumber || '-';
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

    if (!lastName || !firstName || !checkIn || !checkOut) {
        showToast('Παρακαλώ συμπληρώστε Επώνυμο, Όνομα και ημερομηνίες.', 'error');
        return;
    }

    try {
        if (!await window.showConfirm('Καταχώρηση κράτησης;')) return;
        const { data: customer, error: custError } = await window.supabase
            .from('CUSTOMER')
            .insert([{ FirstName: firstName, LastName: lastName, Phone: phone, Email: email, IsGroup: (bookingType === 'group') }])
            .select().single();

        if (custError) throw custError;

        const { error: resError } = await window.supabase
            .from('RESERVATION')
            .insert([{
                CustomerID: customer.CustomerID,
                CheckInDate: checkIn,
                CheckOutDate: checkOut,
                TotalCost: totalCost,
                Status: 'Confirmed'
            }]);

        if (resError) throw resError;

        showToast('Η κράτηση καταχωρήθηκε επιτυχώς!', 'success');
        fetchTodayReservations(); 
        navTo('dash');
        
        // Καθαρισμός φόρμας
        document.getElementById('nb-first').value = '';
        document.getElementById('nb-last').value = '';
        
    } catch (err) {
        showToast("Αποτυχία καταχώρησης: " + err.message, "error");
    }
}

if(document.getElementById('nb-rtype')) updatePrice();

/* ==============================================================
   PRO CHECK-IN (WITH MODAL) & CHECK-OUT LOGIC
   ============================================================== */
let activeCheckinResId = null;

function openCheckinModal(reservationId, customerName) {
    activeCheckinResId = reservationId;
    document.getElementById('modal-cust-name').textContent = customerName;
    
    // Γέμισμα του Dropdown ΜΟΝΟ με ελεύθερα/καθαρά δωμάτια
    const select = document.getElementById('modal-room-select');
    select.innerHTML = '<option value="">-- Επιλέξτε Δωμάτιο --</option>';
    
    const availableRooms = hotelRooms.filter(r => r.state === 'clean' || r.state === 'free');
    
    availableRooms.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `Δωμάτιο ${r.id} (${r.type})`;
        select.appendChild(opt);
    });

    document.getElementById('checkin-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('checkin-modal').style.display = 'none';
    activeCheckinResId = null;
}

async function confirmCheckin() {
    const selectedRoom = document.getElementById('modal-room-select').value;
    
    if (!selectedRoom) {
        showToast('Πρέπει να επιλέξετε ένα δωμάτιο για τον πελάτη!', 'error');
        return;
    }

    try {
        if (!await window.showConfirm('Επιβεβαίωση check-in;')) return;
        // 1. Ενημέρωση κράτησης σε CheckedIn
        await window.supabase.from('RESERVATION').update({ Status: 'CheckedIn' }).eq('ReservationID', activeCheckinResId);
        
        // 2. Σύνδεση Κράτησης με Δωμάτιο στον πίνακα RESERVATION_ROOM
        await window.supabase.from('RESERVATION_ROOM').insert([{ ReservationID: activeCheckinResId, RoomNumber: selectedRoom }]);
        
        // 3. Ενημέρωση κατάστασης Δωματίου σε Occupied ('occ')
        await window.supabase.from('ROOM').update({ Status: 'Occupied' }).eq('RoomNumber', selectedRoom);

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
        
        // 2. Αν υπάρχει δωμάτιο, το κάνουμε "Cleaning" (Υπό καθαρισμό / dirty)
        if (roomNumber && roomNumber !== '-') {
            await window.supabase.from('ROOM').update({ Status: 'Cleaning' }).eq('RoomNumber', roomNumber);
        }

        showToast(`Επιτυχές Check-out! Το δωμάτιο ${roomNumber} στάλθηκε για καθάρισμα.`, 'success');
        
        fetchTodayReservations();
        fetchRoomsAndRender();

    } catch (err) {
        showToast("Σφάλμα Check-out: " + err.message, "error");
    }
}

/* ==============================================================
   INITIALIZATION
   ============================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Δίνουμε 500ms για να σιγουρευτούμε ότι το supabase-config.js φόρτωσε το window.supabase
    setTimeout(() => {
        if(window.supabase) {
            fetchRoomsAndRender();
            fetchTodayReservations();
        } else {
            showToast('Αποτυχία σύνδεσης με τη βάση (Supabase is missing)', 'error');
        }
    }, 500);
});