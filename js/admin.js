import { supabase } from './supabase-config.js';

// Έλεγχος πρόσβασης: επαληθεύει τον ρόλο από τη βάση πριν φορτωθεί οτιδήποτε
const appReady = (async () => {
  const userData = localStorage.getItem('hotel_user');
  if (!userData) { window.location.href = "/pages/login.html"; return false; }

  const user = JSON.parse(userData);
  const { data, error } = await supabase
    .from('EMPLOYEE')
    .select('Role, isActive')
    .eq('EmpID', user.id)
    .maybeSingle();

  const role = data?.Role?.toLowerCase().trim() || '';
  const allowed = !error && data?.isActive && (role === 'admin' || role === 'manager');

  if (!allowed) {
    alert("Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη σελίδα!");
    window.location.href = "/pages/login.html";
    return false;
  }
  return true;
})();
/* ==============================================================
   ROOM STATUS HELPERS
   ============================================================== */
let checkoutMap = {};

function isSoonCheckout(checkOutDate) {
  if (!checkOutDate) return false;
  const d = new Date(checkOutDate);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  return d <= tomorrow;
}

async function buildCheckoutMap() {
  const map = {};
  try {
    const { data: rrData } = await supabase
      .from('RESERVATION_ROOM')
      .select('RoomNumber, ReservationID');
    if (!rrData || rrData.length === 0) return map;
    const ids = rrData.map(r => r.ReservationID);
    const { data: resData } = await supabase
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

function getStatusLabel(state, checkoutDate) {
  if (state === 'free' || state === 'clean') return 'Έτοιμο για νέο πελάτη';
  if (state === 'dirty') return 'Άδειο (χωρίς καθαριότητα)';
  if (state === 'soon') return 'Προσεχώς άδειο';
  if (state === 'occ') return 'Κατειλημμένο';
  return 'Ελεύθερο';
}

/* ==============================================================
   TOAST NOTIFICATION SYSTEM (ΖΩΝΤΑΝΕΣ ΕΙΔΟΠΟΙΗΣΕΙΣ)
   ============================================================== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `live-toast ${type}`;

    let iconClass = 'ti-circle-check'; // Default success
    if (type === 'error') iconClass = 'ti-alert-circle';
    if (type === 'info') iconClass = 'ti-info-circle';
    if (type === 'warning') iconClass = 'ti-alert-triangle';

    toast.innerHTML = `<i class="ti ${iconClass}" aria-hidden="true"></i> <span>${message}</span>`;
    
    container.appendChild(toast);

    // Αυτόματη απόκρυψη μετά από 3.5 δευτερόλεπτα
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300); // Περιμένει το animation
    }, 3500);
}

// Γενική συνάρτηση για απλά κουμπιά (π.χ. "Αναφορά", "Εξαγωγή")
window.triggerAction = function(msg, type) {
    showToast(msg, type);
}


/* ==============================================================
   ΠΛΟΗΓΗΣΗ (NAVIGATION)
   ============================================================== */
const viewTitles = {
    dash: 'Πίνακας Ελέγχου', revenue: 'Έσοδα & Αναφορές', pricing: 'Δυναμική Τιμολόγηση',
<<<<<<< HEAD
    rooms: 'Κατάσταση Δωματίων', staff: 'Διαχείριση Προσωπικού', restaurant: 'Minibar & Αποθήκες',
    vehicles: 'Οχήματα & Μεταφορές', gardens: 'Κήποι & Εξωτερικοί Χώροι', rentals: 'Ενοικιαζόμενα Καταστήματα',
=======
    rooms: 'Κατάσταση Δωματίων', staff: 'Διαχείριση Προσωπικού', restaurant: 'Εστιατόριο & Αποθήκες',
    vehicles: 'Οχήματα & Μεταφορές', trips: 'Δρομολόγια Οχημάτων', gardens: 'Κήποι & Εξωτερικοί Χώροι', rentals: 'Ενοικιαζόμενα Καταστήματα',
>>>>>>> b31125c7ae77d5e3de0db4f24cbaf449b566141e
    payroll: 'Μισθοδοσία', users: 'Χρήστες & Ρόλοι', backup: 'Backup & Ασφάλεια',
    'notif-history': 'Ιστορικό Ειδοποιήσεων'
};

function navTo(id) {
    document.querySelectorAll('.sb-item').forEach(i => i.classList.toggle('active', i.dataset.v === id));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
    document.getElementById('tb-title').textContent = viewTitles[id] || id;
}

document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => navTo(el.dataset.v));
});


/* ==============================================================
   LIVE ΗΜΕΡΟΜΗΝΙΑ & ΕΙΔΟΠΟΙΗΣΕΙΣ DASHBOARD
   ============================================================== */
function updateLiveTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('live-time').innerHTML = now.toLocaleDateString('el-GR', options);
}


/* ==============================================================
   ΚΑΤΑΣΤΑΣΗ ΔΩΜΑΤΙΩΝ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
let hotelRooms = []; // Κενός πίνακας που θα γεμίσει από τη βάση

// 1. Ασύγχρονη συνάρτηση για την ανάκτηση των δωματίων
async function fetchRooms() {
    try {
        const rmap = document.getElementById('rmap');
        if (rmap) rmap.innerHTML = '<div style="width:100%; text-align:center; padding: 2rem; color: var(--text-muted);"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 2rem;"></i><p>Φόρτωση δωματίων από Supabase...</p></div>';

        // Τραβάμε τα δωμάτια ταξινομημένα με βάση τον αριθμό τους
        // ... μέσα στη fetchRooms
        const { data, error } = await supabase // <--- Χωρίς window.
            .from('ROOM')
            .select('RoomNumber, RoomType, Status')
            .order('RoomNumber', { ascending: true });

        if (error) throw error;

        checkoutMap = await buildCheckoutMap();

        // 2. Μετατροπή των δεδομένων της βάσης στη μορφή που θέλει το frontend
        hotelRooms = data.map(room => {
            let uiState = 'free'; // Default κατάσταση
            const dbStatus = room.Status ? room.Status.toLowerCase().trim() : '';
            
            // Έξυπνο mapping: Πιάνουμε διάφορες εκδοχές των λέξεων (π.χ. 'occupied', 'occ', 'cleaning')
            if (dbStatus.includes('occup') || dbStatus === 'occ') uiState = 'occ';
            else if (dbStatus === 'dirty' || dbStatus.includes('cleaning')) uiState = 'dirty';
            else uiState = 'free';

            const checkOutDate = checkoutMap[room.RoomNumber] || null;
            if (uiState === 'occ' && isSoonCheckout(checkOutDate)) uiState = 'soon';

            return {
                id: room.RoomNumber,
                type: room.RoomType,
                state: uiState,
                checkOutDate
            };
        });

        // 3. Ζωγραφίζουμε το χάρτη με τα νέα δεδομένα
        renderMap();
        
    } catch (err) {
        console.error("Σφάλμα φόρτωσης δωματίων:", err.message);
        showToast("Αποτυχία φόρτωσης χάρτη δωματίων από τη βάση.", "error");
    }
}

// 4. Ζωγραφίζει τα κουτάκια (UI)
// 4. Ζωγραφίζει τα κουτάκια (UI)
// HotelSystem/js/admin.js (Αντικατάσταση της συνάρτησης renderMap)
function renderMap(filter) {
    const rmap = document.getElementById('rmap');
    if (!rmap) return;
    rmap.innerHTML = '';
    
    if (hotelRooms.length === 0) {
        rmap.innerHTML = '<p style="color: var(--text-muted);">Δεν βρέθηκαν δωμάτια στη βάση.</p>';
        calculateLiveStats();
        return;
    }

    hotelRooms.forEach(r => {
        if (filter && filter !== 'all' && r.state !== filter) return;
        const d = document.createElement('div');
        d.className = 'rc rc-' + r.state;
        
        let prefix = r.type ? r.type.charAt(0).toUpperCase() + '-' : '';
        d.textContent = prefix + r.id; 
        
        const stateGr = getStatusLabel(r.state, r.checkOutDate);

        d.title = `${r.type || 'Άγνωστος Τύπος'} ${r.id} | ${stateGr}`;
        d.style.cursor = 'pointer';

        d.addEventListener('click', () => {
            const existing = document.querySelector('.room-info-overlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.className = 'inv-overlay room-info-overlay';

            const statusColors = {
                'Έτοιμο για νέο πελάτη': '#1D9E75',
                'Άδειο (χωρίς καθαριότητα)': '#EAB308',
                'Προσεχώς άδειο': '#F97316',
                'Κατειλημμένο': '#DC2626'
            };
            const dotColor = statusColors[stateGr] || '#1D9E75';

            overlay.innerHTML = `
                <div class="inv-modal room-info-modal">
                    <div class="room-info-colorbar" style="background:${dotColor}"></div>
                    <div class="room-info-header">
                        <h3>Δωμάτιο ${prefix}${r.id}</h3>
                        <span class="room-info-close" id="room-info-close">&times;</span>
                    </div>
                    <div class="room-info-body">
                        <div class="room-info-row">
                            <span class="ri-label">Τύπος:</span>
                            <span class="ri-value">${r.type || 'Άγνωστος'}</span>
                        </div>
                        <div class="room-info-row">
                            <span class="ri-label">Κατάσταση:</span>
                            <span class="ri-value">
                                <span style="width:10px;height:10px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0"></span>
                                ${stateGr}
                            </span>
                        </div>
                        ${r.checkOutDate ? `
                        <div class="room-info-row">
                            <span class="ri-label">Αναχώρηση:</span>
                            <span class="ri-value">${new Date(r.checkOutDate).toLocaleDateString('el-GR')}</span>
                        </div>` : ''}
                    </div>
                    <div class="room-info-footer">
                        <button class="room-info-btn" id="room-info-close-btn">Κλείσιμο</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const closeRmInfo = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeRmInfo(); });
            overlay.querySelector('#room-info-close').addEventListener('click', closeRmInfo);
            overlay.querySelector('#room-info-close-btn').addEventListener('click', closeRmInfo);
            const onKey = (e) => { if (e.key === 'Escape') closeRmInfo(); };
            document.addEventListener('keydown', onKey);
        });

        rmap.appendChild(d);
    });
    
    calculateLiveStats();
}


window.filterRooms = function(f, el) {
    document.querySelectorAll('#v-rooms .active-filter').forEach(b => b.classList.remove('active-filter'));
    if (el) el.classList.add('active-filter');
    renderMap(f);
};

// 5. Δυναμικός Υπολογισμός Στατιστικών (δεν χρησιμοποιούμε πια το "510" καρφωτά)
let currentOcc = 0, currentFree = 0, currentDirty = 0;
function calculateLiveStats() {
    const totalRooms = hotelRooms.length || 1;
    currentOcc = 0; currentFree = 0; currentDirty = 0;
    
    hotelRooms.forEach(r => {
        if (r.state === 'occ') currentOcc++;
        else if (r.state === 'dirty') currentDirty++;
        else currentFree++;
    });
    
    const occPct = Math.round((currentOcc / totalRooms) * 100);
    const freePct = Math.round((currentFree / totalRooms) * 100);

    // Ενημέρωση UI στα dashboards
    if(document.getElementById('live-occ-badge')) document.getElementById('live-occ-badge').textContent = `Πληρ. ${occPct}%`;
    if(document.getElementById('dash-occ-val')) document.getElementById('dash-occ-val').textContent = `${occPct}%`;
    if(document.getElementById('dash-occ-sub')) document.getElementById('dash-occ-sub').textContent = `${currentOcc} / ${hotelRooms.length} δωμάτια`;
    if(document.getElementById('dash-occ-bar')) document.getElementById('dash-occ-bar').style.width = `${occPct}%`;
    
    if(document.getElementById('stat-occ')) {
        document.getElementById('stat-occ').textContent = currentOcc;
        document.getElementById('stat-occ-pct').textContent = `${occPct}%`;
        document.getElementById('stat-occ-bar').style.width = `${occPct}%`;
        document.getElementById('stat-free').textContent = currentFree;
        document.getElementById('stat-free-pct').textContent = `${freePct}%`;
        document.getElementById('stat-dirty').textContent = currentDirty;
    }
    
    if (typeof checkDynamicPricing === "function") checkDynamicPricing(occPct);
}

/* ==============================================================
   LIVE ARRIVALS & DEPARTURES DASHBOARD (ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchDashboardBookings() {
    const today = new Date().toISOString().split('T')[0];

    const arrivalsBody = document.getElementById('arrivals-body');
    const departuresBody = document.getElementById('departures-body');

    if (!arrivalsBody && !departuresBody) return;

    // Show loading state
    if (arrivalsBody) arrivalsBody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:1rem;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i> Φόρτωση...</td></tr>';
    if (departuresBody) departuresBody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:1rem;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i> Φόρτωση...</td></tr>';

    try {
        const [arrivalsRes, departuresRes] = await Promise.all([
            supabase
                .from('RESERVATION')
                .select(`
                    ReservationID, Status,
                    CUSTOMER (FirstName, LastName),
                    RESERVATION_ROOM (RoomNumber)
                `)
                .eq('CheckInDate', today)
                .neq('Status', 'Cancelled'),
            supabase
                .from('RESERVATION')
                .select(`
                    ReservationID, Status,
                    CUSTOMER (FirstName, LastName),
                    RESERVATION_ROOM (RoomNumber)
                `)
                .eq('CheckOutDate', today)
                .neq('Status', 'Cancelled')
        ]);

        if (arrivalsRes.error) throw arrivalsRes.error;
        if (departuresRes.error) throw departuresRes.error;

        renderBookingTable('arrivals-body', arrivalsRes.data, 'arrival');
        renderBookingTable('departures-body', departuresRes.data, 'departure');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης αφίξεων/αναχωρήσεων:", err.message);
        showToast("Αποτυχία φόρτωσης αφίξεων/αναχωρήσεων από τη βάση.", "error");
        if (arrivalsBody) arrivalsBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:1rem;">Σφάλμα φόρτωσης</td></tr>';
        if (departuresBody) departuresBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:1rem;">Σφάλμα φόρτωσης</td></tr>';
    }
}

function renderBookingTable(tbodyId, data, type) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:1rem;">Δεν υπάρχουν ${type === 'arrival' ? 'αφίξεις' : 'αναχωρήσεις'} σήμερα</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(res => {
        const customer = res.CUSTOMER || {};
        const name = `${customer.FirstName || ''} ${customer.LastName || ''}`.trim() || 'Άγνωστος Πελάτης';
        const roomData = res.RESERVATION_ROOM;
        let rooms = '—';
        if (roomData) {
            const roomArr = Array.isArray(roomData) ? roomData : [roomData];
            rooms = roomArr.map(r => r.RoomNumber).filter(Boolean).join(', ') || '—';
        }

        let statusLabel, statusClass;
        switch (res.Status) {
            case 'CheckedIn':
                statusLabel = 'Check-In';
                statusClass = 'p-g';
                break;
            case 'CheckedOut':
                statusLabel = 'Check-Out';
                statusClass = 'p-gr';
                break;
            case 'Confirmed':
                statusLabel = 'Επιβεβαιωμένη';
                statusClass = 'p-b';
                break;
            default:
                statusLabel = res.Status || '—';
                statusClass = 'p-a';
        }

        return `<tr><td><strong>${name}</strong></td><td>${rooms}</td><td><span class="pill ${statusClass}">${statusLabel}</span></td></tr>`;
    }).join('');
}

/* ==============================================================
   ALL ARRIVALS / DEPARTURES MODAL (ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchAndShowBookings(type) {
    const today = new Date().toISOString().split('T')[0];
    const isArrival = type === 'arrival';
    const title = isArrival ? 'Αφίξεις Σήμερα' : 'Αναχωρήσεις Σήμερα';
    const dateField = isArrival ? 'CheckInDate' : 'CheckOutDate';

    document.getElementById('bookings-modal-title').textContent = title;
    document.getElementById('bookings-modal-body').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;font-size:1.5rem;"></i><br>Φόρτωση...</td></tr>';
    document.getElementById('bookings-modal').style.display = 'flex';

    try {
        const { data, error } = await supabase
            .from('RESERVATION')
            .select(`
                ReservationID, CheckInDate, CheckOutDate, TotalCost, Status,
                CUSTOMER (FirstName, LastName),
                RESERVATION_ROOM (RoomNumber)
            `)
            .eq(dateField, today)
            .neq('Status', 'Cancelled')
            .order(dateField, { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById('bookings-modal-body');

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">Δεν υπάρχουν ${isArrival ? 'αφίξεις' : 'αναχωρήσεις'} σήμερα</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(res => {
            const customer = res.CUSTOMER || {};
            const name = `${customer.FirstName || ''} ${customer.LastName || ''}`.trim() || 'Άγνωστος Πελάτης';

            const roomData = res.RESERVATION_ROOM;
            let rooms = '—';
            if (roomData) {
                const roomArr = Array.isArray(roomData) ? roomData : [roomData];
                rooms = roomArr.map(r => r.RoomNumber).filter(Boolean).join(', ') || '—';
            }

            const dateVal = res[dateField];
            const timeStr = dateVal
                ? new Date(dateVal).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
                : '—';

            const amount = res.TotalCost ? `€${Number(res.TotalCost).toLocaleString('el-GR')}` : '—';

            let statusLabel, statusClass;
            switch (res.Status) {
                case 'CheckedIn':  statusLabel = 'Check-In';   statusClass = 'p-g'; break;
                case 'CheckedOut': statusLabel = 'Check-Out';  statusClass = 'p-gr'; break;
                case 'Confirmed':  statusLabel = 'Επιβεβαιωμένη'; statusClass = 'p-b'; break;
                default:           statusLabel = res.Status || '—'; statusClass = 'p-a';
            }

            return `<tr>
                <td><strong>${name}</strong></td>
                <td>${rooms}</td>
                <td>${timeStr}</td>
                <td>${amount}</td>
                <td><span class="pill ${statusClass}">${statusLabel}</span></td>
            </tr>`;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης λίστας:", err.message);
        document.getElementById('bookings-modal-body').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">Σφάλμα φόρτωσης δεδομένων</td></tr>';
    }
}

window.showAllArrivals = function() { fetchAndShowBookings('arrival'); };
window.showAllDepartures = function() { fetchAndShowBookings('departure'); };

window.closeBookingsModal = function(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('bookings-modal').style.display = 'none';
};


/* ==============================================================
   ΚΟΥΜΠΙΑ: ΔΥΝΑΜΙΚΗ ΤΙΜΟΛΟΓΗΣΗ
   ============================================================== */
