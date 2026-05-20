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
  if (state === 'occ') return isSoonCheckout(checkoutDate) ? 'Προσεχώς άδειο' : 'Κατειλημμένο';
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
    rooms: 'Κατάσταση Δωματίων', staff: 'Διαχείριση Προσωπικού', restaurant: 'Εστιατόριο & Αποθήκες',
    vehicles: 'Οχήματα & Μεταφορές', gardens: 'Κήποι & Εξωτερικοί Χώροι', rentals: 'Ενοικιαζόμενα Καταστήματα',
    payroll: 'Μισθοδοσία', users: 'Χρήστες & Ρόλοι', backup: 'Backup & Ασφάλεια'
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

            return {
                id: room.RoomNumber,
                type: room.RoomType,
                state: uiState,
                checkOutDate: checkoutMap[room.RoomNumber] || null
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
            alert(`Πληροφορίες Δωματίου\n--------------------\nΔωμάτιο: ${prefix}${r.id}\nΤύπος: ${r.type || 'Άγνωστος'}\nΚατάσταση: ${stateGr}`);
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

function checkDynamicPricing(occPct) {
    const statusLow = document.getElementById('status-low');
    const pricingAlert = document.getElementById('pricing-alert');
    if(!statusLow || !pricingAlert) return;

    if (occPct < 60) {
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

function updateSeasonality() {
    const basePrice = parseInt(document.getElementById('price-d').value) || 140;
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

// 1. Fetch δεδομένων από τη βάση
async function fetchStaff() {
    try {
        const tbody = document.getElementById('staff-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση προσωπικού...</td></tr>';

        // Τραβάμε μόνο τους ενεργούς (isActive = true) υπαλλήλους
        const { data, error } = await supabase
            .from('EMPLOYEE')
            .select('FirstName, LastName, Role, Salary, Leaves, Score')
            .eq('isActive', true)
            .order('Role', { ascending: true });

        if (error) throw error;

        // 2. Μετατροπή και προσαρμογή δεδομένων για το UI
        staffData = data.map(emp => {
            const roleKey = emp.Role ? emp.Role.toLowerCase().trim() : '';
            let deptGR = emp.Role; // Default αν δεν ταιριάζει κάτι

            // Μετάφραση των αγγλικών ρόλων της βάσης σε ελληνικά τμήματα
            if (roleKey === 'receptionist') deptGR = 'Υποδοχή';
            else if (roleKey === 'maid') deptGR = 'Καθαριότητα';
            else if (roleKey === 'minibar' || roleKey === 'restaurant') deptGR = 'Εστιατόριο';
            else if (roleKey === 'admin' || roleKey === 'manager') deptGR = 'Διοίκηση';

            return {
                n: `${emp.FirstName || ''} ${emp.LastName || ''}`.trim() || 'Χωρίς Όνομα',
                dept: deptGR,
                dbRole: roleKey,
                since: '2024',
                leaves: emp.Leaves !== null ? `${emp.Leaves} ημ.` : '0 ημ.', // <--- Από τη βάση
                salary: `€${emp.Salary || 0}`,
                score: emp.Score !== null ? `⭐${emp.Score}` : '⭐-'       // <--- Από τη βάση
            };
        });

        // Ενημέρωση dashboard με αριθμό προσωπικού
        if (document.getElementById('dash-staff-val')) document.getElementById('dash-staff-val').textContent = staffData.length;
        if (document.getElementById('dash-staff-sub')) document.getElementById('dash-staff-sub').textContent = `${staffData.length} ενεργοί υπάλληλοι`;

        renderStaff('all'); // Εμφάνιση όλων αρχικά

    } catch (err) {
        console.error("Σφάλμα φόρτωσης προσωπικού:", err.message);
        showToast("Αποτυχία φόρτωσης προσωπικού.", "error");
    }
}

// 3. Render του HTML
function renderStaff(filter){
    const tbody = document.getElementById('staff-body');
    if (!tbody) return;

    // Φιλτράρισμα με βάση τον αγγλικό ρόλο (dbRole)
    const filteredData = filter === 'all' 
        ? staffData 
        : staffData.filter(s => {
            if (filter === 'reception') return s.dbRole === 'receptionist';
            if (filter === 'clean') return s.dbRole === 'maid';
            if (filter === 'restaurant') return s.dbRole === 'minibar' || s.dbRole === 'restaurant';
            return false;
        });

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">Δεν βρέθηκαν υπάλληλοι σε αυτό το τμήμα.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredData.map(s => 
        `<tr>
            <td>${s.n}</td>
            <td><span class="pill p-b">${s.dept}</span></td>
            <td>Από ${s.since}</td>
            <td>${s.leaves}</td>
            <td>${s.salary}</td>
            <td>${s.score}</td>
            <td>
                <button class="btn btn-sm" onclick="triggerAction('Προβολή καρτέλας: ${s.n}', 'info')">
                    <i class="ti ti-eye" aria-hidden="true"></i>
                </button>
            </td>
        </tr>`
    ).join('');
}

// Λειτουργία των Tabs
window.stTab = function(f, el){
    document.querySelectorAll('#v-staff .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    currentComplaintFilter = f;
    renderStaff(f);
    renderComplaints(f);
}

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
            if (filter === 'reception') return c.empRole === 'receptionist';
            if (filter === 'clean') return c.empRole === 'maid';
            if (filter === 'restaurant') return c.empRole === 'minibar' || c.empRole === 'restaurant';
            return false;
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

        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση στόλου οχημάτων...</td></tr>';

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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Δεν υπάρχουν καταχωρημένα οχήματα.</td></tr>';
            updateNotifBadge(notifCount);
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const rowsHtml = data.map(v => {
            let statusHtml = '';
            const dbStatus = v.Status ? v.Status.toLowerCase() : '';

            if (dbStatus === 'available') {
                statusHtml = '<span class="pill p-g">Διαθέσιμο</span>';
            } else if (dbStatus === 'in_use') {
                statusHtml = '<span class="pill p-b">Σε Δρομολόγιο</span>';
            } else if (dbStatus === 'maintenance') {
                statusHtml = '<span class="pill p-r">Σε Συντήρηση</span>';
            } else {
                statusHtml = `<span class="pill p-a">${v.Status}</span>`;
            }

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
                    <td>${statusHtml}</td>
                    <td>${serviceHtml}</td>
                    <td style="white-space:nowrap">
                        <button class="btn btn-sm btn-dark" onclick="openTripModal(${v.VehicleID}, '${v.PlateNumber || v.Type}')" title="Δρομολόγια">
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

window.dismissServiceNotif = function(vehicleId, el) {
    localStorage.setItem(`dismissed_svc_${vehicleId}`, Date.now().toString());
    el.style.opacity = '0';
    setTimeout(() => {
        el.remove();
        const container = document.getElementById('admin-notifications');
        const remaining = container ? container.children.length : 0;
        updateNotifBadge(remaining);
    }, 300);
};

/* ==============================================================
   ΔΡΟΜΟΛΟΓΙΑ — MODAL ΠΡΟΒΟΛΗΣ
   ============================================================== */
window.openTripModal = async function(vehicleId, plateNumber) {
    document.getElementById('trip-modal-title').textContent = `Δρομολόγια — ${plateNumber}`;
    document.getElementById('trip-modal-body').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;font-size:1.5rem;"></i><br>Φόρτωση δρομολογίων...</td></tr>';
    document.getElementById('trip-modal').style.display = 'flex';

    try {
        const { data, error } = await supabase
            .from('TRIP')
            .select(`
                TripID, Date, Destination, Cost,
                EMPLOYEE (FirstName, LastName),
                CUSTOMER (FirstName, LastName)
            `)
            .eq('VehicleID', vehicleId)
            .order('Date', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('trip-modal-body');

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">Δεν υπάρχουν δρομολόγια για αυτό το όχημα.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(t => {
            const driver = t.EMPLOYEE || {};
            const driverName = `${driver.FirstName || ''} ${driver.LastName || ''}`.trim() || '—';
            const customer = t.CUSTOMER || {};
            const customerName = `${customer.FirstName || ''} ${customer.LastName || ''}`.trim() || '—';
            const dateStr = new Date(t.Date).toLocaleDateString('el-GR');
            const cost = t.Cost ? `€${Number(t.Cost).toLocaleString('el-GR')}` : '—';

            return `
                <tr>
                    <td>${dateStr}</td>
                    <td><strong>${t.Destination}</strong></td>
                    <td>${driverName}</td>
                    <td>${customerName}</td>
                    <td><strong>${cost}</strong></td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης δρομολογίων:", err.message);
        document.getElementById('trip-modal-body').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">Σφάλμα φόρτωσης δεδομένων</td></tr>';
    }
};

window.closeTripModal = function(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('trip-modal').style.display = 'none';
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
                    .update({ Type: type, PlateNumber: plate })
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
                    .insert([{ Type: type, PlateNumber: plate, Status: 'available', LicensePlate: plate }])
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
   ΚΟΥΜΠΙΑ: BACKUP SYSTEM
   ============================================================== */
window.runBackup = function(btn) {
    showToast("Η λειτουργία backup δεν είναι ακόμα συνδεδεμένη με το σύστημα αρχείων.", "info");
}

// Απλό animation για το κουμπί backup
const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }
.mult-input{width:60px;padding:4px 6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-body);color:var(--text-main);font-weight:500;text-align:center;font-size:13px}
.mult-input:focus{outline:2px solid var(--accent)}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000}
.modal-content{background:var(--color-background-primary);border-radius:12px;max-width:560px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)}
.modal-header{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.5rem;border-bottom:1px solid var(--border-color)}
.modal-title{font-weight:600;font-size:1.1rem}
.modal-close{cursor:pointer;font-size:1.5rem;color:var(--text-muted);line-height:1;padding:0 4px}
.modal-close:hover{color:var(--text-main)}
.modal-body{padding:1.5rem;line-height:1.7}
.modal-body .field{margin-bottom:12px}
.modal-body .field-label{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.modal-body .field-value{font-size:14px;color:var(--text-main)}
.modal-body .desc-box{padding:12px;background:var(--bg-body);border-radius:8px;margin-top:4px;font-size:14px;line-height:1.6;white-space:pre-wrap}
.modal-footer{display:flex;gap:8px;justify-content:flex-end;padding:1rem 1.5rem;border-top:1px solid var(--border-color)}`;
document.head.appendChild(style);


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
                groupedData[dateStr] = { 'Διαμονή': 0, 'Εστιατόριο': 0, 'Λοιπά': 0 };
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
            labels.map(date => groupedData[date]['Εστιατόριο']), 
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
function buildRevChart(labels, diamoni, estiatorio, loipa) {
    const ctx = document.getElementById('rev-chart');
    if (!ctx) return;
    if (revChart) revChart.destroy();
    
    revChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {label: 'Διαμονή', data: diamoni, backgroundColor: '#1D9E75'},
                {label: 'Εστιατόριο', data: estiatorio, backgroundColor: '#378ADD'},
                {label: 'Λοιπά', data: loipa, backgroundColor: '#EF9F27'}
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

// 4. Εξαγωγή σε CSV με διόρθωση Ελληνικών (BOM)
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

    let csvContent = "Ημερομηνία,Κατηγορία,Ποσό (€)\n";
    data.forEach(r => {
        csvContent += `${r.PaymentDate},${r.Category},${r.Amount}\n`;
    });

    // Προσθήκη BOM (\uFEFF) για σωστή ανάγνωση Ελληνικών από το Excel
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Revenue_Report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

    const roleOptions = ['admin', 'manager', 'receptionist', 'maid', 'minibar', 'restaurant'];
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
  initRevenueDates();
});

window.updateSpecificRooms = async function() {
    const roomsInput = document.getElementById('specific-room-ids').value;
    const priceInput = document.getElementById('specific-price').value;

    if (!roomsInput || !priceInput) {
        showToast("Παρακαλώ συμπληρώστε δωμάτια και τιμή.", "warning");
        return;
    }

    const roomNumbers = roomsInput.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

    try {
        if (!await window.showConfirm(`Ενημέρωση τιμών για ${roomNumbers.length} δωμάτια;`)) return;
        const { error } = await supabase
            .from('ROOM')
            .update({ BasePrice: priceInput })
            .in('RoomNumber', roomNumbers);

        if (error) throw error;
        showToast(`Ενημερώθηκαν ${roomNumbers.length} δωμάτια!`, "success");
    } catch (err) {
        showToast("Σφάλμα ενημέρωσης.", "error");
    }
};

/* ==============================================================
   ΕΞΕΙΔΙΚΕΥΜΕΝΗ ΤΙΜΟΛΟΓΗΣΗ ΠΕΡΙΟΔΟΥ (SPECIAL_PRICING)
   ============================================================== */
const SP_TYPES = ['Μονόκλινο', 'Δίκλινο', 'Φαρδύκλινο', 'Σουίτα'];

async function loadSpecialPricing() {
    const container = document.getElementById('special-pricing-rows');
    if (!container) return;

    let specialData = {};
    try {
        const { data } = await supabase.from('SPECIAL_PRICING').select('*');
        if (data) data.forEach(r => specialData[r.RoomType] = r);
    } catch (err) {
        console.warn('loadSpecialPricing:', err);
    }

    container.innerHTML = SP_TYPES.map(type => {
        const sp = specialData[type];
        const checked = sp ? 'checked' : '';
        const fromDate = sp ? sp.FromDate : '';
        const toDate = sp ? sp.ToDate : '';
        const price = sp ? sp.Price : '';
        const hidden = sp ? '' : 'hidden';

        return `
        <div class="sp-row">
            <input type="checkbox" class="sp-cb" data-type="${type}" ${checked} onchange="toggleSpecialPricing('${type}')">
            <span class="sp-lbl">${type}</span>
            <div class="sp-fields ${hidden}" id="sp-fields-${type}">
                <label>Από</label>
                <input type="date" class="sp-from" data-type="${type}" value="${fromDate}">
                <label>Έως</label>
                <input type="date" class="sp-to" data-type="${type}" value="${toDate}">
                <label>Τιμή (€)</label>
                <input type="number" class="sp-price" data-type="${type}" min="0" value="${price}" placeholder="0">
            </div>
        </div>`;
    }).join('');
}

window.toggleSpecialPricing = function(type) {
    const cb = document.querySelector(`.sp-cb[data-type="${type}"]`);
    const fields = document.getElementById(`sp-fields-${type}`);
    if (fields) fields.classList.toggle('hidden', !cb.checked);
};

window.saveSpecialPricing = async function() {
    const rows = [];
    document.querySelectorAll('.sp-cb').forEach(cb => {
        if (!cb.checked) return;
        const type = cb.dataset.type;
        const from = document.querySelector(`.sp-from[data-type="${type}"]`).value;
        const to = document.querySelector(`.sp-to[data-type="${type}"]`).value;
        const price = parseFloat(document.querySelector(`.sp-price[data-type="${type}"]`).value);
        if (!from || !to || isNaN(price)) {
            showToast(`Συμπληρώστε ημερομηνίες και τιμή για ${type}.`, 'error');
            return;
        }
        if (new Date(from) >= new Date(to)) {
            showToast(`Η από-ημερομηνία πρέπει να είναι πριν την έως για ${type}.`, 'error');
            return;
        }
        rows.push({ RoomType: type, FromDate: from, ToDate: to, Price: price });
    });

    if (!await window.showConfirm(`Αποθήκευση ${rows.length} εξειδικευμένων τιμολογήσεων;`)) return;

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

