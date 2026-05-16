import { supabase } from './supabase-config.js';

// ΠΡΟΣΘΗΚΗ ΣΤΗΝ ΑΡΧΗ ΤΟΥ admin.js
const userData = localStorage.getItem('hotel_user');
if (!userData) {
    // Αν δεν υπάρχει καν χρήστης στη μνήμη, πήγαινε στο login
    window.location.href = "/pages/login.html";
} else {
    const user = JSON.parse(userData);
    const role = user.Role.toLowerCase().trim();
    // Αν είναι συνδεδεμένος αλλά ΔΕΝ είναι admin ή manager, πέτα τον έξω
    if (role !== 'admin' && role !== 'manager') {
        alert("Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη σελίδα!");
        window.location.href = "/pages/login.html";
    }
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
    document.getElementById('live-time').innerHTML = now.toLocaleDateString('el-GR', options) + " · Βάρδια: Admin";
}
setInterval(updateLiveTime, 60000);
updateLiveTime();

let adminNotifCount = 4;
window.dismissAdminNotif = function(el) {
    el.style.opacity = '0';
    setTimeout(() => {
        el.remove();
        adminNotifCount--;
        if (adminNotifCount > 0) {
            document.getElementById('notif-count').textContent = adminNotifCount;
            document.getElementById('dash-action-val').textContent = adminNotifCount;
        } else {
            document.getElementById('notif-badge').style.display = 'none';
            document.getElementById('dash-action-val').textContent = 0;
            document.getElementById('dash-action-val').classList.replace('sc-dn', 'sc-up');
        }
    }, 300);
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

        // 2. Μετατροπή των δεδομένων της βάσης στη μορφή που θέλει το frontend
        hotelRooms = data.map(room => {
            let uiState = 'free'; // Default κατάσταση
            const dbStatus = room.Status ? room.Status.toLowerCase().trim() : '';
            
            // Έξυπνο mapping: Πιάνουμε διάφορες εκδοχές των λέξεων (π.χ. 'occupied', 'occ', 'cleaning')
            if (dbStatus.includes('occup') || dbStatus === 'occ') uiState = 'occ';
            else if (dbStatus.includes('clean') || dbStatus === 'dirty') uiState = 'dirty';
            else if (dbStatus.includes('ready') || dbStatus === 'clean') uiState = 'clean';
            else if (dbStatus.includes('avail') || dbStatus === 'free') uiState = 'free';

            return {
                id: room.RoomNumber,
                type: room.RoomType,
                state: uiState
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
function renderMap() {
    const rmap = document.getElementById('rmap');
    if (!rmap) return;
    rmap.innerHTML = '';
    
    if (hotelRooms.length === 0) {
        rmap.innerHTML = '<p style="color: var(--text-muted);">Δεν βρέθηκαν δωμάτια στη βάση.</p>';
        calculateLiveStats(); // Μηδενίζει τα στατιστικά
        return;
    }

    hotelRooms.forEach(r => {
        const d = document.createElement('div');
        d.className = 'rc rc-' + r.state;
        d.textContent = r.id; 
        
        let stateGr = 'Ελεύθερο';
        if (r.state === 'occ') stateGr = 'Κατειλημμένο';
        else if (r.state === 'dirty') stateGr = 'Υπό Καθαρισμό';
        else if (r.state === 'clean') stateGr = 'Έτοιμο';

        d.title = `${r.type} ${r.id} | ${stateGr}`;
        rmap.appendChild(d);
    });
    
    calculateLiveStats();
}

// 5. Δυναμικός Υπολογισμός Στατιστικών (δεν χρησιμοποιούμε πια το "510" καρφωτά)
let currentOcc = 0, currentFree = 0, currentDirty = 0, currentClean = 0;
function calculateLiveStats() {
    const totalRooms = hotelRooms.length || 1; // || 1 για αποφυγή διαίρεσης με το 0 αν η βάση είναι άδεια
    currentOcc = 0; currentFree = 0; currentDirty = 0; currentClean = 0;
    
    hotelRooms.forEach(r => {
        if (r.state === 'occ') currentOcc++;
        else if (r.state === 'free') currentFree++;
        else if (r.state === 'dirty') currentDirty++;
        else if (r.state === 'clean') currentClean++;
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
        document.getElementById('stat-clean').textContent = currentClean;
    }
    
    if (typeof checkDynamicPricing === "function") checkDynamicPricing(occPct);
}

// Εκκίνηση φόρτωσης όταν τρέξει το script
fetchRooms();


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

// Την καλούμε αμέσως μόλις φορτώσει το script
updateLivePrices();

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

const SEASONS = {
    summer: { months: [6, 7, 8], label: 'Καλοκαίρι (Ιούν–Αύγ)' },
    xmas: { months: [12], label: 'Χριστούγεννα' },
    easter: { months: [3, 4], label: 'Πάσχα' }
};

function getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    for (const [key, season] of Object.entries(SEASONS)) {
        if (season.months.includes(month)) return key;
    }
    return null;
}

function updateSeasonality() {
    const basePrice = parseInt(document.getElementById('price-d').value) || 140;
    const activeSeason = getCurrentSeason();

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

if(document.getElementById('mult-summer')) updateSeasonality();

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

// Καλούμε τη φόρτωση τιμών αν είμαστε στο σωστό view
if(document.getElementById('price-m')) loadPrices();


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

// Ξεκινάει το fetch αν βρισκόμαστε στο σωστό σημείο
if(document.getElementById('staff-body')) fetchStaff();

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

// Κλήση της συνάρτησης όταν υπάρχει το αντίστοιχο element
if(document.getElementById('complaints-body')) fetchComplaints();
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

// Εκκίνηση Φόρτωσης
if(document.getElementById('inventory-body')) fetchInventory();

/* ==============================================================
   ΟΧΗΜΑΤΑ & ΜΕΤΑΦΟΡΕΣ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchVehicles() {
    try {
        const tbody = document.getElementById('vehicles-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση στόλου οχημάτων...</td></tr>';

        const { data, error } = await supabase
            .from('VEHICLE')
            .select('*')
            .order('Type', { ascending: true });

        if (error) throw error;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Δεν υπάρχουν καταχωρημένα οχήματα.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(v => {
            let statusHtml = '';
            let statusText = '';
            const dbStatus = v.Status ? v.Status.toLowerCase() : '';

            // Mapping καταστάσεων σε UI Elements
            if (dbStatus === 'available') {
                statusHtml = '<span class="pill p-g">Διαθέσιμο</span>';
                statusText = 'available';
            } else if (dbStatus === 'in_use') {
                statusHtml = '<span class="pill p-b">Σε Δρομολόγιο</span>';
                statusText = 'in_use';
            } else if (dbStatus === 'maintenance') {
                statusHtml = '<span class="pill p-r">Σε Συντήρηση</span>';
                statusText = 'maintenance';
            } else {
                statusHtml = `<span class="pill p-a">${v.Status}</span>`;
            }

            return `
                <tr>
                    <td><strong>${v.Type}</strong></td>
                    <td><code style="background:var(--bg-card); padding:2px 6px; border-radius:4px;">${v.PlateNumber}</code></td>
                    <td>${statusHtml}</td>
                    <td>
                        <button class="btn btn-sm" onclick="triggerAction('Προγραμματισμός δρομολογίου για: ${v.PlateNumber}', 'info')">
                            <i class="ti ti-calendar-event"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης οχημάτων:", err.message);
        showToast("Αποτυχία φόρτωσης στόλου οχημάτων.", "error");
    }
}

// Εκκίνηση Φόρτωσης
if(document.getElementById('vehicles-body')) fetchVehicles();


/* ==============================================================
   ΕΝΟΙΚΙΑΖΟΜΕΝΑ ΚΑΤΑΣΤΗΜΑΤΑ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchRentals() {
    try {
        const tbody = document.getElementById('rentals-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση μισθώσεων...</td></tr>';

        // Join RENTED_SHOP με LEASE_PAYMENT
        const { data, error } = await supabase
            .from('RENTED_SHOP')
            .select(`
                ShopID, ShopName, TenantName, MonthlyRent,
                LEASE_PAYMENT (IsDelayed)
            `);

        if (error) throw error;

        tbody.innerHTML = data.map(shop => {
            // Παίρνουμε την κατάσταση πληρωμής (αν υπάρχει εγγραφή)
            const payment = shop.LEASE_PAYMENT && shop.LEASE_PAYMENT.length > 0 ? shop.LEASE_PAYMENT[0] : null;
            const isDelayed = payment ? payment.IsDelayed : false;

            const statusHtml = isDelayed 
                ? '<span class="pill p-r">Εκκρεμεί / Καθυστέρηση</span>' 
                : '<span class="pill p-g">Πληρώθηκε</span>';

            const actionBtn = isDelayed
                ? `<button class="btn btn-dark btn-sm" onclick="sendNotice(this, 'legal')">Εξώδικο</button>`
                : `<button class="btn btn-sm" onclick="sendNotice(this, 'friendly')">Υπενθύμιση</button>`;

            return `
                <tr>
                    <td><strong>${shop.ShopName || 'Κατάστημα ' + shop.ShopID}</strong></td>
                    <td>${shop.TenantName}</td>
                    <td>€${shop.MonthlyRent}</td>
                    <td>${statusHtml}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης ενοικίων:", err.message);
        showToast("Αποτυχία ενημέρωσης μισθώσεων.", "error");
    }
}

// Εκθέτουμε τη συνάρτηση ειδοποιήσεων για το Vite
window.sendNotice = function(btn, type) {
    btn.disabled = true;
    if(type === 'legal') {
        btn.textContent = "Εστάλη Εξώδικο";
        showToast("Το εξώδικο έχει σταλεί μέσω email στον νομικό σύμβουλο.", "warning");
    } else {
        btn.textContent = "Εστάλη";
        showToast("Η φιλική υπενθύμιση εστάλη στον ενοικιαστή.", "success");
    }
};

// Εκκίνηση Φόρτωσης
if(document.getElementById('rentals-body')) fetchRentals();

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

// Εκκίνηση Φόρτωσης
if(document.getElementById('payroll-body')) fetchPayroll();

/* ==============================================================
   ΚΟΥΜΠΙΑ: BACKUP SYSTEM
   ============================================================== */
window.runBackup = function(btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader" aria-hidden="true" style="animation: spin 1s linear infinite;"></i> Σε εξέλιξη...';
    showToast("Εκκίνηση χειροκίνητου Backup. Παρακαλώ περιμένετε...", "info");

    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-player-play" aria-hidden="true"></i> Εκτέλεση τώρα';
        showToast("Το Backup ολοκληρώθηκε με απόλυτη επιτυχία!", "success");

        // Προσθήκη νέας γραμμής στον πίνακα Backup
        const tbody = document.querySelector('#backup-table tbody');
        const now = new Date();
        const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        
        const newRow = document.createElement('tr');
        newRow.innerHTML = `<td>Μόλις τώρα</td><td>${time}</td><td>X:\\backup_manual</td><td>4.2 GB</td><td><span class="pill p-g">Επιτυχές</span></td><td><span class="pill p-g">OK</span></td>`;
        
        tbody.insertBefore(newRow, tbody.firstChild);
    }, 2500); // Προσομοίωση 2.5 δευτερολέπτων
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

        // Ενημέρωση του συνολικού ποσού στην κάρτα
        const total = data.reduce((sum, r) => sum + Number(r.Amount), 0);
        if(document.getElementById('rev-total')) document.getElementById('rev-total').textContent = `€${total.toLocaleString('el-GR')}`;

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

// Εκκίνηση ημερομηνιών κατά το φόρτωμα της σελίδας
initRevenueDates();

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

            return `
                <tr>
                    <td><strong>${uName}</strong></td>
                    <td><code>${u.Username || '-'}</code></td>
                    <td><span class="pill p-b">${u.Role}</span></td>
                    <td>${statusHtml}</td>
                    <td>
                        <button class="btn ${btnClass}" onclick="toggleUserStatus(${u.EmpID}, ${u.isActive}, '${uName}')">
                            ${btnText}
                        </button>
                        <button class="btn btn-sm" onclick="triggerAction('Αλλαγή κωδικού για: ${u.Username}', 'warning')">
                            <i class="ti ti-key"></i>
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

// Εκκίνηση Φόρτωσης όταν ανοίγει το Tab των Χρηστών
document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => {
        if (el.dataset.v === 'users') fetchUsers();
    });
});

// Σύνδεση του κουμπιού με τη συνάρτηση
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', window.logout);
}

document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => {
        if (el.dataset.v === 'revenue') setTimeout(buildRevChart, 50);
    });
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