// Συνάρτηση που ενημερώνει τα νούμερα δίπλα από τα sliders καθώς τα κουνάς

function updateLivePrices() {
    const sliders = [
        { id: 'price-m', display: 'val-m' },
        { id: 'price-d', display: 'val-d' },
        { id: 'price-f', display: 'val-f' },
        { id: 'price-s', display: 'val-s' }
    ];

    sliders.forEach(s => {
        const sliderEl = document.getElementById(s.id);
        const displayEl = document.getElementById(s.display);
        
        if (sliderEl && displayEl) {
            if (!sliderEl.dataset.listenerActive) {
                sliderEl.addEventListener('input', () => {
                    displayEl.textContent = '€' + sliderEl.value;
                });
                sliderEl.dataset.listenerActive = "true";
            }
        }
    });
}

let _prevLowOccupancyActive = null;

function checkDynamicPricing(occPct) {
    const statusLow = document.getElementById('status-low');
    const pricingAlert = document.getElementById('pricing-alert');
    if(!statusLow || !pricingAlert) return;

    const isActive = occPct < 60;

    if (_prevLowOccupancyActive !== null && isActive !== _prevLowOccupancyActive) {
        const message = isActive
            ? `Η έκπτωση χαμηλής πληρότητας (-15%) ενεργοποιήθηκε (πληρότητα ${occPct}%).`
            : `Η έκπτωση χαμηλής πληρότητας (-15%) απενεργοποιήθηκε (πληρότητα ${occPct}%).`;
        try {
            supabase.from('NOTIFICATION').insert({
                TargetRole: 'admin',
                Type: 'pricing',
                Message: message,
                IsRead: false
            }).then(() => { fetchVehicles(); });
        } catch(_) {}
    }
    _prevLowOccupancyActive = isActive;

    if (isActive) {
        statusLow.className = 'pill p-g'; statusLow.textContent = 'Ενεργό';
        pricingAlert.className = 'ns ns-e';
        pricingAlert.innerHTML = `<i class="ti ti-alert-triangle" aria-hidden="true"></i><div><strong>ΠΡΟΣΟΧΗ:</strong> Πληρότητα ${occPct}% (<60%). Εφαρμόζεται αυτόματη έκπτωση 15% σε όλες τις τιμές.</div>`;
    } else {
        statusLow.className = 'pill p-r'; statusLow.textContent = 'Ανενεργό';
        pricingAlert.className = 'ns ns-w';
        pricingAlert.innerHTML = `<i class="ti ti-info-circle" aria-hidden="true"></i><div>Τιμές καλοκαιρινής περιόδου ενεργές. Αν η πληρότητα πέσει <60%, εφαρμόζεται έκπτωση 15%.</div>`;
    }

    updateSeasonality();
}

/* ==============================================================
   ΣΥΝΤΕΛΕΣΤΕΣ ΕΠΟΧΙΚΟΤΗΤΑΣ
   ============================================================== */

