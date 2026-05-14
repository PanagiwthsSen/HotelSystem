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
function triggerAction(msg, type) {
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
function dismissAdminNotif(el) {
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
function updateLivePrices() {
    const valM = document.getElementById('price-m').value;
    const valD = document.getElementById('price-d').value;
    const valF = document.getElementById('price-f').value;
    const valS = document.getElementById('price-s').value;

    document.getElementById('val-m').textContent = `€${valM}`;
    document.getElementById('val-d').textContent = `€${valD}`;
    document.getElementById('val-f').textContent = `€${valF}`;
    document.getElementById('val-s').textContent = `€${valS}`;

    const baseD = parseInt(valD);
    document.getElementById('calc-summer').textContent = `€${Math.round(baseD * 1.6)}/βράδυ`;
    document.getElementById('calc-xmas').textContent = `€${Math.round(baseD * 1.4)}/βράδυ`;
    document.getElementById('calc-easter').textContent = `€${Math.round(baseD * 1.3)}/βράδυ`;
    document.getElementById('calc-low').textContent = `€${Math.round(baseD * 0.85)}/βράδυ`;
}
if(document.getElementById('price-m')) updateLivePrices();

function checkDynamicPricing(occPct) {
    const statusLow = document.getElementById('status-low');
    const pricingAlert = document.getElementById('pricing-alert');
    if(!statusLow || !pricingAlert) return;

    if (occPct < 60) {
        statusLow.className = 'pill p-r'; statusLow.textContent = 'ΕΝΕΡΓΟ';
        pricingAlert.className = 'ns ns-e';
        pricingAlert.innerHTML = `<i class="ti ti-alert-triangle" aria-hidden="true"></i><div><strong>ΠΡΟΣΟΧΗ:</strong> Πληρότητα ${occPct}% (<60%). Εφαρμόζεται αυτόματη έκπτωση Ζ% (15%) σε όλες τις τιμές.</div>`;
    } else {
        statusLow.className = 'pill p-b'; statusLow.textContent = 'Αυτόματο';
        pricingAlert.className = 'ns ns-w';
        pricingAlert.innerHTML = `<i class="ti ti-info-circle" aria-hidden="true"></i><div>Τιμές καλοκαιρινής περιόδου ενεργές. Αν η πληρότητα πέσει <60%, εφαρμόζεται έκπτωση Ζ%.</div>`;
    }
}

function savePrices() {
    showToast("Οι νέες τιμές πόρτας αποθηκεύτηκαν επιτυχώς!", "success");
}

function resetPrices() {
    document.getElementById('price-m').value = 85;
    document.getElementById('price-d').value = 140;
    document.getElementById('price-f').value = 175;
    document.getElementById('price-s').value = 380;
    updateLivePrices();
    showToast("Οι τιμές επανήλθαν στις εργοστασιακές ρυθμίσεις.", "info");
}


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

// 1. Fetch δεδομένων από τη βάση
async function fetchStaff() {
    try {
        const tbody = document.getElementById('staff-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση προσωπικού...</td></tr>';

        // Τραβάμε μόνο τους ενεργούς (isActive = true) υπαλλήλους
        const { data, error } = await supabase
            .from('EMPLOYEE')
            .select('FullName, Role, Salary, Leaves, Score')
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
                n: emp.FullName || 'Χωρίς Όνομα',
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
function stTab(f, el){
    document.querySelectorAll('#v-staff .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    renderStaff(f);
}

// Ξεκινάει το fetch αν βρισκόμαστε στο σωστό σημείο
if(document.getElementById('staff-body')) fetchStaff();

/* ==============================================================
   ΠΑΡΑΠΟΝΑ ΠΕΛΑΤΩΝ (ΔΕΔΟΜΕΝΑ ΑΠΟ SUPABASE)
   ============================================================== */
async function fetchComplaints() {
    try {
        // Βεβαιώσου ότι στο HTML σου, το <tbody> των παραπόνων έχει id="complaints-body"
        const tbody = document.getElementById('complaints-body');
        if (!tbody) return; 

        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;"><i class="ti ti-loader" style="animation: spin 1s linear infinite; font-size: 1.5rem;"></i><br>Φόρτωση παραπόνων...</td></tr>';

        // Τραβάμε τα παράπονα και κάνουμε JOIN τους πίνακες CUSTOMER & EMPLOYEE για να πάρουμε τα ονόματά τους
        const { data, error } = await supabase
            .from('COMPLAINT')
            .select(`
                ComplaintID, Description, Status, CreatedAt,
                CUSTOMER (FullName),
                EMPLOYEE (FullName)
            `)
            .order('CreatedAt', { ascending: false });

        if (error) throw error;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Δεν υπάρχουν παράπονα στο αρχείο.</td></tr>';
            return;
        }

        // Χτίσιμο του HTML με βάση τα δεδομένα
        tbody.innerHTML = data.map(c => {
            const custName = c.CUSTOMER ? c.CUSTOMER.FullName : 'Άγνωστος Πελάτης';
            const empName = c.EMPLOYEE ? c.EMPLOYEE.FullName : '-';
            
            // Μορφοποίηση ημερομηνίας
            const dateObj = new Date(c.CreatedAt);
            const dateStr = dateObj.toLocaleDateString('el-GR') + ' ' + dateObj.toLocaleTimeString('el-GR', {hour: '2-digit', minute:'2-digit'});
            
            let statusHtml = '';
            let btnHtml = '';

            // Ανάλογα με το Status, βγάζουμε τα σωστά κουμπιά και χρώματα
            if (c.Status === 'pending') {
                statusHtml = '<span class="pill p-r">Εκκρεμεί</span>';
                btnHtml = `<button class="btn btn-dark btn-sm" onclick="resolveComplaint(this, ${c.ComplaintID})">Επίλυση</button>`;
            } else {
                statusHtml = '<span class="pill p-g">Επιλύθηκε</span>';
                btnHtml = `<button class="btn btn-sm" onclick="archiveComplaint(this, ${c.ComplaintID})">Αρχείο</button>`;
            }

            return `
                <tr id="comp-row-${c.ComplaintID}">
                    <td>${dateStr}</td>
                    <td><strong>${custName}</strong></td>
                    <td>${c.Description} <br><small style="color:var(--text-muted)">Καταχωρήθηκε από: ${empName}</small></td>
                    <td>${statusHtml}</td>
                    <td>${btnHtml}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης παραπόνων:", err.message);
        showToast("Αποτυχία φόρτωσης παραπόνων.", "error");
    }
}

// Λειτουργία: Επίλυση Παραπόνου (UPDATE στη βάση)
async function resolveComplaint(btn, id) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader" style="animation: spin 1s linear infinite;"></i>';
    
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
        btn.disabled = false;
        btn.textContent = 'Επίλυση';
    }
}

// Λειτουργία: Αρχειοθέτηση Παραπόνου (DELETE από τη βάση - Προαιρετικά μπορεί να είναι απλό hide)
async function archiveComplaint(btn, id) {
    btn.disabled = true;
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
    } catch (err) {
        console.error(err);
        showToast("Σφάλμα κατά τη διαγραφή.", "error");
        btn.disabled = false;
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
            let btnHtml = '';

            // Λογική για το χρώμα και το κουμπί με βάση το απόθεμα
            if (item.Quantity === 0) {
                statusHtml = '<span class="pill p-r">Εξαντλήθηκε</span>';
                btnHtml = `<button class="btn btn-dark btn-sm" onclick="placeOrder(this, '${item.Name}')">Παραγγελία</button>`;
            } else if (item.Quantity <= item.MinThreshold) {
                statusHtml = '<span class="pill p-a">Οριακό Απόθεμα</span>';
                btnHtml = `<button class="btn btn-dark btn-sm" onclick="placeOrder(this, '${item.Name}')">Παραγγελία</button>`;
            } else {
                statusHtml = '<span class="pill p-g">Επαρκές</span>';
                btnHtml = `<span style="color: var(--text-muted)">-</span>`;
            }

            return `
                <tr>
                    <td><strong>${item.Name}</strong></td>
                    <td>${item.Category}</td>
                    <td>${item.Quantity} τεμ. <br><small style="color:var(--text-muted)">(Όριο: ${item.MinThreshold})</small></td>
                    <td>${statusHtml}</td>
                    <td>${btnHtml}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Σφάλμα φόρτωσης αποθήκης:", err.message);
        showToast("Αποτυχία φόρτωσης αποθήκης.", "error");
    }
}

// Συνάρτηση Παραγγελίας (Εκτεθειμένη στο window για το Vite)
window.placeOrder = function(btn, itemName) {
    btn.disabled = true;
    btn.textContent = "Παραγγέλθηκε";
    btn.classList.replace('btn-dark', 'btn');
    
    const statusCell = btn.parentElement.previousElementSibling;
    statusCell.innerHTML = '<span class="pill p-b">Αναμένεται</span>';
    
    showToast(`Στάλθηκε αυτόματη παραγγελία στον προμηθευτή για: ${itemName}`, "success");
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
            .select('EmpID, FullName, Role, Salary, IBAN, LastPaymentDate')
            .eq('isActive', true)
            .order('FullName', { ascending: true });

        if (error) throw error;

        tbody.innerHTML = data.map(emp => {
            const lastDate = emp.LastPaymentDate ? new Date(emp.LastPaymentDate).toLocaleDateString('el-GR') : 'Ποτέ';
            const ibanFormatted = emp.IBAN ? `<code>${emp.IBAN.substring(0, 4)}...${emp.IBAN.slice(-4)}</code>` : '<span class="pill p-r">Λείπει IBAN</span>';
            
            return `
                <tr>
                    <td><strong>${emp.FullName}</strong></td>
                    <td><span class="pill p-b">${emp.Role}</span></td>
                    <td>€${emp.Salary}</td>
                    <td>${ibanFormatted}</td>
                    <td>${lastDate}</td>
                    <td>
                        <button class="btn btn-dark btn-sm" onclick="payEmployee(this, ${emp.EmpID}, '${emp.FullName}')">
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

// Λειτουργία Πληρωμής (Ενημέρωση ημερομηνίας στη βάση)
window.payEmployee = async function(btn, id, name) {
    if (!confirm(`Επιβεβαίωση πληρωμής για τον/την ${name};`)) return;

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
function runBackup(btn) {
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
style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head.appendChild(style);


/* ==============================================================
   ΓΡΑΦΗΜΑ ΕΣΟΔΩΝ (CHART.JS)
   ============================================================== */
let revChart;
function buildRevChart() {
    const ctx = document.getElementById('rev-chart');
    if (!ctx || revChart) return;
    
    revChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['01/05','02/05','03/05','04/05','05/05','06/05','07/05','08/05','Σήμερα'],
            datasets: [
                {label: 'Διαμονή', data: [9200, 10100, 8900, 11400, 12800, 13100, 12400, 11900, 10500], backgroundColor: '#1D9E75'},
                {label: 'Εστιατόριο', data: [1800, 2100, 1950, 2400, 2800, 3100, 2900, 2500, 2100], backgroundColor: '#378ADD'},
                {label: 'Λοιπά', data: [560, 590, 600, 770, 890, 1000, 870, 740, 820], backgroundColor: '#EF9F27'}
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

// Σύνδεση του κουμπιού με τη συνάρτηση
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
}

document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => {
        if (el.dataset.v === 'revenue') setTimeout(buildRevChart, 50);
    });
});