function calculateEaster(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

const SEASONS = {
    summer: {
        label: 'Καλοκαίρι',
        defaultMultiplier: 1.6,
        isActive: (d) => { const m = d.getMonth() + 1; return m >= 6 && m <= 8; }
    },
    xmas: {
        label: 'Χριστούγεννα',
        defaultMultiplier: 1.4,
        isActive: (d) => {
            const m = d.getMonth() + 1, day = d.getDate();
            return (m === 12 && day >= 15) || (m === 1 && day <= 7);
        }
    },
    easter: {
        label: 'Πάσχα',
        defaultMultiplier: 1.3,
        isActive: (d) => {
            const easter = calculateEaster(d.getFullYear());
            const start = new Date(easter); start.setDate(start.getDate() - 7);
            const end = new Date(easter); end.setDate(end.getDate() + 7);
            end.setHours(23, 59, 59, 999);
            return d >= start && d <= end;
        }
    }
};

function getSeasonForDate(date) {
    for (const [key, season] of Object.entries(SEASONS)) {
        if (season.isActive(date)) return key;
    }
    return null;
}

function getCurrentSeason() {
    return getSeasonForDate(new Date());
}

let _seasonalityRoomType = 'Δίκλινο';

window.selectSeasonalityRoomType = function(type, btn) {
    _seasonalityRoomType = type;
    document.querySelectorAll('.season-type-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const label = document.getElementById('season-type-label');
    if (label) label.textContent = type;
    updateSeasonality();
};

function updateSeasonality() {
    const sliderMap = { 'Μονόκλινο': 'price-m', 'Δίκλινο': 'price-d', 'Φαρδύκλινο': 'price-f', 'Σουίτα': 'price-s' };
    const sliderId = sliderMap[_seasonalityRoomType] || 'price-d';
    const basePrice = parseInt(document.getElementById(sliderId).value) || 140;
    const activeSeason = getCurrentSeason();

    const seasonTextEl = document.getElementById('season-text');
    if (seasonTextEl) seasonTextEl.textContent = SEASONS[activeSeason]?.label || 'Κανονική περίοδος';

    ['summer', 'xmas', 'easter', 'low'].forEach(season => {
        const multEl = document.getElementById(`mult-${season}`);
        const priceEl = document.getElementById(`calc-${season}`);
        const statusEl = document.getElementById(`status-${season}`);
        if (!multEl || !priceEl || !statusEl) return;

        const multiplier = parseFloat(multEl.value) || 1;
        const calculatedPrice = Math.round(basePrice * multiplier);
        priceEl.textContent = `€${calculatedPrice}/βράδυ`;

        if (season !== 'low') {
            const isActive = season === activeSeason;
            statusEl.className = isActive ? 'pill p-g' : 'pill p-r';
            statusEl.textContent = isActive ? 'Ενεργό' : 'Ανενεργό';
        }
    });
}

// Ακούμε αλλαγές στα multipliers και στο base price slider
document.addEventListener('input', (e) => {
    if (e.target.matches('.mult-input') || e.target.id === 'price-d') {
        updateSeasonality();
    }
});

/* ==============================================================
   ΔΥΝΑΜΙΚΗ ΤΙΜΟΛΟΓΗΣΗ (ΣΥΝΔΕΣΗ ΜΕ SUPABASE)
   ============================================================== */

// 1. Φόρτωση των τρεχουσών τιμών από τη βάση κατά την εκκίνηση
async function loadPrices() {
    try {
        // Παίρνουμε ένα δείγμα τιμής για κάθε τύπο δωματίου
        const { data, error } = await supabase
            .from('ROOM')
            .select('RoomType, BasePrice');

        if (error) throw error;

        // Δημιουργούμε ένα μοναδικό λεξικό τιμών ανά τύπο
        const priceMap = {};
        data.forEach(r => {
            if (!priceMap[r.RoomType]) priceMap[r.RoomType] = r.BasePrice;
        });

        // Ενημερώνουμε τα sliders και τα displays αν υπάρχουν τιμές στη βάση
        const setPrice = (roomType, sliderId, displayId) => {
            if (priceMap[roomType]) {
                document.getElementById(sliderId).value = priceMap[roomType];
                document.getElementById(displayId).textContent = '€' + priceMap[roomType];
            }
        };
        setPrice('Μονόκλινο', 'price-m', 'val-m');
        setPrice('Δίκλινο', 'price-d', 'val-d');
        setPrice('Φαρδύκλινο', 'price-f', 'val-f');
        setPrice('Σουίτα', 'price-s', 'val-s');

        updateLivePrices();
        updateSeasonality();
    } catch (err) {
        console.error("Σφάλμα φόρτωσης τιμών:", err.message);
    }
}

// 2. Αποθήκευση των νέων τιμών στη βάση (UPDATE)
window.savePrices = async function() {
    const btn = document.querySelector('button[onclick="savePrices()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="ti ti-loader" style="animation: spin 1s linear infinite;"></i> Αποθήκευση...';
    }

    const prices = {
        'Μονόκλινο': document.getElementById('price-m').value,
        'Δίκλινο': document.getElementById('price-d').value,
        'Φαρδύκλινο': document.getElementById('price-f').value,
        'Σουίτα': document.getElementById('price-s').value
    };

    try {
        if (!await window.showConfirm('Αποθήκευση νέων τιμών δωματίων;')) return;
        // Εκτελούμε 4 updates, ένα για κάθε τύπο δωματίου
        for (const [type, price] of Object.entries(prices)) {
            const { error } = await supabase
                .from('ROOM')
                .update({ BasePrice: price })
                .eq('RoomType', type);

            if (error) throw error;
        }

        showToast("Οι νέες τιμές αποθηκεύτηκαν σε όλα τα δωμάτια!", "success");
    } catch (err) {
        console.error("Σφάλμα ενημέρωσης τιμών:", err.message);
        showToast("Αποτυχία ενημέρωσης βάσης δεδομένων.", "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Αποθήκευση Τιμών';
        }
    }
};

// 3. Επαναφορά στις εργοστασιακές τιμές
window.resetPrices = async function() {
    if (!await window.showConfirm("Επαναφορά όλων των τιμών στις αρχικές ρυθμίσεις;")) return;

    const defaults = {
        'Μονόκλινο': 85,
        'Δίκλινο': 140,
        'Φαρδύκλινο': 175,
        'Σουίτα': 380
    };

    try {
        for (const [type, price] of Object.entries(defaults)) {
            const { error } = await supabase
                .from('ROOM')
                .update({ BasePrice: price })
                .eq('RoomType', type);

            if (error) throw error;
        }

        document.getElementById('price-m').value = 85;
        document.getElementById('val-m').textContent = '€85';
        document.getElementById('price-d').value = 140;
        document.getElementById('val-d').textContent = '€140';
        document.getElementById('price-f').value = 175;
        document.getElementById('val-f').textContent = '€175';
        document.getElementById('price-s').value = 380;
        document.getElementById('val-s').textContent = '€380';

        showToast("Οι τιμές επαναφέρθηκαν επιτυχώς.", "info");
    } catch (err) {
        console.error(err);
        showToast("Σφάλμα κατά την επαναφορά.", "error");
    }
};

/* ==============================================================
   ΚΟΥΜΠΙΑ: ΔΩΜΑΤΙΑ (ΕΚΧΩΡΗΣΗ)
   ============================================================== */
function assignRoom(btn, roomNum) {
    btn.disabled = true;
    btn.textContent = "Εκχωρήθηκε";
    btn.classList.replace('btn-dark', 'btn');
    
    // Αλλάζουμε την ετικέτα δίπλα του
    const statusCell = btn.parentElement.previousElementSibling;
    statusCell.innerHTML = '<span class="pill p-r">Κατειλημμένο</span>';
    
    showToast(`Το δωμάτιο ${roomNum} εκχωρήθηκε επιτυχώς στον πελάτη.`, "success");
}


/* ==============================================================
   ΚΟΥΜΠΙΑ: ΠΡΟΣΩΠΙΚΟ & ΠΑΡΑΠΟΝΑ
   ============================================================== */
let staffData = [];
let complaintsData = [];
let currentComplaintFilter = 'all';

let _roleDeptMap = {};
let _deptToRoles = {};
let _activeStaffFilter = 'all';
let _complaintSortOrder = 'desc';

// 1. Fetch δεδομένων από τη βάση
async function fetchStaff() {
    try {
        const container = document.getElementById('staff-body');
        if (container) container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);grid-column:1/-1"><i class="ti ti-loader" style="animation:spin 1s linear infinite;font-size:1.5rem;display:block;margin-bottom:10px;"></i>Φόρτωση προσωπικού...</div>';

        const { data, error } = await supabase
            .from('EMPLOYEE')
            .select('EmpID, FirstName, LastName, Role, Salary, Leaves')
            .eq('isActive', true)
            .order('Role', { ascending: true });

        if (error) throw error;

        const complaintCounts = {};
        try {
            const { data: comps } = await supabase.from('COMPLAINT').select('EmpID');
            if (comps) comps.forEach(c => { complaintCounts[c.EmpID] = (complaintCounts[c.EmpID] || 0) + 1; });
        } catch (_) {}

        staffData = data.map(emp => {
            const roleKey = emp.Role ? emp.Role.toLowerCase().trim() : '';
            let deptGR = emp.Role;

            if (roleKey === 'receptionist') deptGR = 'Υποδοχή';
            else if (roleKey === 'maid') deptGR = 'Καθαριότητα';
            else if (roleKey === 'minibar') deptGR = 'Minibar';
            else if (roleKey === 'driver') deptGR = 'Οδηγοί';
            else if (roleKey === 'gardener') deptGR = 'Κηπουροί';
            else if (roleKey === 'admin' || roleKey === 'manager') deptGR = 'Διοίκηση';

            return {
                id: emp.EmpID,
                firstName: emp.FirstName || '',
                lastName: emp.LastName || '',
                n: `${emp.FirstName || ''} ${emp.LastName || ''}`.trim() || 'Χωρίς Όνομα',
                dept: deptGR,
                dbRole: roleKey,
                since: '2024',
                leaves: emp.Leaves !== null ? `${emp.Leaves} ημ.` : '0 ημ.',
                rawLeaves: emp.Leaves || 0,
                salary: `€${emp.Salary || 0}`,
                complaintCount: complaintCounts[emp.EmpID] || 0
            };
        });

        if (document.getElementById('dash-staff-val')) document.getElementById('dash-staff-val').textContent = staffData.length;
        if (document.getElementById('dash-staff-sub')) document.getElementById('dash-staff-sub').textContent = `${staffData.length} ενεργοί υπάλληλοι`;

        _roleDeptMap = {};
        staffData.forEach(s => {
            if (!_roleDeptMap[s.dbRole]) _roleDeptMap[s.dbRole] = s.dept;
        });
        _deptToRoles = {};
        Object.entries(_roleDeptMap).forEach(([role, dept]) => {
            if (!_deptToRoles[dept]) _deptToRoles[dept] = [];
            _deptToRoles[dept].push(role);
        });
        renderStaffTabs('all');
        populateLeaveDropdown();

    } catch (err) {
        console.error("Σφάλμα φόρτωσης προσωπικού:", err.message);
        showToast("Αποτυχία φόρτωσης προσωπικού.", "error");
    }
}

// 3. Render των tabs (δυναμικά από τα δεδομένα)
function renderStaffTabs(activeFilter) {
    const container = document.getElementById('staff-tab-row');
    if (!container) return;
    let html = `<div class="tab ${activeFilter === 'all' ? 'active' : ''}" onclick="stTab('all',this)">Όλοι</div>`;
    Object.keys(_deptToRoles).sort().forEach(dept => {
        const safe = dept.replace(/'/g, "\\'");
        html += `<div class="tab ${activeFilter === dept ? 'active' : ''}" onclick="stTab('${safe}',this)">${dept}</div>`;
    });
    container.innerHTML = html;
    renderStaff(activeFilter);
}

// 4. Render του HTML με κάρτες
function renderStaff(filter){
    const container = document.getElementById('staff-body');
    if (!container) return;

    const sorted = [...staffData].sort((a, b) =>
        _complaintSortOrder === 'desc' ? b.complaintCount - a.complaintCount : a.complaintCount - b.complaintCount
    );

    const filteredData = filter === 'all' 
        ? sorted
        : sorted.filter(s => s.dept === filter);

    if (filteredData.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);grid-column:1/-1;">Δεν βρέθηκαν υπάλληλοι σε αυτό το τμήμα.</div>';
        return;
    }

    container.innerHTML = filteredData.map(s => {
        const initials = ((s.firstName?.[0] || '') + (s.lastName?.[0] || '')).trim() || '?';
        const complaintColor = s.complaintCount > 0 ? 'color:#791F1F' : 'color:var(--color-text-secondary)';
        return `
            <div class="staff-card">
                <div class="sc-avatar">${initials}</div>
                <div class="sc-body">
                    <div class="sc-name">${s.n}</div>
                    <div class="sc-dept"><span class="pill p-b">${s.dept}</span></div>
                    <div class="sc-meta">Από ${s.since} · ${s.leaves} άδεια · ${s.salary}</div>
                    <div class="sc-complaints" style="${complaintColor}"><i class="ti ti-message-report" aria-hidden="true"></i> Παράπονα: ${s.complaintCount}</div>
                </div>
                <button class="btn btn-sm sc-btn" onclick="openEmpModal(${s.id})" title="Προβολή">
                    <i class="ti ti-eye" aria-hidden="true"></i>
                </button>
            </div>`;
    }).join('');
}

// Λειτουργία των Tabs
window.stTab = function(f, el){
    document.querySelectorAll('#v-staff .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    _activeStaffFilter = f;
    currentComplaintFilter = f;
    renderStaff(f);
    renderComplaints(f);
}

window.toggleComplaintSort = function() {
    _complaintSortOrder = _complaintSortOrder === 'desc' ? 'asc' : 'desc';
    const btn = document.getElementById('sort-complaints-btn');
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.className = _complaintSortOrder === 'desc' ? 'ti ti-arrow-down' : 'ti ti-arrow-up';
        btn.innerHTML = (_complaintSortOrder === 'desc' ? '<i class="ti ti-arrow-down" aria-hidden="true"></i> Περισσότερα παράπονα' : '<i class="ti ti-arrow-up" aria-hidden="true"></i> Λιγότερα παράπονα');
    }
    renderStaff(_activeStaffFilter);
};

/* ==============================================================
   ΔΙΑΧΕΙΡΙΣΗ ΑΔΕΙΩΝ
   ============================================================== */

function populateLeaveDropdown() {
    const sel = document.getElementById('leave-emp');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">— Επιλέξτε —</option>';
    staffData.forEach(s => {
        sel.innerHTML += `<option value="${s.id}">${s.n} (${s.dept})</option>`;
    });
    if (currentVal && sel.querySelector(`option[value="${currentVal}"]`)) sel.value = currentVal;
}

window.addLeaveDays = async function() {
    const sel = document.getElementById('leave-emp');
    const daysInput = document.getElementById('leave-days');
    if (!sel || !daysInput) return;
    const empId = parseInt(sel.value);
    if (!empId) { showToast('Επιλέξτε υπάλληλο.', 'warning'); return; }
    const days = parseInt(daysInput.value);
    if (!days || days < 1) { showToast('Εισάγετε έγκυρο αριθμό ημερών.', 'warning'); return; }

    const emp = staffData.find(s => s.id === empId);
    if (!emp) return;
    const current = emp.rawLeaves;
    const newVal = current + days;

    if (!await window.showConfirm(`Προσθήκη ${days} ημερών άδειας στον/στην ${emp.n}; (${current} → ${newVal} ημ.)`)) return;

    try {
        const { error } = await supabase.from('EMPLOYEE').update({ Leaves: newVal }).eq('EmpID', empId);
        if (error) throw error;
        showToast(`Προστέθηκαν ${days} ημέρες άδειας στον/στην ${emp.n}.`, 'success');
        fetchStaff();
    } catch (err) {
        showToast('Αποτυχία ενημέρωσης.', 'error');
    }
};

window.removeLeaveDays = async function() {
    const sel = document.getElementById('leave-emp');
    const daysInput = document.getElementById('leave-days');
    if (!sel || !daysInput) return;
    const empId = parseInt(sel.value);
    if (!empId) { showToast('Επιλέξτε υπάλληλο.', 'warning'); return; }
    const days = parseInt(daysInput.value);
    if (!days || days < 1) { showToast('Εισάγετε έγκυρο αριθμό ημερών.', 'warning'); return; }

    const emp = staffData.find(s => s.id === empId);
    if (!emp) return;
    const current = emp.rawLeaves;
    const newVal = Math.max(0, current - days);

    if (!await window.showConfirm(`Αφαίρεση ${days} ημερών άδειας από τον/την ${emp.n}; (${current} → ${newVal} ημ.)`)) return;

    try {
        const { error } = await supabase.from('EMPLOYEE').update({ Leaves: newVal }).eq('EmpID', empId);
        if (error) throw error;
        showToast(`Αφαιρέθηκαν ${days} ημέρες άδειας από τον/την ${emp.n}.`, 'success');
        fetchStaff();
    } catch (err) {
        showToast('Αποτυχία ενημέρωσης.', 'error');
    }
};

/* ==============================================================
   ΠΑΡΑΠΟΝΑ ΠΕΛΑΤΩΝ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchComplaints() {
    try {
        const tbody = document.getElementById('complaints-body');
        if (!tbody) return; 

        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση παραπόνων...</td></tr>';

        const { data, error } = await supabase
            .from('COMPLAINT')
            .select(`
                ComplaintID, Description, Status, CreatedAt,
                CUSTOMER (FirstName, LastName),
                EMPLOYEE (FirstName, LastName, Role)
            `)
            .order('CreatedAt', { ascending: false });

        if (error) throw error;

        complaintsData = data.map(c => ({
            id: c.ComplaintID,
            description: c.Description,
            status: c.Status,
            createdAt: c.CreatedAt,
            customerName: c.CUSTOMER ? `${c.CUSTOMER.FirstName || ''} ${c.CUSTOMER.LastName || ''}`.trim() || 'Άγνωστος Πελάτης' : 'Άγνωστος Πελάτης',
            empName: c.EMPLOYEE ? `${c.EMPLOYEE.FirstName || ''} ${c.EMPLOYEE.LastName || ''}`.trim() || '-' : '-',
            empRole: c.EMPLOYEE ? c.EMPLOYEE.Role?.toLowerCase().trim() : null
        }));

        renderComplaints(currentComplaintFilter);

    } catch (err) {
        console.error("Σφάλμα φόρτωσης παραπόνων:", err.message);
        showToast("Αποτυχία φόρτωσης παραπόνων.", "error");
    }
}

function renderComplaints(filter) {
    const tbody = document.getElementById('complaints-body');
    if (!tbody) return;

    const filteredData = filter === 'all'
        ? complaintsData
        : complaintsData.filter(c => {
            const roles = _deptToRoles[filter] || [];
            return roles.includes(c.empRole);
        });

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Δεν βρέθηκαν παράπονα για αυτό το τμήμα.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredData.map(c => {
        const dateObj = new Date(c.createdAt);
        const dateStr = dateObj.toLocaleDateString('el-GR') + ' ' + dateObj.toLocaleTimeString('el-GR', {hour: '2-digit', minute:'2-digit'});

        const statusHtml = c.status === 'pending'
            ? '<span class="pill p-r">Εκκρεμεί</span>'
            : '<span class="pill p-g">Επιλύθηκε</span>';

        return `
            <tr id="comp-row-${c.id}">
                <td>${dateStr}</td>
                <td><strong>${c.empName}</strong></td>
                <td><strong>${c.customerName}</strong></td>
                <td>${c.description}</td>
                <td>${statusHtml}</td>
                <td><button class="btn btn-sm" onclick="viewComplaint(${c.id})">Προβολή</button></td>
            </tr>
        `;
    }).join('');
}

/* ==============================================================
   ΠΑΡΑΠΟΝΑ — MODAL ΠΡΟΒΟΛΗΣ
   ============================================================== */

window.viewComplaint = function(id) {
    const c = complaintsData.find(x => x.id === id);
    if (!c) return;

    const dateObj = new Date(c.createdAt);
    const dateStr = dateObj.toLocaleDateString('el-GR') + ' ' + dateObj.toLocaleTimeString('el-GR', {hour: '2-digit', minute:'2-digit'});

    const statusLabel = c.status === 'pending' ? 'Εκκρεμεί' : 'Επιλύθηκε';
    const statusClass = c.status === 'pending' ? 'pill p-r' : 'pill p-g';

    document.getElementById('modal-body').innerHTML = `
        <div class="field">
            <div class="field-label">Ημερομηνία</div>
            <div class="field-value">${dateStr}</div>
        </div>
        <div class="field">
            <div class="field-label">Υπάλληλος</div>
            <div class="field-value"><strong>${c.empName}</strong></div>
        </div>
        <div class="field">
            <div class="field-label">Πελάτης</div>
            <div class="field-value"><strong>${c.customerName}</strong></div>
        </div>
        <div class="field">
            <div class="field-label">Κατάσταση</div>
            <div class="field-value"><span class="${statusClass}">${statusLabel}</span></div>
        </div>
        <div class="field">
            <div class="field-label">Περιγραφή</div>
            <div class="desc-box">${c.description}</div>
        </div>
    `;

    const isPending = c.status === 'pending';
    document.getElementById('modal-footer').innerHTML = isPending
        ? `<button class="btn btn-dark" onclick="resolveComplaintFromModal(${c.id})">Επίλυση</button>
           <button class="btn" onclick="closeComplaintModal()">Κλείσιμο</button>`
        : `<button class="btn" onclick="archiveComplaintFromModal(${c.id})">Αρχειοθέτηση</button>
           <button class="btn" onclick="closeComplaintModal()">Κλείσιμο</button>`;

    document.getElementById('complaint-modal').style.display = 'flex';
};

window.closeComplaintModal = function(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('complaint-modal').style.display = 'none';
};

window.resolveComplaintFromModal = async function(id) {
    await resolveComplaint(null, id);
    closeComplaintModal();
};

window.archiveComplaintFromModal = async function(id) {
    await archiveComplaint(null, id);
    closeComplaintModal();
};

// Λειτουργία: Επίλυση Παραπόνου (UPDATE στη βάση)
async function resolveComplaint(btn, id) {
    if (!await window.showConfirm('Επίλυση παραπόνου;')) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation: spin 1s linear infinite;"></i>'; }
    
    try {
        const { error } = await supabase
            .from('COMPLAINT')
            .update({ Status: 'resolved' })
            .eq('ComplaintID', id);

        if (error) throw error;
        
        showToast("Το παράπονο ενημερώθηκε επιτυχώς στη βάση!", "success");
        fetchComplaints(); // Ξαναφορτώνουμε τη λίστα για να ανανεωθεί το UI
    } catch (err) {
        console.error(err);
        showToast("Σφάλμα κατά την ενημέρωση.", "error");
        if (btn) { btn.disabled = false; btn.textContent = 'Επίλυση'; }
    }
}

// Λειτουργία: Αρχειοθέτηση Παραπόνου (DELETE από τη βάση - Προαιρετικά μπορεί να είναι απλό hide)
async function archiveComplaint(btn, id) {
    if (!await window.showConfirm('Οριστική διαγραφή παραπόνου;')) return;
    if (btn) { btn.disabled = true; }
    try {
        const { error } = await supabase
            .from('COMPLAINT')
            .delete()
            .eq('ComplaintID', id);

        if (error) throw error;
        
        showToast("Το παράπονο αρχειοθετήθηκε (διαγράφηκε).", "info");
        
        // Ομαλό animation αφαίρεσης από την οθόνη χωρίς ολόκληρο refresh
        const row = document.getElementById(`comp-row-${id}`);
        if(row) {
            row.style.opacity = '0';
            setTimeout(() => row.remove(), 300);
        }
        // Αφαίρεση και από το τοπικό array για να μην επανεμφανιστεί
        complaintsData = complaintsData.filter(c => c.id !== id);
    } catch (err) {
        console.error(err);
        showToast("Σφάλμα κατά τη διαγραφή.", "error");
        if (btn) { btn.disabled = false; }
    }
}

// Κάνουμε τις συναρτήσεις διαθέσιμες στο HTML (απαραίτητο για ES Modules)
window.resolveComplaint = resolveComplaint;
window.archiveComplaint = archiveComplaint;

/* ==============================================================
   MODAL ΠΡΟΒΟΛΗΣ ΥΠΑΛΛΗΛΟΥ
   ============================================================== */

window.openEmpModal = function(id) {
    const emp = staffData.find(s => s.id === id);
    if (!emp) return;
    document.getElementById('emp-modal-title').textContent = emp.n;
    document.getElementById('emp-modal-body').innerHTML = `
        <div style="margin-bottom:12px"><span class="pill p-b">${emp.dept}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px"><span style="color:#6B7280">Ρόλος</span><span>${emp.dbRole}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px"><span style="color:#6B7280">Απασχόληση</span><span>Από ${emp.since}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px"><span style="color:#6B7280">Άδειες</span><span>${emp.leaves}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px"><span style="color:#6B7280">Μισθός</span><span>${emp.salary}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px"><span style="color:#6B7280">Παράπονα</span><span style="${emp.complaintCount > 0 ? 'color:#791F1F;font-weight:600' : ''}">${emp.complaintCount}</span></div>
    `;
    document.getElementById('emp-modal').style.display = 'flex';
};

window.closeEmpModal = function(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('emp-modal').style.display = 'none';
};

/* ==============================================================
   ΕΣΤΙΑΤΟΡΙΟ & ΑΠΟΘΗΚΕΣ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchInventory() {
    try {
        const tbody = document.getElementById('inventory-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση αποθήκης...</td></tr>';

        const { data, error } = await supabase
            .from('INVENTORY_ITEM')
            .select('*')
            .order('Category', { ascending: true })
            .order('Name', { ascending: true });

        if (error) throw error;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Δεν υπάρχουν προϊόντα στην αποθήκη.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => {
            let statusHtml = '';

            if (item.Quantity === 0) {
                statusHtml = '<span class="pill p-r">Εξαντλήθηκε</span>';
            } else if (item.Quantity <= item.MinThreshold) {
                statusHtml = '<span class="pill p-a">Οριακό Απόθεμα</span>';
            } else {
                statusHtml = '<span class="pill p-g">Επαρκές</span>';
            }

            return `
                <tr>
                    <td><strong>${item.Name}</strong></td>
                    <td>${item.Category}</td>
                    <td>${item.Quantity} τεμ. <br><small style="color:var(--text-muted)">(Όριο: ${item.MinThreshold})</small></td>
                    <td>${statusHtml}</td>
                    <td>
                        <button class="btn btn-sm" onclick="openInventoryModal(${item.ItemID})" title="Επεξεργασία">✏️</button>
                        <button class="btn btn-sm" onclick="deleteInventoryItem(${item.ItemID},'${item.Name}')" title="Διαγραφή">🗑️</button>
                        <button class="btn btn-dark btn-sm" onclick="placeOrder(this,'${item.Name}')">Παραγγελία</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης αποθήκης:", err.message);
        showToast("Αποτυχία φόρτωσης αποθήκης.", "error");
    }
}

// Προσομοίωση Παραγγελίας
window.placeOrder = function(btn, itemName) {
    btn.disabled = true;
    btn.textContent = "Παραγγέλθηκε";
    btn.classList.replace('btn-dark', 'btn');
    const statusCell = btn.closest('tr').querySelector('td:nth-child(4)');
    statusCell.innerHTML = '<span class="pill p-b">Αναμένεται</span>';
    showToast(`Στάλθηκε αυτόματη παραγγελία στον προμηθευτή για: ${itemName}`, "success");
}

// Άνοιγμα Modal Προσθήκης / Επεξεργασίας
window.openInventoryModal = async function(itemId) {
    let item = null;
    if (itemId) {
        const { data } = await supabase.from('INVENTORY_ITEM').select('*').eq('ItemID', itemId).single();
        item = data;
    }

    const existing = document.querySelector('.inv-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `
        <div class="inv-modal">
            <h3>${item ? 'Επεξεργασία' : 'Νέο'} Προϊόντος</h3>
            <div class="mform-group">
                <label>Όνομα προϊόντος *</label>
                <input type="text" id="inv-name" value="${item ? item.Name : ''}">
            </div>
            <div class="mform-group">
                <label>Κατηγορία *</label>
                <input type="text" id="inv-cat" value="${item ? item.Category : ''}">
            </div>
            <div class="mform-group">
                <label>Ποσότητα *</label>
                <input type="number" id="inv-qty" min="0" value="${item ? item.Quantity : 0}">
            </div>
            <div class="mform-group">
                <label>Ελάχιστο όριο *</label>
                <input type="number" id="inv-threshold" min="0" value="${item ? item.MinThreshold : 0}">
            </div>
            <div class="modal-actions">
                <button class="btn" id="inv-cancel">Ακύρωση</button>
                <button class="btn btn-dark" id="inv-save">${item ? 'Αποθήκευση' : 'Δημιουργία'}</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    overlay.querySelector('#inv-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#inv-save').addEventListener('click', async () => {
        const name = overlay.querySelector('#inv-name').value.trim();
        const category = overlay.querySelector('#inv-cat').value.trim();
        const quantity = parseInt(overlay.querySelector('#inv-qty').value, 10);
        const threshold = parseInt(overlay.querySelector('#inv-threshold').value, 10);

        if (!name || !category) {
            showToast('Συμπληρώστε Όνομα και Κατηγορία.', 'error');
            return;
        }
        if (isNaN(quantity) || quantity < 0 || isNaN(threshold) || threshold < 0) {
            showToast('Οι αριθμοί πρέπει να είναι έγκυροι (0 ή μεγαλύτεροι).', 'error');
            return;
        }

        const action = item ? 'ενημέρωση' : 'δημιουργία';
        if (item && name === item.Name && category === item.Category && quantity === item.Quantity && threshold === item.MinThreshold) {
            showToast('Δεν υπάρχουν αλλαγές.', 'info');
            overlay.remove();
            return;
        }
        if (!await window.showConfirm(`${action === 'ενημέρωση' ? 'Ενημέρωση' : 'Δημιουργία'} προϊόντος "${name}";`)) return;

        try {
            const payload = { Name: name, Category: category, Quantity: quantity, MinThreshold: threshold };
            let error;

            if (item) {
                ({ error } = await supabase.from('INVENTORY_ITEM').update(payload).eq('ItemID', item.ItemID));
            } else {
                ({ error } = await supabase.from('INVENTORY_ITEM').insert([payload]));
            }

            if (error) throw error;

            showToast(`Προϊόν "${name}" ${item ? 'ενημερώθηκε' : 'δημιουργήθηκε'} επιτυχώς.`, 'success');
            overlay.remove();
            fetchInventory();
        } catch (err) {
            showToast('Αποτυχία: ' + err.message, 'error');
        }
    });

    overlay.querySelector('#inv-name').focus();

    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#inv-save').click();
        if (e.key === 'Escape') overlay.remove();
    });
}

// Διαγραφή Προϊόντος
window.deleteInventoryItem = async function(itemId, itemName) {
    if (!await window.showConfirm(`Διαγραφή "${itemName}"; Η ενέργεια είναι μη αναστρέψιμη.`)) return;

    try {
        const { error } = await supabase.from('INVENTORY_ITEM').delete().eq('ItemID', itemId);
        if (error) throw error;
        showToast(`"${itemName}" διαγράφηκε.`, 'success');
        fetchInventory();
    } catch (err) {
        showToast('Αποτυχία διαγραφής: ' + err.message, 'error');
    }
}

/* ==============================================================
   ΟΧΗΜΑΤΑ & ΜΕΤΑΦΟΡΕΣ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchVehicles() {
    try {
        const tbody = document.getElementById('vehicles-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση στόλου οχημάτων...</td></tr>';

        const { data, error } = await supabase
            .from('VEHICLE')
            .select(`
                *,
                VEHICLE_SERVICE (ServiceID, ServiceDate, NextServiceDate)
            `)
            .order('Type', { ascending: true });

        if (error) throw error;

        const notifContainer = document.getElementById('admin-notifications');
        if (notifContainer) notifContainer.innerHTML = '';
        let notifCount = 0;
        let notifHtml = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Δεν υπάρχουν καταχωρημένα οχήματα.</td></tr>';
            updateNotifBadge(notifCount);
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const rowsHtml = data.map(v => {
            let statusHtml = '';
            const dbStatus = v.Status ? v.Status.toLowerCase() : '';

            if (v.PendingKmUpdate) {
                statusHtml = '<span class="pill p-y">Μη Διαθέσιμο — Εκκρεμεί χλμ</span>';
            } else if (dbStatus === 'available') {
                statusHtml = '<span class="pill p-g">Διαθέσιμο</span>';
            } else if (dbStatus === 'in_use') {
                statusHtml = '<span class="pill p-b">Σε Δρομολόγιο</span>';
            } else if (dbStatus === 'maintenance') {
                statusHtml = '<span class="pill p-r">Σε Συντήρηση</span>';
            } else {
                statusHtml = `<span class="pill p-a">${v.Status}</span>`;
            }

            const kmDisplay = v.CurrentKm != null ? `${Number(v.CurrentKm).toLocaleString()} km` : '—';
            const logKmBtn = v.VehicleID && v.PendingKmUpdate
                ? `<button class="btn btn-sm btn-warn" onclick="openLogKmModal(${v.VehicleID},'${(v.PlateNumber || v.Type || '').replace(/'/g,"\\'")}',${v.CurrentKm || 0})" title="Καταχώρηση χιλιομέτρων"><i class="ti ti-speedometer"></i></button>`
                : '';

            let serviceHtml = '<span class="pill p-g">—</span>';
            if (v.VEHICLE_SERVICE && v.VEHICLE_SERVICE.length > 0) {
                const services = v.VEHICLE_SERVICE.filter(s => s.NextServiceDate);
                if (services.length > 0) {
                    const latestService = services.reduce((a, b) =>
                        new Date(a.NextServiceDate) > new Date(b.NextServiceDate) ? a : b
                    );
                    const nextDate = new Date(latestService.NextServiceDate);
                    nextDate.setHours(0, 0, 0, 0);
                    const diffMs = nextDate - today;
                    const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                    const dateStr = nextDate.toLocaleDateString('el-GR');
                    const plate = v.PlateNumber || v.Type;
                    const vid = v.VehicleID;

                    if (daysUntil < 0) {
                        serviceHtml = `<span class="pill p-r">Υπερημερία ${dateStr}</span>`;
                        if (!isDismissed(vid)) {
                            notifCount++;
                            notifHtml += `<div class="ns ns-e" onclick="dismissServiceNotif(${vid},this)"><i class="ti ti-car" aria-hidden="true"></i><div><strong>${plate}:</strong> Service υπερήμερο από ${dateStr} — απαιτείται άμεση συντήρηση</div></div>`;
                        }
                    } else if (daysUntil <= 30) {
                        serviceHtml = `<span class="pill p-a">Σε ${daysUntil} ημ. (${dateStr})</span>`;
                        if (!isDismissed(vid)) {
                            notifCount++;
                            notifHtml += `<div class="ns ns-w" onclick="dismissServiceNotif(${vid},this)"><i class="ti ti-car" aria-hidden="true"></i><div><strong>${plate}:</strong> Προγραμματισμένο service σε ${daysUntil} ημέρες (${dateStr})</div></div>`;
                        }
                    } else {
                        serviceHtml = `<span class="pill p-g">${dateStr}</span>`;
                    }
                }
            }

            return `
                <tr>
                    <td><strong>${v.Type}</strong></td>
                    <td><code style="background:var(--bg-card); padding:2px 6px; border-radius:4px;">${v.PlateNumber}</code></td>
                    <td>${kmDisplay}</td>
                    <td>${statusHtml}</td>
                    <td>${serviceHtml}</td>
                    <td style="white-space:nowrap">
                        ${logKmBtn}
                        <button class="btn btn-sm btn-dark" onclick="openTripModal(${v.VehicleID}, '${(v.PlateNumber || v.Type || '').replace(/'/g,"\\'")}')" title="Δρομολόγια">
                            <i class="ti ti-route"></i>
                        </button>
                        <button class="btn btn-sm" onclick="openVehicleModal(${v.VehicleID})" title="Επεξεργασία">
                            <i class="ti ti-pencil"></i>
                        </button>
                        <button class="btn btn-sm" onclick="deleteVehicle(${v.VehicleID})" title="Διαγραφή">
                            <i class="ti ti-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;

        if (notifContainer && notifHtml) {
            notifContainer.innerHTML = notifHtml;
        }

        // Ειδοποιήσεις από τη βάση (ανεφοδιασμός, βλάβες οχημάτων κλπ.)
        try {
            const { data: dbNotifs } = await supabase
                .from('NOTIFICATION')
                .select('NotificationID, Type, Message, CreatedAt')
                .in('TargetRole', ['both', 'admin'])
                .eq('IsRead', false)
                .order('CreatedAt', { ascending: false });

            if (dbNotifs && dbNotifs.length > 0) {
                let extraHtml = dbNotifs.map(n => {
                    const isFault = n.Type === 'vehicle_fault';
                    const icon = isFault ? 'ti ti-alert-octagon' : 'ti ti-package';
                    const cls = isFault ? 'ns-e' : 'ns-w';
                    return `
                    <div class="ns ${cls}" id="restock-notif-${n.NotificationID}" onclick="dismissRestockNotif(${n.NotificationID}, this)">
                        <i class="${icon}" aria-hidden="true"></i>
                        <div style="flex:1">${n.Message}</div>
                    </div>`;
                }).join('');

                if (notifContainer) {
                    notifContainer.insertAdjacentHTML('beforeend', extraHtml);
                    notifCount += dbNotifs.length;
                }
            }
        } catch (_) {}

        // Ειδοποιήσεις δυναμικής τιμολόγησης (πληρότητα <60%)
        try {
            const { data: pricingNotifs } = await supabase
                .from('NOTIFICATION')
                .select('NotificationID, Message, CreatedAt')
                .eq('TargetRole', 'admin')
                .eq('Type', 'pricing')
                .eq('IsRead', false)
                .order('CreatedAt', { ascending: false });

            if (pricingNotifs && pricingNotifs.length > 0) {
                let pricingHtml = pricingNotifs.map(n => `
                    <div class="ns ns-e" id="pricing-notif-${n.NotificationID}" onclick="dismissPricingNotif(${n.NotificationID}, this)">
                        <i class="ti ti-discount-2" aria-hidden="true"></i>
                        <div style="flex:1">${n.Message}</div>
                    </div>`).join('');

                if (notifContainer) {
                    notifContainer.insertAdjacentHTML('beforeend', pricingHtml);
                    notifCount += pricingNotifs.length;
                }
            }
        } catch (_) {}

        updateNotifBadge(notifCount);

    } catch (err) {
        console.error("Σφάλμα φόρτωσης οχημάτων:", err.message);
        showToast("Αποτυχία φόρτωσης στόλου οχημάτων.", "error");
    }
}

function isDismissed(vehicleId) {
    const key = `dismissed_svc_${vehicleId}`;
    const val = localStorage.getItem(key);
    if (!val) return false;
    const dismissedAt = parseInt(val, 10);
    if (isNaN(dismissedAt)) return false;
    return (Date.now() - dismissedAt) < 24 * 60 * 60 * 1000;
}

function updateNotifBadge(count) {
    const el = document.getElementById('dash-action-val');
    if (!el) return;
    el.textContent = count;
    const card = el.closest('.sc');
    const sub = card?.querySelector('.sc-sub');
    if (count > 0) {
        el.className = 'sc-val sc-dn';
        if (sub) sub.textContent = 'Απαιτούν προσοχή';
    } else {
        el.className = 'sc-val sc-up';
        if (sub) sub.textContent = 'Καμία εκκρεμότητα';
    }
}

function saveNotifHistory(type, id, message, cls) {
    const key = `notif_history_${type}_${id}`;
    try {
        localStorage.setItem(key, JSON.stringify({ message, cls, dismissedAt: Date.now() }));
    } catch (_) {}
}

function removeNotifHistory(type, id) {
    try { localStorage.removeItem(`notif_history_${type}_${id}`); } catch (_) {}
}

window.dismissServiceNotif = function(vehicleId, el) {
    localStorage.setItem(`dismissed_svc_${vehicleId}`, Date.now().toString());
    const msgEl = el.querySelector('div');
    const msg = msgEl ? msgEl.textContent.trim() : 'Ειδοποίηση service';
    const cls = el.classList.contains('ns-e') ? 'ns-e' : 'ns-w';
    saveNotifHistory('svc', vehicleId, msg, cls);
    el.style.opacity = '0';
    setTimeout(() => {
        el.remove();
        const container = document.getElementById('admin-notifications');
        const remaining = container ? container.children.length : 0;
        updateNotifBadge(remaining);
    }, 300);
};

window.dismissRestockNotif = async function(notifId, el) {
    try {
        await supabase.from('NOTIFICATION').update({ IsRead: true }).eq('NotificationID', notifId);
    } catch (_) {}
    const target = el || document.getElementById(`restock-notif-${notifId}`);
    if (target) {
        const msgEl = target.querySelector('div');
        const msg = msgEl ? msgEl.textContent.trim() : 'Ειδοποίηση ανεφοδιασμού';
        saveNotifHistory('restock', notifId, msg, 'ns-w');
        target.style.opacity = '0';
        setTimeout(() => {
            target.remove();
            const container = document.getElementById('admin-notifications');
            const remaining = container ? container.children.length : 0;
            updateNotifBadge(remaining);
        }, 300);
    }
};

window.dismissPricingNotif = async function(notifId, el) {
    try {
        await supabase.from('NOTIFICATION').update({ IsRead: true }).eq('NotificationID', notifId);
    } catch (_) {}
    const target = el || document.getElementById(`pricing-notif-${notifId}`);
    if (target) {
        const msgEl = target.querySelector('div');
        const msg = msgEl ? msgEl.textContent.trim() : 'Ειδοποίηση τιμολόγησης';
        saveNotifHistory('pricing', notifId, msg, 'ns-e');
        target.style.opacity = '0';
        setTimeout(() => {
            target.remove();
            const container = document.getElementById('admin-notifications');
            const remaining = container ? container.children.length : 0;
            updateNotifBadge(remaining);
        }, 300);
    }
};

window.undoPricingNotif = async function(notifId) {
    try {
        await supabase.from('NOTIFICATION').update({ IsRead: false }).eq('NotificationID', notifId);
        removeNotifHistory('pricing', notifId);
        showToast('Η ειδοποίηση τιμολόγησης επαναφέρθηκε.', 'info');
        loadNotifHistory();
        fetchVehicles();
        const dashItem = document.querySelector('.sb-item[data-v="dash"]');
        if (dashItem) dashItem.click();
    } catch (err) {
        showToast('Αποτυχία επαναφοράς.', 'error');
    }
};

/* ==============================================================
   ΙΣΤΟΡΙΚΟ ΕΙΔΟΠΟΙΗΣΕΩΝ
   ============================================================== */
let _notifHistoryData = [];
let _notifHistoryPage = 0;
const _notifHistoryPerPage = 30;

function renderNotifHistory(page) {
    const container = document.getElementById('notif-history-body');
    if (!container) return;

    const total = _notifHistoryData.length;
    const start = page * _notifHistoryPerPage;
    const end = Math.min(start + _notifHistoryPerPage, total);
    const pageItems = _notifHistoryData.slice(start, end);

    let html = `<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">Εμφάνιση ${total > 0 ? start + 1 : 0}–${end} από ${total} ειδοποιήσεις</div>`;

    pageItems.forEach(s => {
        const dateStr = s.dismissedAt ? new Date(s.dismissedAt).toLocaleString('el-GR') : '—';
        html += `
            <div class="ns ${s.cls}" style="cursor:default">
                <i class="${s.icon}" aria-hidden="true"></i>
                <div style="flex:1">
                    <div style="font-weight:600;font-size:11px;color:var(--text-secondary);margin-bottom:2px;">${s.type} · ${dateStr}</div>
                    <div>${s.message}</div>
                </div>
                <button class="btn btn-sm" onclick="${s.undo}" style="flex-shrink:0" title="Επαναφορά">↩</button>
            </div>`;
    });

    // Pagination controls
    const totalPages = Math.ceil(total / _notifHistoryPerPage);
    if (totalPages > 1) {
        let pagesHtml = '';
        // Show first, last, and pages around current
        const range = 2;
        for (let p = 0; p < totalPages; p++) {
            if (p === 0 || p === totalPages - 1 || Math.abs(p - page) <= range) {
                pagesHtml += `<button class="btn btn-sm ${p === page ? 'btn-dark' : ''}" onclick="pageNotifHistory(${p})">${p + 1}</button>`;
            } else if (pagesHtml.slice(-12) !== '·</span>') {
                pagesHtml += '<span style="padding:0 4px;color:var(--text-secondary);">·</span>';
            }
        }
        html += `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;flex-wrap:wrap;font-size:12px;">
            <button class="btn btn-sm" onclick="pageNotifHistory(${page - 1})" ${page === 0 ? 'disabled' : ''}>‹ Πίσω</button>
            ${pagesHtml}
            <button class="btn btn-sm" onclick="pageNotifHistory(${page + 1})" ${end >= total ? 'disabled' : ''}>Επόμενο ›</button>
        </div>`;
    }

    container.innerHTML = html;
}

window.pageNotifHistory = function(page) {
    _notifHistoryPage = page;
    renderNotifHistory(page);
};

window.loadNotifHistory = async function() {
    const container = document.getElementById('notif-history-body');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);"><i class="ti ti-loader" style="animation:spin 1s linear infinite;font-size:1.5rem;"></i><br>Φόρτωση ιστορικού...</div>';

    _notifHistoryData = [];
    _notifHistoryPage = 0;

    // 1. Service notifications from localStorage
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('notif_history_svc_')) continue;
            const id = key.replace('notif_history_svc_', '');
            try {
                const entry = JSON.parse(localStorage.getItem(key));
                _notifHistoryData.push({
                    type: 'Υπηρεσία οχήματος',
                    icon: 'ti ti-car',
                    cls: entry.cls || 'ns-w',
                    message: entry.message,
                    dismissedAt: entry.dismissedAt,
                    undo: `undoServiceNotif('${id}')`
                });
            } catch (_) {}
        }
    } catch (_) {}

    // 2. Restock notifications from DB (IsRead = true)
    try {
        const { data: readNotifs } = await supabase
            .from('NOTIFICATION')
            .select('NotificationID, Message, Type, CreatedAt, INVENTORY_ITEM (Name)')
            .in('TargetRole', ['both', 'admin'])
            .eq('IsRead', true)
            .order('CreatedAt', { ascending: false })
            .limit(200);

        if (readNotifs && readNotifs.length > 0) {
            readNotifs.forEach(n => {
<<<<<<< HEAD
                if (n.Type === 'pricing') {
                    _notifHistoryData.push({
                        type: 'Δυναμική Τιμολόγηση',
                        icon: 'ti ti-discount-2',
                        cls: 'ns-e',
                        message: n.Message,
                        dismissedAt: n.CreatedAt ? new Date(n.CreatedAt).getTime() : null,
                        undo: `undoPricingNotif(${n.NotificationID})`
                    });
                } else {
                    _notifHistoryData.push({
                        type: 'Ανεφοδιασμός',
                        icon: 'ti ti-package',
                        cls: 'ns-w',
                        message: n.Message,
                        dismissedAt: n.CreatedAt ? new Date(n.CreatedAt).getTime() : null,
                        undo: `undoRestockNotif(${n.NotificationID})`
                    });
                }
=======
const isFault = n.Type === 'vehicle_fault';
                _notifHistoryData.push({
                    type: isFault ? 'Βλάβη οχήματος' : 'Ανεφοδιασμός',
                    icon: isFault ? 'ti ti-alert-octagon' : 'ti ti-package',
                    cls: isFault ? 'ns-e' : 'ns-w',
                    message: n.Message,
                    dismissedAt: n.CreatedAt ? new Date(n.CreatedAt).getTime() : null,
                    undo: `undoRestockNotif(${n.NotificationID})`
                });
>>>>>>> b31125c7ae77d5e3de0db4f24cbaf449b566141e
            });
        }
    } catch (_) {}

    if (_notifHistoryData.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted);"><i class="ti ti-history" style="font-size:2rem;display:block;margin-bottom:10px;"></i>Δεν υπάρχει ιστορικό ειδοποιήσεων.</div>';
        return;
    }

    _notifHistoryData.sort((a, b) => (b.dismissedAt || 0) - (a.dismissedAt || 0));
    renderNotifHistory(0);
};

window.undoServiceNotif = function(vehicleId) {
    localStorage.removeItem(`dismissed_svc_${vehicleId}`);
    removeNotifHistory('svc', vehicleId);
    showToast('Η ειδοποίηση service επαναφέρθηκε.', 'info');
    loadNotifHistory();
    const dashItem = document.querySelector('.sb-item[data-v="dash"]');
    if (dashItem) dashItem.click();
};

window.undoRestockNotif = async function(notifId) {
    try {
        await supabase.from('NOTIFICATION').update({ IsRead: false }).eq('NotificationID', notifId);
        removeNotifHistory('restock', notifId);
        showToast('Η ειδοποίηση ανεφοδιασμού επαναφέρθηκε.', 'info');
        loadNotifHistory();
        fetchVehicles();
        const dashItem = document.querySelector('.sb-item[data-v="dash"]');
        if (dashItem) dashItem.click();
    } catch (err) {
        showToast('Αποτυχία επαναφοράς.', 'error');
    }
};

/* ==============================================================
   ΔΡΟΜΟΛΟΓΙΑ — MODAL ΠΡΟΒΟΛΗΣ
   ============================================================== */
function tripStatusPill(status) {
    const map = { 'Confirmed': 'p-b', 'CheckedIn': 'p-g', 'CheckedOut': 'p-gr', 'Cancelled': 'p-r' };
    const cls = map[status] || 'p-a';
    return `<span class="pill ${cls}">${status}</span>`;
}

window.openTripModal = async function(vehicleId, plateNumber) {
    document.getElementById('trip-modal-title').textContent = `Δρομολόγια — ${plateNumber}`;
    document.getElementById('trip-modal-body').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;font-size:1.5rem;"></i><br>Φόρτωση δρομολογίων...</td></tr>';
    document.getElementById('trip-modal').style.display = 'flex';

    try {
        const { data, error } = await supabase
            .from('TRIP')
            .select(`
                TripID, Date, Destination, Cost, EndKm,
                EMPLOYEE (FirstName, LastName),
                CUSTOMER (FirstName, LastName),
                RESERVATION (CheckInDate, CheckOutDate, RoomType, Status)
            `)
            .eq('VehicleID', vehicleId)
            .order('Date', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('trip-modal-body');

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">Δεν υπάρχουν δρομολόγια για αυτό το όχημα.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(t => {
            const driver = t.EMPLOYEE || {};
            const driverName = `${driver.FirstName || ''} ${driver.LastName || ''}`.trim() || '—';
            const customer = t.CUSTOMER || {};
            const customerName = `${customer.FirstName || ''} ${customer.LastName || ''}`.trim() || '—';
            const dateStr = new Date(t.Date).toLocaleDateString('el-GR');

            const res = t.RESERVATION || {};
            const checkIn = res.CheckInDate ? new Date(res.CheckInDate).toLocaleDateString('el-GR') : '—';
            const checkOut = res.CheckOutDate ? new Date(res.CheckOutDate).toLocaleDateString('el-GR') : '—';
            const roomType = res.RoomType || '—';
            const resStatus = res.Status ? tripStatusPill(res.Status) : '<span class="pill p-gr">—</span>';
            const endKm = t.EndKm != null ? `${Number(t.EndKm).toLocaleString()} km` : '<span class="pill p-y">Εκκρεμεί</span>';

            return `
                <tr>
                    <td>${dateStr}</td>
                    <td><strong>${t.Destination}</strong></td>
                    <td>${driverName}</td>
                    <td>${customerName}</td>
                    <td>${checkIn} → ${checkOut}</td>
                    <td>${roomType}</td>
                    <td style="white-space:nowrap">${resStatus} ${endKm}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης δρομολογίων:", err.message);
        document.getElementById('trip-modal-body').innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">Σφάλμα φόρτωσης δεδομένων</td></tr>';
    }
};

window.closeTripModal = function(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('trip-modal').style.display = 'none';
};

/* ==============================================================
   ΔΡΟΜΟΛΟΓΙΑ — CRUD (ΔΙΑΧΕΙΡΙΣΗ ΑΠΟ ADMIN)
   ============================================================== */
async function fetchTrips() {
    const tbody = document.getElementById('trips-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;font-size:1.5rem;"></i><br>Φόρτωση δρομολογίων...</td></tr>';

    try {
        const [tripRes, vehRes, empRes, custRes] = await Promise.all([
            supabase.from('TRIP').select('*').order('Date', { ascending: false }),
            supabase.from('VEHICLE').select('*'),
            supabase.from('EMPLOYEE').select('*'),
            supabase.from('CUSTOMER').select('*')
        ]);

        if (tripRes.error) throw tripRes.error;

        const data = tripRes.data || [];
        const vehMap = Object.fromEntries((vehRes.data || []).map(v => [v.VehicleID, v]));
        const empMap = Object.fromEntries((empRes.data || []).map(e => [e.EmpID, e]));
        const custMap = Object.fromEntries((custRes.data || []).map(c => [c.CustomerID, c]));

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:2rem;">Δεν υπάρχουν δρομολόγια.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(t => {
            const veh = vehMap[t.VehicleID] || {};
            const vehicleName = `${veh.Type || ''} ${veh.LicensePlate || veh.PlateNumber || ''}`.trim() || '—';
            const driver = empMap[t.DriverID] || {};
            const driverName = `${driver.FirstName || ''} ${driver.LastName || ''}`.trim() || '—';
            const customer = custMap[t.CustomerID] || {};
            const customerName = `${customer.FirstName || ''} ${customer.LastName || ''}`.trim() || '—';
            const dateStr = new Date(t.Date).toLocaleDateString('el-GR');
            const cost = t.Cost != null ? `€${t.Cost}` : '—';
            const statusLabel = t.Status === 'completed' ? '<span class="pill p-g">Ολοκληρώθηκε</span>' : '<span class="pill p-a">Εκκρεμεί</span>';
            return `
                <tr>
                    <td>${dateStr}</td>
                    <td><strong>${t.Destination}</strong></td>
                    <td>${vehicleName}</td>
                    <td>${driverName}</td>
                    <td>${customerName}</td>
                    <td>${cost}</td>
                    <td>${statusLabel}</td>
                    <td><button class="btn btn-sm" onclick="deleteTrip(${t.TripID})" title="Διαγραφή"><i class="ti ti-trash"></i></button></td>
                </tr>`;
        }).join('');
    } catch (err) {
        console.error("Σφάλμα φόρτωσης δρομολογίων:", err.message);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:2rem;">Σφάλμα φόρτωσης</td></tr>';
    }
}

async function checkTripStatusColumn() {
    const { error } = await supabase.from('TRIP').select('Status').limit(0).maybeSingle();
    window._tripHasStatus = !error;
}

async function populateTripFormDropdowns() {
    await checkTripStatusColumn();
    try {
        const [vehRes, empRes, custRes] = await Promise.all([
            supabase.from('VEHICLE').select('*').order('VehicleID'),
            supabase.from('EMPLOYEE').select('*').eq('Role', 'driver').eq('isActive', true).order('FirstName'),
            supabase.from('CUSTOMER').select('*').order('FirstName')
        ]);

        const vehSelect = document.getElementById('trip-vehicle');
        if (vehSelect && vehRes.data) {
            vehSelect.innerHTML = '<option value="">— Επιλέξτε Όχημα —</option>' +
                vehRes.data.map(v =>
                    `<option value="${v.VehicleID}">${v.Type || 'Όχημα'} (${v.LicensePlate || v.PlateNumber || '—'})${v.Status === 'maintenance' ? ' [Συντήρηση]' : ''}</option>`
                ).join('');
        }

        const drvSelect = document.getElementById('trip-driver');
        if (drvSelect && empRes.data) {
            if (empRes.data.length === 0) {
                drvSelect.innerHTML = '<option value="">— Δεν υπάρχουν ενεργοί οδηγοί —</option>';
            } else {
                drvSelect.innerHTML = '<option value="">— Επιλέξτε Οδηγό —</option>' +
                    empRes.data.map(e =>
                        `<option value="${e.EmpID}">${e.FirstName || ''} ${e.LastName || ''}</option>`
                    ).join('');
            }
        }

        const custSelect = document.getElementById('trip-customer');
        if (custSelect && custRes.data) {
            custSelect.innerHTML = '<option value="">— Κανένας —</option>' +
                custRes.data.map(c =>
                    `<option value="${c.CustomerID}">${c.FirstName || ''} ${c.LastName || ''}${c.IsGroup ? ' (Group)' : ''}</option>`
                ).join('');
        }

        const now = new Date();
        now.setMinutes(0, 0, 0);
        now.setHours(now.getHours() + 1);
        const pad = (n) => String(n).padStart(2, '0');
        const dateInput = document.getElementById('trip-date');
        if (dateInput) dateInput.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    } catch (err) {
        console.error("Σφάλμα φόρτωσης dropdown:", err.message);
    }
}

window.createTrip = async function() {
    const vehicleId = parseInt(document.getElementById('trip-vehicle')?.value);
    const driverId = parseInt(document.getElementById('trip-driver')?.value);
    const customerId = parseInt(document.getElementById('trip-customer')?.value) || null;
        const rawDate = document.getElementById('trip-date')?.value;
        let date = '';
        if (rawDate) {
            const offset = -new Date().getTimezoneOffset();
            const oh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
            const om = String(Math.abs(offset) % 60).padStart(2, '0');
            const tz = `${offset >= 0 ? '+' : '-'}${oh}:${om}`;
            date = `${rawDate}:00${tz}`;
        }
    const destination = document.getElementById('trip-destination')?.value?.trim();
    const cost = parseFloat(document.getElementById('trip-cost')?.value);

    if (!vehicleId) { showToast('Επιλέξτε όχημα.', 'error'); return; }
    if (!driverId) { showToast('Επιλέξτε οδηγό.', 'error'); return; }
    if (!date) { showToast('Επιλέξτε ημερομηνία.', 'error'); return; }
    if (!destination) { showToast('Συμπληρώστε προορισμό.', 'error'); return; }
    if (!cost || cost <= 0) { showToast('Συμπληρώστε έγκυρο κόστος.', 'error'); return; }

    try {
        const { data: maxTrip } = await supabase
            .from('TRIP')
            .select('TripID')
            .order('TripID', { ascending: false })
            .limit(1)
            .maybeSingle();
        const nextId = (maxTrip?.TripID || 0) + 1;

        const insertFields = {
            TripID: nextId,
            VehicleID: vehicleId,
            DriverID: driverId,
            CustomerID: customerId,
            Date: date,
            Cost: cost,
            Destination: destination
        };

        if (window._tripHasStatus) {
            insertFields.Status = 'pending';
        }

        const { error } = await supabase
            .from('TRIP')
            .insert([insertFields]);

        if (error) throw error;

        showToast('Το δρομολόγιο καταχωρήθηκε επιτυχώς!', 'success');
        document.getElementById('trip-destination').value = '';
        document.getElementById('trip-cost').value = '';
        fetchTrips();
    } catch (err) {
        showToast('Σφάλμα καταχώρησης: ' + err.message, 'error');
    }
};

window.deleteTrip = async function(tripId) {
    if (!await window.showConfirm('Διαγραφή δρομολογίου;')) return;
    try {
        const { error } = await supabase
            .from('TRIP')
            .delete()
            .eq('TripID', tripId);
        if (error) throw error;
        showToast('Το δρομολόγιο διαγράφηκε.', 'info');
        fetchTrips();
    } catch (err) {
        showToast('Σφάλμα διαγραφής: ' + err.message, 'error');
    }
};

/* ==============================================================
   ΟΧΗΜΑΤΑ — CRUD (ΠΡΟΣΘΗΚΗ / ΕΠΕΞΕΡΓΑΣΙΑ / ΔΙΑΓΡΑΦΗ)
   ============================================================== */
window.openVehicleModal = async function(vehicleId) {
    let vehicle = null;
    let serviceRecord = null;
    if (vehicleId) {
        const { data } = await supabase
            .from('VEHICLE')
            .select(`
                *,
                VEHICLE_SERVICE (ServiceID, ServiceDate, NextServiceDate)
            `)
            .eq('VehicleID', vehicleId)
            .single();
        vehicle = data;
        if (vehicle?.VEHICLE_SERVICE?.length > 0) {
            serviceRecord = vehicle.VEHICLE_SERVICE.reduce((a, b) =>
                new Date(a.NextServiceDate || 0) > new Date(b.NextServiceDate || 0) ? a : b
            );
        }
    }

    const existing = document.querySelector('.inv-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `
        <div class="inv-modal">
            <h3>${vehicle ? 'Επεξεργασία' : 'Νέο'} Οχήματος</h3>
            <div class="mform-group">
                <label>Όχημα / Μοντέλο *</label>
                <input type="text" id="v-type" value="${vehicle ? (vehicle.Type || '') : ''}" placeholder="π.χ. Mercedes Sprinter">
            </div>
            <div class="mform-group">
                <label>Πινακίδα *</label>
                <input type="text" id="v-plate" value="${vehicle ? (vehicle.PlateNumber || '') : ''}" placeholder="π.χ. ΚΑΒ-1234">
            </div>
            <div class="mform-group">
                <label>Χιλιόμετρα</label>
                <input type="number" id="v-km" min="0" value="${vehicle ? (vehicle.CurrentKm || 0) : 0}" placeholder="π.χ. 15000">
            </div>
            <div class="mform-group">
                <label>Επόμενο Service</label>
                <input type="date" id="v-service-date" value="${serviceRecord?.NextServiceDate ? serviceRecord.NextServiceDate.split('T')[0] : ''}">
            </div>
            <div class="modal-actions">
                <button class="btn" id="v-cancel">Ακύρωση</button>
                <button class="btn btn-dark" id="v-save">${vehicle ? 'Αποθήκευση' : 'Δημιουργία'}</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    overlay.querySelector('#v-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#v-save').addEventListener('click', async () => {
        const type = overlay.querySelector('#v-type').value.trim();
        const plate = overlay.querySelector('#v-plate').value.trim();
        const kmInput = overlay.querySelector('#v-km').value;
        const currentKm = kmInput !== '' ? parseInt(kmInput, 10) : 0;
        const nextServiceDate = overlay.querySelector('#v-service-date').value || null;

        if (!type || !plate) {
            showToast('Συμπληρώστε Όχημα και Πινακίδα.', 'error');
            return;
        }

        if (!await window.showConfirm(`${vehicle ? 'Ενημέρωση' : 'Δημιουργία'} οχήματος "${plate}";`)) return;

        try {
            if (vehicle) {
                const { error: vehErr } = await supabase
                    .from('VEHICLE')
                    .update({ Type: type, PlateNumber: plate, CurrentKm: currentKm })
                    .eq('VehicleID', vehicle.VehicleID);
                if (vehErr) throw vehErr;

                if (serviceRecord) {
                    const { error: svcErr } = await supabase
                        .from('VEHICLE_SERVICE')
                        .update({ NextServiceDate: nextServiceDate })
                        .eq('ServiceID', serviceRecord.ServiceID);
                    if (svcErr) throw svcErr;
                } else if (nextServiceDate) {
                    const { error: svcErr } = await supabase
                        .from('VEHICLE_SERVICE')
                        .insert([{ VehicleID: vehicle.VehicleID, ServiceDate: nextServiceDate, NextServiceDate: nextServiceDate }]);
                    if (svcErr) throw svcErr;
                }

                showToast(`Όχημα "${plate}" ενημερώθηκε.`, 'success');
            } else {
                const { data: newVeh, error: vehErr } = await supabase
                    .from('VEHICLE')
                    .insert([{ Type: type, PlateNumber: plate, Status: 'available', LicensePlate: plate, CurrentKm: currentKm }])
                    .select()
                    .single();
                if (vehErr) throw vehErr;

                if (nextServiceDate && newVeh) {
                    const { error: svcErr } = await supabase
                        .from('VEHICLE_SERVICE')
                        .insert([{ VehicleID: newVeh.VehicleID, ServiceDate: nextServiceDate, NextServiceDate: nextServiceDate }]);
                    if (svcErr) throw svcErr;
                }

                showToast(`Όχημα "${plate}" δημιουργήθηκε.`, 'success');
            }

            overlay.remove();
            fetchVehicles();
        } catch (err) {
            showToast('Αποτυχία: ' + err.message, 'error');
        }
    });

    overlay.querySelector('#v-type').focus();

    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#v-save').click();
        if (e.key === 'Escape') overlay.remove();
    });
};

window.deleteVehicle = async function(vehicleId) {
    if (!await window.showConfirm('Διαγραφή οχήματος και όλων των δρομολογίων του; Η ενέργεια είναι μη αναστρέψιμη.')) return;

    try {
        const { error: svcErr } = await supabase
            .from('VEHICLE_SERVICE')
            .delete()
            .eq('VehicleID', vehicleId);
        if (svcErr) throw svcErr;

        const { error: tripErr } = await supabase
            .from('TRIP')
            .delete()
            .eq('VehicleID', vehicleId);
        if (tripErr) throw tripErr;

        const { error: vehErr } = await supabase
            .from('VEHICLE')
            .delete()
            .eq('VehicleID', vehicleId);
        if (vehErr) throw vehErr;

        showToast('Το όχημα διαγράφηκε.', 'success');
        fetchVehicles();
    } catch (err) {
        showToast('Αποτυχία διαγραφής: ' + err.message, 'error');
    }
};

/* ==============================================================
   ΚΑΤΑΧΩΡΗΣΗ ΧΙΛΙΟΜΕΤΡΩΝ (SR-02)
   ============================================================== */
let _logKmVehicleId = null;

window.openLogKmModal = async function(vehicleId, plateNumber, currentKm) {
    _logKmVehicleId = vehicleId;
    document.getElementById('logkm-modal-title').textContent = `Καταχώρηση Χιλιομέτρων — ${plateNumber}`;
    document.getElementById('logkm-vehicle-name').textContent = plateNumber;
    document.getElementById('logkm-current').textContent = currentKm ? `${Number(currentKm).toLocaleString()} km` : '0 km';

    // Find the latest trip without EndKm
    const { data: trips } = await supabase
        .from('TRIP')
        .select('TripID, Date, Destination, EndKm')
        .eq('VehicleID', vehicleId)
        .order('Date', { ascending: false })
        .limit(1);

    const tripEl = document.getElementById('logkm-last-trip');
    if (trips && trips.length > 0) {
        const t = trips[0];
        const dateStr = new Date(t.Date).toLocaleDateString('el-GR');
        tripEl.textContent = `${dateStr} — ${t.Destination}${t.EndKm ? ` (καταχωρήθηκαν ${t.EndKm} km)` : ' (εκκρεμεί καταχώρηση)'}`;
    } else {
        tripEl.textContent = '—';
    }

    document.getElementById('logkm-input').value = '';
    document.getElementById('logkm-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('logkm-input').focus(), 100);
};

window.closeLogKmModal = function(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('logkm-modal').style.display = 'none';
    _logKmVehicleId = null;
};

// Wire up log-km save (called from init since module scripts miss DOMContentLoaded)
function initLogKmSave() {
    const saveBtn = document.getElementById('logkm-save');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', async () => {
        const vid = _logKmVehicleId;
        if (!vid) return;
        const input = document.getElementById('logkm-input');
        const km = parseInt(input.value, 10);
        if (isNaN(km) || km < 0) {
            showToast('Παρακαλώ συμπληρώστε έγκυρες ενδείξεις χιλιομέτρων.', 'error');
            return;
        }

        if (!await window.showConfirm('Καταχώρηση χιλιομέτρων για το όχημα;')) return;

        try {
            const { data: tripData } = await supabase
                .from('TRIP')
                .select('TripID')
                .eq('VehicleID', vid)
                .is('EndKm', null)
                .order('Date', { ascending: false })
                .limit(1);

            const latestTrip = tripData && tripData.length > 0 ? tripData[0] : null;
            if (latestTrip) {
                const { error: tripErr } = await supabase
                    .from('TRIP')
                    .update({ EndKm: km })
                    .eq('TripID', latestTrip.TripID);
                if (tripErr) throw tripErr;
            }

            const { error: vehErr } = await supabase
                .from('VEHICLE')
                .update({ CurrentKm: km, PendingKmUpdate: false })
                .eq('VehicleID', vid);
            if (vehErr) throw vehErr;

            showToast('Χιλιόμετρα καταχωρήθηκαν επιτυχώς.', 'success');
            closeLogKmModal();
            fetchVehicles();
        } catch (err) {
            showToast('Αποτυχία: ' + err.message, 'error');
        }
    });
}

/* ==============================================================
   ΕΝΟΙΚΙΑΖΟΜΕΝΑ ΚΑΤΑΣΤΗΜΑΤΑ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchRentals() {
    try {
        const tbody = document.getElementById('rentals-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση μισθώσεων...</td></tr>';

        const { data, error } = await supabase
            .from('RENTED_SHOP')
            .select(`
                ShopID, ShopName, TenantName, MonthlyRent,
                LEASE_PAYMENT (IsDelayed)
            `);

        if (error) throw error;

        tbody.innerHTML = data.map(shop => {
            const payment = shop.LEASE_PAYMENT && shop.LEASE_PAYMENT.length > 0 ? shop.LEASE_PAYMENT[0] : null;
            const isDelayed = payment ? payment.IsDelayed : false;

            const statusHtml = isDelayed 
                ? '<span class="pill p-r">Εκκρεμεί / Καθυστέρηση</span>' 
                : '<span class="pill p-g">Πληρώθηκε</span>';

            const shopName = shop.ShopName || 'Κατάστημα ' + shop.ShopID;
            const safeName = shopName.replace(/'/g, "\\'");
            const tenantName = shop.TenantName.replace(/'/g, "\\'");

            const actionBtn = isDelayed
                ? `<button class="btn btn-dark btn-sm" onclick="sendReminder(${shop.ShopID}, '${safeName}', '${tenantName}')">Υπενθύμιση</button>`
                : `<button class="btn btn-sm" disabled>Πληρωμένο ✓</button>`;

            return `
                <tr>
                    <td><strong>${shopName}</strong></td>
                    <td>${shop.TenantName}</td>
                    <td>€${shop.MonthlyRent}</td>
                    <td>${statusHtml}</td>
                    <td style="white-space:nowrap">
                        ${actionBtn}
                        <button class="btn btn-sm" onclick="openRentalModal(${shop.ShopID})" title="Επεξεργασία"><i class="ti ti-pencil"></i></button>
                        <button class="btn btn-sm" onclick="deleteRental(${shop.ShopID}, '${safeName}')" title="Διαγραφή"><i class="ti ti-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης ενοικίων:", err.message);
        showToast("Αποτυχία ενημέρωσης μισθώσεων.", "error");
    }
}

window.sendReminder = async function(shopId, shopName, tenantName) {
    if (!await window.showConfirm(`Αποστολή υπενθύμισης πληρωμής στον "${tenantName}" (${shopName});`)) return;
    showToast(`Υπενθύμιση εστάλη στον ${tenantName}.`, "success");
};

window.openRentalModal = async function(shopId) {
    let shop = null;
    if (shopId) {
        const { data } = await supabase
            .from('RENTED_SHOP')
            .select('ShopID, ShopName, TenantName, MonthlyRent')
            .eq('ShopID', shopId)
            .single();
        shop = data;
    }

    const existing = document.querySelector('.inv-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `
        <div class="inv-modal">
            <h3>${shop ? 'Επεξεργασία' : 'Νέο'} Κατάστημα</h3>
            <div class="mform-group">
                <label>Όνομα Καταστήματος</label>
                <input type="text" id="rs-name" value="${shop?.ShopName || ''}" placeholder="π.χ. Kavala Fashion Boutique">
            </div>
            <div class="mform-group">
                <label>Ενοικιαστής *</label>
                <input type="text" id="rs-tenant" value="${shop?.TenantName || ''}" required>
            </div>
            <div class="mform-group">
                <label>Μηνιαίο Μίσθωμα (€) *</label>
                <input type="number" id="rs-rent" min="0" value="${shop?.MonthlyRent || 0}" required>
            </div>
            <div class="modal-actions">
                <button class="btn" id="rs-cancel">Ακύρωση</button>
                <button class="btn btn-dark" id="rs-save">${shop ? 'Αποθήκευση' : 'Δημιουργία'}</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    overlay.querySelector('#rs-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#rs-save').addEventListener('click', async () => {
        const name = overlay.querySelector('#rs-name').value.trim();
        const tenant = overlay.querySelector('#rs-tenant').value.trim();
        const rent = parseInt(overlay.querySelector('#rs-rent').value, 10);

        if (!tenant || isNaN(rent)) {
            showToast('Συμπληρώστε Ενοικιαστή και Μίσθωμα.', 'error');
            return;
        }

        if (!await window.showConfirm(`${shop ? 'Ενημέρωση' : 'Δημιουργία'} καταστήματος "${tenant}";`)) return;

        try {
            const payload = { ShopName: name || null, TenantName: tenant, MonthlyRent: rent };
            if (shop) {
                const { error } = await supabase.from('RENTED_SHOP').update(payload).eq('ShopID', shop.ShopID);
                if (error) throw error;
                showToast(`Κατάστημα "${tenant}" ενημερώθηκε.`, 'success');
            } else {
                const { error } = await supabase.from('RENTED_SHOP').insert([payload]);
                if (error) throw error;
                showToast(`Κατάστημα "${tenant}" δημιουργήθηκε.`, 'success');
            }
            overlay.remove();
            fetchRentals();
        } catch (err) {
            showToast('Αποτυχία: ' + err.message, 'error');
        }
    });

    overlay.querySelector('#rs-tenant').focus();
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#rs-save').click();
        if (e.key === 'Escape') overlay.remove();
    });
};

window.deleteRental = async function(shopId, name) {
    if (!await window.showConfirm(`Οριστική διαγραφή του "${name}"; Η ενέργεια είναι μη αναστρέψιμη.`)) return;
    try {
        const { error } = await supabase.from('RENTED_SHOP').delete().eq('ShopID', shopId);
        if (error) throw error;
        showToast(`Το κατάστημα "${name}" διαγράφηκε.`, 'success');
        fetchRentals();
    } catch (err) {
        showToast('Αποτυχία διαγραφής: ' + err.message, 'error');
    }
};

/* ==============================================================
   ΜΙΣΘΟΔΟΣΙΑ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchPayroll() {
    try {
        const tbody = document.getElementById('payroll-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Υπολογισμός μισθοδοσίας...</td></tr>';

        const { data, error } = await supabase
            .from('EMPLOYEE')
            .select('EmpID, FirstName, LastName, Role, Salary, IBAN, LastPaymentDate')
            .eq('isActive', true)
            .order('LastName', { ascending: true });

        if (error) throw error;

        tbody.innerHTML = data.map(emp => {
            const lastDate = emp.LastPaymentDate ? new Date(emp.LastPaymentDate).toLocaleDateString('el-GR') : 'Ποτέ';
            const ibanFormatted = emp.IBAN ? `<code>${emp.IBAN.substring(0, 4)}...${emp.IBAN.slice(-4)}</code>` : '<span class="pill p-r">Λείπει IBAN</span>';
            const empName = `${emp.FirstName || ''} ${emp.LastName || ''}`.trim();
            
            return `
                <tr>
                    <td><strong>${empName}</strong></td>
                    <td><span class="pill p-b">${emp.Role}</span></td>
                    <td><span class="editable-cell" data-val="${emp.Salary}" onclick="editPayrollField(this,${emp.EmpID},'Salary')">€${emp.Salary}</span></td>
                    <td><span class="editable-cell" data-val="${emp.IBAN || ''}" onclick="editPayrollField(this,${emp.EmpID},'IBAN')">${ibanFormatted}</span></td>
                    <td>${lastDate}</td>
                    <td>
                        <button class="btn btn-dark btn-sm" onclick="payEmployee(this, ${emp.EmpID}, '${empName}', '${emp.IBAN || ''}')">
                            Πληρωμή
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα μισθοδοσίας:", err.message);
        showToast("Αποτυχία φόρτωσης μισθοδοσίας.", "error");
    }
}

// Επεξεργασία Μισθού / IBAN με inline input
window.editPayrollField = function(cell, empId, field) {
    const currentVal = cell.dataset.val;
    const isSalary = field === 'Salary';
    const displayVal = isSalary ? currentVal : (currentVal || '');

    // Store original HTML for restore on Escape
    const origHtml = cell.innerHTML;

    cell.innerHTML = `<input type="${isSalary ? 'number' : 'text'}" value="${displayVal}" class="edit-inline" style="width:100%;box-sizing:border-box">`;
    const input = cell.querySelector('input');
    input.focus();
    input.select();

    const restore = () => {
        cell.innerHTML = origHtml;
        cell.className = 'editable-cell';
        cell.setAttribute('onclick', `editPayrollField(this,${empId},'${field}')`);
    };

    const save = async () => {
        const newVal = input.value.trim();
        if (isSalary && (newVal === '' || isNaN(parseFloat(newVal)))) {
            showToast('Ο μισθός πρέπει να είναι έγκυρος αριθμός.', 'error');
            return;
        }
        if (newVal === displayVal) {
            restore();
            return;
        }
        if (!await window.showConfirm(`Αλλαγή ${isSalary ? 'μισθού' : 'IBAN'} από "${displayVal}" σε "${newVal}";`)) {
            restore();
            return;
        }
        try {
            const payload = {};
            payload[field] = isSalary ? parseFloat(newVal) : newVal;
            const { error } = await supabase.from('EMPLOYEE').update(payload).eq('EmpID', empId);
            if (error) throw error;
            showToast(`${isSalary ? 'Μισθός' : 'IBAN'} ενημερώθηκε επιτυχώς.`, 'success');
            fetchPayroll();
        } catch (err) {
            showToast('Αποτυχία ενημέρωσης: ' + err.message, 'error');
            restore();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') restore();
    });
    input.addEventListener('blur', save);
}

// Λειτουργία Πληρωμής (Ενημέρωση ημερομηνίας στη βάση)
window.payEmployee = async function(btn, id, name, iban) {
    if (!iban) {
        showToast(`Ο/Η ${name} δεν έχει καταχωρημένο IBAN. Προσθέστε IBAN πρώτα.`, "error");
        return;
    }
    if (!await window.showConfirm(`Επιβεβαίωση πληρωμής για τον/την ${name};`)) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader" style="animation: spin 1s linear infinite;"></i>';

    const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD

    try {
        const { error } = await supabase
            .from('EMPLOYEE')
            .update({ LastPaymentDate: today })
            .eq('EmpID', id);

        if (error) throw error;

        showToast(`Η πληρωμή για τον/την ${name} ολοκληρώθηκε!`, "success");
        fetchPayroll(); // Ανανέωση πίνακα
    } catch (err) {
        console.error(err);
        showToast("Σφάλμα κατά την πληρωμή.", "error");
        btn.disabled = false;
        btn.textContent = "Πληρωμή";
    }
};

/* ==============================================================
   BACKUP SYSTEM — Λήψη όλων των δεδομένων από τη βάση
   ============================================================== */
const BACKUP_TABLES = [
    { name: 'CUSTOMER', label: 'Πελάτες' },
    { name: 'EMPLOYEE', label: 'Υπάλληλοι' },
    { name: 'RESERVATION', label: 'Κρατήσεις' },
    { name: 'RESERVATION_ROOM', label: 'Δωμάτια_Κράτησης' },
    { name: 'ROOM', label: 'Δωμάτια' },
    { name: 'RECEIPT', label: 'Αποδείξεις' },
    { name: 'COMPLAINT', label: 'Παράπονα' },
    { name: 'MINIBAR_CONSUMPTION', label: 'Κατανάλωση_MiniBar' },
    { name: 'INVENTORY_ITEM', label: 'Απόθεμα' },
    { name: 'NOTIFICATION', label: 'Ειδοποιήσεις' },
    { name: 'RENTED_SHOP', label: 'Ενοικιαζόμενα' },
    { name: 'LEASE_PAYMENT', label: 'Πληρωμές_Ενοικίων' },
    { name: 'SHIFT', label: 'Βάρδιες' },
    { name: 'VEHICLE', label: 'Οχήματα' },
    { name: 'VEHICLE_SERVICE', label: 'Service_Οχημάτων' },
    { name: 'TRIP', label: 'Δρομολόγια' }
];

window.runBackup = async function(btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Δημιουργία...';
    showToast('Εκκίνηση δημιουργίας αντιγράφου ασφαλείας...', 'info');

    try {
        // 1. Fetch all tables in parallel
        const results = await Promise.all(BACKUP_TABLES.map(t =>
            supabase.from(t.name).select('*').then(r => ({
                label: t.label,
                name: t.name,
                data: r.data || [],
                error: r.error
            }))
        ));

        const wb = XLSX.utils.book_new();
        const summaryRows = [['Πίνακας', 'Εγγραφές']];
        let totalRows = 0;

        // 2. Build one sheet per table
        results.forEach(r => {
            summaryRows.push([r.label, r.data.length]);
            totalRows += r.data.length;

            const sheet = XLSX.utils.json_to_sheet(r.data);
            const sheetLabel = r.label.slice(0, 31);
            XLSX.utils.book_append_sheet(wb, sheet, sheetLabel);
        });

        // 3. Executive Summary sheet
        summaryRows.push(['Σύνολο', totalRows]);
        const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
        wsSum['!cols'] = [{ wch: 28 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsSum, 'Σύνοψη');

        // 4. Estimate file size
        const rawSize = JSON.stringify(results.map(r => r.data)).length;
        const estimatedKB = Math.max(1, Math.round(rawSize / 1024));
        const sizeStr = estimatedKB >= 1024 ? `${(estimatedKB / 1024).toFixed(1)} MB` : `${estimatedKB} KB`;

        // 5. Download
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
        const filename = `GrandKavala_Backup_${ts}.xlsx`;
        XLSX.writeFile(wb, filename);

        // 6. Save history
        const history = JSON.parse(localStorage.getItem('backup_history') || '[]');
        history.unshift({
            date: `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`,
            time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
            medium: 'Excel',
            size: sizeStr,
            status: 'Ολοκληρώθηκε'
        });
        localStorage.setItem('backup_history', JSON.stringify(history.slice(0, 50)));

        showToast(`Αντίγραφο ασφαλείας δημιουργήθηκε (${sizeStr}, ${totalRows} εγγραφές).`, 'success');
    } catch (err) {
        console.error('Backup error:', err);
        showToast('Αποτυχία δημιουργίας αντιγράφου: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-player-play" aria-hidden="true"></i> Εκτέλεση τώρα';
    loadBackupHistory();
};

function loadBackupHistory() {
    const tbody = document.getElementById('backup-tbody');
    if (!tbody) return;

    const history = JSON.parse(localStorage.getItem('backup_history') || '[]');
    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">Δεν υπάρχει ιστορικό backup.</td></tr>';
        return;
    }

    tbody.innerHTML = history.map(h => `
        <tr>
            <td>${h.date}</td>
            <td>${h.time}</td>
            <td><span class="pill p-b">${h.medium}</span></td>
            <td>${h.size}</td>
            <td><span class="pill p-g">${h.status}</span></td>
            <td style="text-align:center;color:#0F6E56">✓</td>
        </tr>
    `).join('');
}


/* ==============================================================
   ΓΡΑΦΗΜΑ ΕΣΟΔΩΝ & ΕΞΑΓΩΓΗ ΔΕΔΟΜΕΝΩΝ (CSV)
   ============================================================== */
let revChart;

// 1. Αρχικοποίηση Ημερομηνιών (Προεπιλογή: Τρέχων Μήνας)
function initRevenueDates() {
    const startInput = document.getElementById('rev-start-date');
    const endInput = document.getElementById('rev-end-date');
    if (!startInput || !endInput) return;

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    startInput.value = firstDay;
    endInput.value = today;

    // Listeners για αυτόματη ανανέωση όταν αλλάζουν χειροκίνητα οι ημερομηνίες
    [startInput, endInput].forEach(input => {
        input.addEventListener('change', () => fetchRevenue());
    });
}

// 2. Fetch δεδομένων από τη βάση
async function fetchRevenue() {
    try {
        const startDate = document.getElementById('rev-start-date').value;
        const endDate = document.getElementById('rev-end-date').value;

        const { data, error } = await supabase
            .from('RECEIPT')
            .select('PaymentDate, Amount, Category')
            .gte('PaymentDate', startDate)
            .lte('PaymentDate', endDate)
            .order('PaymentDate', { ascending: true });

        if (error) throw error;

        const groupedData = {};
        data.forEach(receipt => {
            const dateObj = new Date(receipt.PaymentDate);
            const dateStr = dateObj.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' });
            
            if (!groupedData[dateStr]) {
                groupedData[dateStr] = { 'Διαμονή': 0, 'Minibar': 0, 'Λοιπά': 0 };
            }
            
            const cat = receipt.Category || 'Λοιπά';
            if (groupedData[dateStr][cat] !== undefined) {
                groupedData[dateStr][cat] += Number(receipt.Amount);
            }
        });

        const labels = Object.keys(groupedData);
        buildRevChart(
            labels, 
            labels.map(date => groupedData[date]['Διαμονή']), 
            labels.map(date => groupedData[date]['Minibar']), 
            labels.map(date => groupedData[date]['Λοιπά'])
        );

        // Ενημέρωση στατιστικών εσόδων
        const total = data.reduce((sum, r) => sum + Number(r.Amount), 0);
        if(document.getElementById('rev-total')) document.getElementById('rev-total').textContent = `€${total.toLocaleString('el-GR')}`;

        const days = Object.keys(groupedData).length;
        const amounts = data.map(r => Number(r.Amount));
        const avg = days > 0 ? total / days : 0;
        const high = amounts.length > 0 ? Math.max(...amounts) : 0;
        const low = amounts.length > 0 ? Math.min(...amounts) : 0;
        if (document.getElementById('rev-avg')) document.getElementById('rev-avg').textContent = `€${avg.toLocaleString('el-GR', { maximumFractionDigits: 0 })}`;
        if (document.getElementById('rev-avg-sub')) document.getElementById('rev-avg-sub').textContent = `${days} ημέρες δεδομένα`;
        if (document.getElementById('rev-high')) document.getElementById('rev-high').textContent = `€${high.toLocaleString('el-GR')}`;
        if (document.getElementById('rev-high-sub')) document.getElementById('rev-high-sub').textContent = days > 0 ? data.find(r => Number(r.Amount) === high)?.PaymentDate || '—' : '—';
        if (document.getElementById('rev-low')) document.getElementById('rev-low').textContent = `€${low.toLocaleString('el-GR')}`;
        if (document.getElementById('rev-low-sub')) document.getElementById('rev-low-sub').textContent = days > 0 ? data.find(r => Number(r.Amount) === low)?.PaymentDate || '—' : '—';

    } catch (err) {
        console.error("Σφάλμα φόρτωσης εσόδων:", err.message);
        showToast("Αποτυχία φόρτωσης δεδομένων εσόδων.", "error");
    }
}

// 3. Σχεδιασμός του γραφήματος
function buildRevChart(labels, diamoni, minibar, loipa) {
    const ctx = document.getElementById('rev-chart');
    if (!ctx) return;
    if (revChart) revChart.destroy();
    
    revChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {label: 'Διαμονή', data: diamoni, backgroundColor: '#1D9E75'},
                {label: 'Minibar', data: minibar, backgroundColor: '#378ADD'},
                {label: 'Λοιπά', data: loipa, backgroundColor: '#F97316'}
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, color: '#888780' } },
                y: { stacked: true, grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 11 }, color: '#888780', callback: v => '€' + (v/1000) + 'k' } }
            }
        }
    });
}

// 4. Εξαγωγή σε Excel (πρώην CSV) — styled workbook
window.exportRevenueToCSV = async function() {
    const startDate = document.getElementById('rev-start-date').value;
    const endDate = document.getElementById('rev-end-date').value;

    const { data, error } = await supabase
        .from('RECEIPT')
        .select('PaymentDate, Amount, Category')
        .gte('PaymentDate', startDate)
        .lte('PaymentDate', endDate)
        .order('PaymentDate', { ascending: true });

    if (error || !data.length) {
        showToast("Δεν βρέθηκαν δεδομένα για εξαγωγή.", "error");
        return;
    }

    // Υπολογισμός στατιστικών
    const total = data.reduce((s, r) => s + (r.Amount || 0), 0);
    const avg = total / data.length;
    const amounts = data.map(r => r.Amount || 0);
    const highest = Math.max(...amounts);
    const lowest = Math.min(...amounts);

    // Δημιουργία workbook
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Executive Summary ──
    const summaryRows = [
        ['Grand Kavala Luxury Hotel & Resort'],
        ['Executive Summary — Αναφορά Εσόδων'],
        [],
        ['Περίοδος', `${startDate} έως ${endDate}`],
        ['Ημερομηνία εξαγωγής', new Date().toLocaleDateString('el-GR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })],
        [],
        ['Σύνολο Εσόδων', `€${total.toFixed(2)}`],
        ['Μέσος Όρος Ημέρας', `€${avg.toFixed(2)}`],
        ['Υψηλότερη Ημέρα', `€${highest.toFixed(2)}`],
        ['Χαμηλότερη Ημέρα', `€${lowest.toFixed(2)}`],
        ['Αριθμός Συναλλαγών', data.length],
        [],
        ['Κατηγορίες', ''],
    ];

    // Ομαδοποίηση ανά κατηγορία
    const catMap = {};
    data.forEach(r => { catMap[r.Category] = (catMap[r.Category] || 0) + (r.Amount || 0); });
    Object.entries(catMap).forEach(([cat, amt]) => {
        summaryRows.push([`  ${cat}`, `€${amt.toFixed(2)}`]);
    });

    const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSum['!cols'] = [{ wch: 32 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Executive Summary');

    // ── Sheet 2: Αναλυτικά Δεδομένα ──
    const dataRows = [['Ημερομηνία', 'Κατηγορία', 'Ποσό (€)']];
    data.forEach(r => dataRows.push([r.PaymentDate, r.Category, r.Amount]));
    dataRows.push([]);
    dataRows.push(['', 'Σύνολο', total]);

    const wsData = XLSX.utils.aoa_to_sheet(dataRows);
    wsData['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsData, 'Αποδείξεις');

    // Αποθήκευση
    XLSX.writeFile(wb, `Revenue_Report_${startDate}_to_${endDate}.xlsx`);
};

// 5. Σύνδεση με το μενού (Sidebar Click)
document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => {
        if (el.dataset.v === 'revenue') {
            // Φορτώνουμε τα δεδομένα αμέσως μόλις γίνει το κλικ
            setTimeout(fetchRevenue, 100); 
        }
    });
});

/* ==============================================================
   ΛΕΙΤΟΥΡΓΙΑ ΑΠΟΣΥΝΔΕΣΗΣ (LOGOUT)
   ============================================================== */
window.logout = function() {
    // 1. Διαγραφή των δεδομένων του χρήστη από το localStorage
    localStorage.removeItem('hotel_user');
    
    // 2. Εμφάνιση ενός μηνύματος (προαιρετικά)
    alert("Αποσυνδεθήκατε επιτυχώς!");
    
    // 3. Ανακατεύθυνση στη σελίδα Login
    window.location.href = "/pages/login.html";
}

/* ==============================================================
   ΔΙΑΧΕΙΡΙΣΗ ΧΡΗΣΤΩΝ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchUsers() {
    try {
        const tbody = document.getElementById('users-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση χρηστών...</td></tr>';

        const { data, error } = await supabase
            .from('EMPLOYEE')
            .select('EmpID, FirstName, LastName, Username, Role, isActive')
            .order('LastName', { ascending: true });

        if (error) throw error;

        tbody.innerHTML = data.map(u => {
            const statusHtml = u.isActive 
                ? '<span class="pill p-g">Ενεργός</span>' 
                : '<span class="pill p-r">Απενεργοποιημένος</span>';
            
            const btnText = u.isActive ? 'Απενεργοποίηση' : 'Ενεργοποίηση';
            const btnClass = u.isActive ? 'btn-sm' : 'btn-dark btn-sm';
            const uName = `${u.FirstName || ''} ${u.LastName || ''}`.trim();
            const safeName = uName.replace(/'/g, "\\'");

            return `
                <tr>
                    <td><strong>${uName}</strong></td>
                    <td><code>${u.Username || '-'}</code></td>
                    <td><span class="pill p-b">${u.Role}</span></td>
                    <td>${statusHtml}</td>
                    <td style="white-space:nowrap">
                        <button class="btn ${btnClass}" onclick="toggleUserStatus(${u.EmpID}, ${u.isActive}, '${safeName}')">
                            ${btnText}
                        </button>
                        <button class="btn btn-sm" onclick="changePassword(${u.EmpID}, '${u.Username || safeName}')" title="Αλλαγή κωδικού">
                            <i class="ti ti-key"></i>
                        </button>
                        <button class="btn btn-sm" onclick="openUserModal(${u.EmpID})" title="Επεξεργασία">
                            <i class="ti ti-pencil"></i>
                        </button>
                        <button class="btn btn-sm" onclick="deleteUser(${u.EmpID}, '${safeName}')" title="Διαγραφή">
                            <i class="ti ti-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα χρηστών:", err.message);
        showToast("Αποτυχία φόρτωσης λίστας χρηστών.", "error");
    }
}

// Λειτουργία: Ενεργοποίηση / Απενεργοποίηση Χρήστη
window.toggleUserStatus = async function(id, currentStatus, name) {
    const currentUser = JSON.parse(localStorage.getItem('hotel_user') || '{}');
    if (id === currentUser.id) {
        showToast("Δεν μπορείτε να απενεργοποιήσετε τον δικό σας λογαριασμό.", "error");
        return;
    }

    const newStatus = !currentStatus;
    const actionText = newStatus ? 'ενεργοποιήσετε' : 'απενεργοποιήσετε';
    
    if (!await window.showConfirm(`Είστε σίγουροι ότι θέλετε να ${actionText} την πρόσβαση για τον/την ${name};`)) return;

    try {
        const { error } = await supabase
            .from('EMPLOYEE')
            .update({ isActive: newStatus })
            .eq('EmpID', id);

        if (error) throw error;

        showToast(`Ο χρήστης ${name} ενημερώθηκε επιτυχώς!`, "success");
        fetchUsers(); // Ανανέωση πίνακα
    } catch (err) {
        console.error(err);
        showToast("Σφάλμα κατά την ενημέρωση του χρήστη.", "error");
    }
};

// Λειτουργία: Αλλαγή Κωδικού Χρήστη
window.changePassword = function(empId, username) {
    const existing = document.querySelector('.pw-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'pw-overlay';
    overlay.innerHTML = `
        <div class="pw-modal">
            <div class="pw-head">
                <i class="ti ti-lock"></i>
                <span>Αλλαγή Κωδικού — ${username}</span>
                <span class="pw-close" id="pw-close">&times;</span>
            </div>
            <div class="pw-body">
                <div class="pw-field">
                    <label>Νέος κωδικός</label>
                    <div class="pw-input-wrap">
                        <input type="password" id="pw-new" placeholder="••••••••" autocomplete="new-password">
                        <span class="pw-eye" id="pw-eye-new" title="Εμφάνιση/Απόκρυψη"><i class="ti ti-eye"></i></span>
                    </div>
                </div>
                <div class="pw-field">
                    <label>Επιβεβαίωση κωδικού</label>
                    <div class="pw-input-wrap">
                        <input type="password" id="pw-confirm" placeholder="••••••••" autocomplete="new-password">
                        <span class="pw-eye" id="pw-eye-confirm" title="Εμφάνιση/Απόκρυψη"><i class="ti ti-eye"></i></span>
                    </div>
                </div>
            </div>
            <div class="pw-foot">
                <button class="btn" id="pw-cancel">Ακύρωση</button>
                <button class="btn btn-dark" id="pw-save"><i class="ti ti-check"></i> Αποθήκευση</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#pw-close').addEventListener('click', close);
    overlay.querySelector('#pw-cancel').addEventListener('click', close);

    overlay.querySelector('#pw-save').addEventListener('click', async () => {
        const pw = overlay.querySelector('#pw-new').value;
        const confirm = overlay.querySelector('#pw-confirm').value;

        if (!pw || pw.length < 3) {
            showToast('Ο κωδικός πρέπει να έχει τουλάχιστον 3 χαρακτήρες.', 'error');
            return;
        }
        if (pw !== confirm) {
            showToast('Οι κωδικοί δεν ταιριάζουν.', 'error');
            return;
        }
        if (!await window.showConfirm(`Αλλαγή κωδικού για ${username};`)) return;

        try {
            const { error } = await supabase
                .from('EMPLOYEE')
                .update({ Password: pw })
                .eq('EmpID', empId);

            if (error) throw error;
            showToast(`Ο κωδικός για ${username} ενημερώθηκε.`, 'success');
            overlay.remove();
            fetchUsers();
        } catch (err) {
            showToast('Αποτυχία αλλαγής κωδικού: ' + err.message, 'error');
        }
    });

    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#pw-save').click();
        if (e.key === 'Escape') overlay.remove();
    });

    overlay.querySelector('#pw-new').focus();

    const toggleVisibility = (inputId, eyeId) => {
        overlay.querySelector(eyeId).addEventListener('click', () => {
            const input = overlay.querySelector(inputId);
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            overlay.querySelector(eyeId).innerHTML = isPassword ? '<i class="ti ti-eye-off"></i>' : '<i class="ti ti-eye"></i>';
        });
    };
    toggleVisibility('#pw-new', '#pw-eye-new');
    toggleVisibility('#pw-confirm', '#pw-eye-confirm');
};

/* ==============================================================
   ΔΙΑΧΕΙΡΙΣΗ ΧΡΗΣΤΩΝ — CRUD (ΠΡΟΣΘΗΚΗ / ΕΠΕΞΕΡΓΑΣΙΑ / ΔΙΑΓΡΑΦΗ)
   ============================================================== */
window.openUserModal = async function(empId) {
    let user = null;
    if (empId) {
        const { data } = await supabase
            .from('EMPLOYEE')
            .select('EmpID, FirstName, LastName, Username, Role, Salary, isActive')
            .eq('EmpID', empId)
            .single();
        user = data;
    }

    const existing = document.querySelector('.inv-overlay');
    if (existing) existing.remove();

    const roleOptions = ['admin', 'manager', 'receptionist', 'maid', 'minibar'];
    const roleHtml = roleOptions.map(r =>
        `<option value="${r}"${user?.Role === r ? ' selected' : ''}>${r}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `
        <div class="inv-modal">
            <h3>${user ? 'Επεξεργασία' : 'Νέος'} Χρήστης</h3>
            <div class="mform-group">
                <label>Όνομα</label>
                <input type="text" id="u-first" value="${user?.FirstName || ''}">
            </div>
            <div class="mform-group">
                <label>Επώνυμο</label>
                <input type="text" id="u-last" value="${user?.LastName || ''}">
            </div>
            <div class="mform-group">
                <label>Username *</label>
                <input type="text" id="u-user" value="${user?.Username || ''}" ${user ? '' : 'required'}>
            </div>
            <div class="mform-group">
                <label>Κωδικός ${user ? '(αφήστε κενό για να παραμείνει ίδιος)' : '*'}</label>
                <input type="password" id="u-pass" ${user ? '' : 'required'}>
            </div>
            <div class="mform-group">
                <label>Ρόλος *</label>
                <select id="u-role">${roleHtml}</select>
            </div>
            <div class="mform-group">
                <label>Μισθός (€) *</label>
                <input type="number" id="u-salary" min="0" value="${user?.Salary || 0}">
            </div>
            <div class="mform-group" style="flex-direction:row;align-items:center;gap:8px">
                <input type="checkbox" id="u-active" ${user?.isActive !== false ? 'checked' : ''} style="width:auto">
                <label for="u-active" style="margin:0">Ενεργός λογαριασμός</label>
            </div>
            <div class="modal-actions">
                <button class="btn" id="u-cancel">Ακύρωση</button>
                <button class="btn btn-dark" id="u-save">${user ? 'Αποθήκευση' : 'Δημιουργία'}</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    overlay.querySelector('#u-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#u-save').addEventListener('click', async () => {
        const first = overlay.querySelector('#u-first').value.trim();
        const last = overlay.querySelector('#u-last').value.trim();
        const username = overlay.querySelector('#u-user').value.trim();
        const password = overlay.querySelector('#u-pass').value;
        const role = overlay.querySelector('#u-role').value;
        const salary = parseInt(overlay.querySelector('#u-salary').value, 10);
        const isActive = overlay.querySelector('#u-active').checked;

        if (!username || !role || isNaN(salary)) {
            showToast('Συμπληρώστε Username, Ρόλο και Μισθό.', 'error');
            return;
        }
        if (!user && !password) {
            showToast('Ο κωδικός είναι υποχρεωτικός για νέο χρήστη.', 'error');
            return;
        }

        if (!await window.showConfirm(`${user ? 'Ενημέρωση' : 'Δημιουργία'} χρήστη "${username}";`)) return;

        try {
            const payload = {
                FirstName: first || null,
                LastName: last || null,
                Username: username,
                Role: role,
                Salary: salary,
                isActive: isActive
            };
            if (password) payload.Password = password;

            if (user) {
                const { error } = await supabase.from('EMPLOYEE').update(payload).eq('EmpID', user.EmpID);
                if (error) throw error;
                showToast(`Χρήστης "${username}" ενημερώθηκε.`, 'success');
            } else {
                const { error } = await supabase.from('EMPLOYEE').insert([payload]);
                if (error) throw error;
                showToast(`Χρήστης "${username}" δημιουργήθηκε.`, 'success');
            }
            overlay.remove();
            fetchUsers();
        } catch (err) {
            showToast('Αποτυχία: ' + err.message, 'error');
        }
    });

    overlay.querySelector('#u-user').focus();
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#u-save').click();
        if (e.key === 'Escape') overlay.remove();
    });
};

window.deleteUser = async function(empId, name) {
    const currentUser = JSON.parse(localStorage.getItem('hotel_user') || '{}');
    if (empId === currentUser.id) {
        showToast('Δεν μπορείτε να διαγράψετε τον δικό σας λογαριασμό.', 'error');
        return;
    }
    if (!await window.showConfirm(`Οριστική διαγραφή του χρήστη "${name}"; Η ενέργεια είναι μη αναστρέψιμη.`)) return;

    try {
        const { error } = await supabase.from('EMPLOYEE').delete().eq('EmpID', empId);
        if (error) throw error;
        showToast(`Ο χρήστης "${name}" διαγράφηκε.`, 'success');
        fetchUsers();
    } catch (err) {
        showToast('Αποτυχία διαγραφής: ' + err.message, 'error');
    }
};

// Εκκίνηση Φόρτωσης όταν ανοίγουν τα Tabs
document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => {
        if (el.dataset.v === 'users') fetchUsers();
        if (el.dataset.v === 'staff') { fetchStaff(); fetchComplaints(); }
    });
});

// Όλες οι κλήσεις αρχικοποίησης τρέχουν ΜΟΝΟ αφού επαληθευτεί ο ρόλος από τη βάση
appReady.then(ok => {
  if (!ok) return;
  const loader = document.getElementById('app-loader');
  if (loader) loader.style.display = 'none';
  document.querySelector('.app').style.display = 'flex';
  document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.v === 'revenue') setTimeout(buildRevChart, 50);
      if (el.dataset.v === 'notif-history') setTimeout(loadNotifHistory, 50);
      if (el.dataset.v === 'trips') { fetchTrips(); populateTripFormDropdowns(); }
    });
  });
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', window.logout);
  setInterval(updateLiveTime, 60000);
  updateLiveTime();
  fetchRooms();
  updateLivePrices();
  if (document.getElementById('mult-summer')) updateSeasonality();
  if (document.getElementById('price-m')) loadPrices();
  if (document.getElementById('staff-body')) fetchStaff();
  if (document.getElementById('complaints-body')) fetchComplaints();
  if (document.getElementById('arrivals-body')) fetchDashboardBookings();
  if (document.getElementById('inventory-body')) fetchInventory();
  if (document.getElementById('vehicles-body')) fetchVehicles();
  if (document.getElementById('rentals-body')) fetchRentals();
  if (document.getElementById('payroll-body')) fetchPayroll();
  if (document.getElementById('special-pricing-rows')) loadSpecialPricing();
  if (document.getElementById('specific-room-rows')) loadRoomSpecialPrices();
  initRevenueDates();
  initLogKmSave();
  loadBackupHistory();
  if (window.HotelScheduler) {
    HotelScheduler.registerTask('roomSync', fetchRooms, 300000);
    HotelScheduler.registerTask('vehicleSync', fetchVehicles, 300000);
    HotelScheduler.start();
  }
});

window.updateSpecificRooms = async function() {
    const from = document.getElementById('sr-from').value;
    const to = document.getElementById('sr-to').value;
    const roomsInput = document.getElementById('specific-room-ids').value;
    const priceInput = document.getElementById('specific-price').value;

    if (!from || !to) {
        showToast('Ορίστε ημερομηνίες περιόδου.', 'error');
        return;
    }
    if (new Date(from) >= new Date(to)) {
        showToast('Η από-ημερομηνία πρέπει να είναι πριν την έως.', 'error');
        return;
    }
    if (!roomsInput || !priceInput) {
        showToast('Παρακαλώ συμπληρώστε δωμάτια και τιμή.', 'warning');
        return;
    }

    const roomNumbers = roomsInput.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    if (roomNumbers.length === 0) {
        showToast('Δεν βρέθηκαν έγκυροι αριθμοί δωματίων.', 'warning');
        return;
    }

    if (!await window.showConfirm(`Αποθήκευση τιμολόγησης ${from} — ${to} για ${roomNumbers.length} δωμάτια (€${priceInput});`)) return;

    const rows = roomNumbers.map(rn => ({ RoomNumber: rn, FromDate: from, ToDate: to, Price: priceInput }));

    try {
        const { error } = await supabase.from('ROOM_SPECIAL_PRICE').insert(rows);
        if (error) throw error;
        showToast(`Αποθηκεύτηκαν ${roomNumbers.length} εξειδικευμένες τιμές δωματίων.`, 'success');
        loadRoomSpecialPrices();
    } catch (err) {
        showToast('Αποτυχία: ' + err.message, 'error');
    }
};

window.loadRoomSpecialPrices = async function() {
    const container = document.getElementById('specific-room-rows');
    if (!container) return;

    if (!document.getElementById('sr-from').value) {
        const today = new Date();
        document.getElementById('sr-from').value = today.toISOString().split('T')[0];
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        document.getElementById('sr-to').value = nextMonth.toISOString().split('T')[0];
    }

    const { data: rows } = await supabase.from('ROOM_SPECIAL_PRICE').select('*').order('SpecialPriceID', { ascending: false });
    const data = rows || [];

    if (data.length === 0) {
        container.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--color-text-secondary)">Δεν υπάρχουν αποθηκευμένες ρυθμίσεις.</div>';
        return;
    }

    container.innerHTML = `
    <div style="margin:0 12px;padding-top:8px;border-top:1px solid var(--color-border-secondary)">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px">Αποθηκευμένες Ρυθμίσεις</div>
        <table style="width:100%;font-size:12px">
            <thead><tr style="background:var(--color-background-secondary)">
                <th style="padding:6px 8px;text-align:left">Δωμάτιο</th>
                <th style="padding:6px 8px;text-align:left">Από</th>
                <th style="padding:6px 8px;text-align:left">Έως</th>
                <th style="padding:6px 8px;text-align:left">Τιμή</th>
                <th style="padding:6px 8px;text-align:left">Ενέργειες</th>
            </tr></thead>
            <tbody>${data.map(r => `
                <tr>
                    <td style="padding:4px 8px">${r.RoomNumber}</td>
                    <td style="padding:4px 8px">${r.FromDate}</td>
                    <td style="padding:4px 8px">${r.ToDate}</td>
                    <td style="padding:4px 8px">€${r.Price}</td>
                    <td style="padding:4px 8px;white-space:nowrap">
                        <button class="btn btn-sm" onclick="deleteRoomSpecialPrice(${r.SpecialPriceID})" title="Διαγραφή"><i class="ti ti-trash"></i></button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
};

window.deleteRoomSpecialPrice = async function(id) {
    if (!await window.showConfirm('Διαγραφή αυτής της τιμολόγησης;')) return;
    try {
        await supabase.from('ROOM_SPECIAL_PRICE').delete().eq('SpecialPriceID', id);
        showToast('Διαγράφηκε.', 'success');
        loadRoomSpecialPrices();
    } catch (err) {
        showToast('Αποτυχία διαγραφής.', 'error');
    }
};

/* ==============================================================
   ΕΞΕΙΔΙΚΕΥΜΕΝΗ ΤΙΜΟΛΟΓΗΣΗ ΠΕΡΙΟΔΟΥ (SPECIAL_PRICING)
   ============================================================== */
const SP_TYPES = ['Μονόκλινο', 'Δίκλινο', 'Φαρδύκλινο', 'Σουίτα'];
const SP_MINS = [50, 80, 100, 200];
const SP_MAXS = [200, 300, 350, 600];
const SP_DEFAULTS = [85, 140, 175, 380];

let allSpecialData = [];

async function loadSpecialPricing() {
    const container = document.getElementById('special-pricing-rows');
    if (!container) return;

    const { data: rawData } = await supabase.from('SPECIAL_PRICING').select('*');
    allSpecialData = rawData || [];

    // Διαγραφή ληγμένων περιόδων
    await supabase.from('SPECIAL_PRICING').delete().lt('ToDate', new Date().toISOString().split('T')[0]);

    let specialData = {};
    allSpecialData.forEach(r => specialData[r.RoomType] = r);

    let priceMap = {};
    try {
        const { data: roomPrices } = await supabase.from('ROOM').select('RoomType, BasePrice');
        if (roomPrices) roomPrices.forEach(r => { if (!priceMap[r.RoomType]) priceMap[r.RoomType] = r.BasePrice; });
    } catch (_) {}

    const first = SP_TYPES.find(t => specialData[t]);
    if (first) {
        document.getElementById('sp-from').value = specialData[first].FromDate;
        document.getElementById('sp-to').value = specialData[first].ToDate;
    } else {
        const today = new Date();
        document.getElementById('sp-from').value = today.toISOString().split('T')[0];
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        document.getElementById('sp-to').value = nextMonth.toISOString().split('T')[0];
    }

    container.innerHTML = SP_TYPES.map((type, i) => {
        const sp = specialData[type];
        const checked = sp ? 'checked' : '';
        const price = sp ? sp.Price : (priceMap[type] || SP_DEFAULTS[i]);
        return `
        <div class="sp-row${checked ? '' : ' disabled'}" id="sp-row-${i}">
            <input type="checkbox" class="sp-cb" data-type="${type}" data-idx="${i}" ${checked} onchange="toggleSpecialPricing(this)">
            <span class="sp-lbl">${type}</span>
            <input type="range" class="sp-slider" data-idx="${i}" min="${SP_MINS[i]}" max="${SP_MAXS[i]}" value="${price}" step="1" ${checked ? '' : 'disabled'} oninput="document.getElementById('sp-val-${i}').textContent='€'+this.value">
            <span class="sp-val" id="sp-val-${i}">€${price}</span>
        </div>`;
    }).join('') + renderSpManageTable();
}

function renderSpManageTable() {
    if (allSpecialData.length === 0) return '<div style="padding:12px;font-size:12px;color:var(--color-text-secondary)">Δεν υπάρχουν αποθηκευμένες ρυθμίσεις.</div>';
    return `
    <div style="margin:12px;padding-top:8px;border-top:1px solid var(--color-border-secondary)">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px">Αποθηκευμένες Ρυθμίσεις</div>
        <table style="width:100%;font-size:12px">
            <thead><tr style="background:var(--color-background-secondary)">
                <th style="padding:6px 8px;text-align:left">Τύπος</th>
                <th style="padding:6px 8px;text-align:left">Από</th>
                <th style="padding:6px 8px;text-align:left">Έως</th>
                <th style="padding:6px 8px;text-align:left">Τιμή</th>
                <th style="padding:6px 8px;text-align:left">Ενέργειες</th>
            </tr></thead>
            <tbody>${allSpecialData.map(r => `
                <tr>
                    <td style="padding:4px 8px">${r.RoomType}</td>
                    <td style="padding:4px 8px">${r.FromDate}</td>
                    <td style="padding:4px 8px">${r.ToDate}</td>
                    <td style="padding:4px 8px">€${r.Price}</td>
                    <td style="padding:4px 8px;white-space:nowrap">
                        <button class="btn btn-sm" onclick="editSpecialPricing(${r.SpecialID})" title="Επεξεργασία"><i class="ti ti-pencil"></i></button>
                        <button class="btn btn-sm" onclick="deleteSpecialPricing(${r.SpecialID}, '${r.RoomType.replace(/'/g, "\\'")}')" title="Διαγραφή"><i class="ti ti-trash"></i></button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

window.editSpecialPricing = async function(specialId) {
    const { data: row } = await supabase.from('SPECIAL_PRICING').select('*').eq('SpecialID', specialId).single();
    if (!row) return;

    document.getElementById('sp-from').value = row.FromDate;
    document.getElementById('sp-to').value = row.ToDate;

    document.querySelectorAll('.sp-cb').forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        const type = cb.dataset.type;
        const checked = type === row.RoomType;
        cb.checked = checked;
        const rowEl = document.getElementById(`sp-row-${idx}`);
        const slider = rowEl.querySelector('.sp-slider');
        if (checked) {
            rowEl.classList.remove('disabled');
            slider.disabled = false;
            slider.value = row.Price;
        } else {
            rowEl.classList.add('disabled');
            slider.disabled = true;
        }
        document.getElementById(`sp-val-${idx}`).textContent = '€' + slider.value;
    });
    showToast(`Φορτώθηκε η ρύθμιση για ${row.RoomType}.`, 'info');
};

window.deleteSpecialPricing = async function(specialId, type) {
    if (!await window.showConfirm(`Διαγραφή εξειδικευμένης τιμολόγησης για "${type}";`)) return;
    try {
        const { error } = await supabase.from('SPECIAL_PRICING').delete().eq('SpecialID', specialId);
        if (error) throw error;
        showToast(`Διαγράφηκε η ρύθμιση για "${type}".`, 'success');
        loadSpecialPricing();
    } catch (err) {
        showToast('Αποτυχία διαγραφής: ' + err.message, 'error');
    }
};

window.toggleSpecialPricing = function(cb) {
    const idx = cb.dataset.idx;
    const row = document.getElementById(`sp-row-${idx}`);
    const slider = row.querySelector('.sp-slider');
    if (cb.checked) {
        row.classList.remove('disabled');
        slider.disabled = false;
    } else {
        row.classList.add('disabled');
        slider.disabled = true;
    }
};

window.saveSpecialPricing = async function() {
    const from = document.getElementById('sp-from').value;
    const to = document.getElementById('sp-to').value;

    if (!from || !to) {
        showToast('Ορίστε ημερομηνίες περιόδου.', 'error');
        return;
    }
    if (new Date(from) >= new Date(to)) {
        showToast('Η από-ημερομηνία πρέπει να είναι πριν την έως.', 'error');
        return;
    }

    const rows = [];
    document.querySelectorAll('.sp-cb:checked').forEach(cb => {
        const type = cb.dataset.type;
        const idx = cb.dataset.idx;
        const price = parseInt(document.querySelector(`.sp-slider[data-idx="${idx}"]`).value, 10);
        rows.push({ RoomType: type, FromDate: from, ToDate: to, Price: price });
    });

    if (!await window.showConfirm(`Αποθήκευση τιμολόγησης για ${rows.length} τύπους δωματίων;`)) return;

    try {
        await supabase.from('SPECIAL_PRICING').delete().gte('SpecialID', 0);
        if (rows.length > 0) {
            const { error } = await supabase.from('SPECIAL_PRICING').insert(rows);
            if (error) throw error;
        }
        showToast(`Αποθηκεύτηκαν ${rows.length} εξειδικευμένες τιμολογήσεις.`, 'success');
        loadSpecialPricing();
    } catch (err) {
        showToast('Αποτυχία: ' + err.message, 'error');
    }
};

