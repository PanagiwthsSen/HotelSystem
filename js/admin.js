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
   ΔΗΜΙΟΥΡΓΙΑ 510 ΔΩΜΑΤΙΩΝ & LIVE STATS
   ============================================================== */
const roomConfig = [
    { prefix: 'Δ', count: 300, name: 'Δίκλινο' },
    { prefix: 'Φ', count: 150, name: 'Φαρδύκλινο' },
    { prefix: 'Μ', count: 50, name: 'Μονόκλινο' },
    { prefix: 'Σ', count: 10, name: 'Σουίτα' }
];

const hotelRooms = [];
roomConfig.forEach(conf => {
    for (let i = 1; i <= conf.count; i++) {
        const r = Math.random();
        let state = 'free';
        if (r < 0.65) state = 'occ'; 
        else if (r < 0.75) state = 'dirty';
        else if (r < 0.85) state = 'clean';
        hotelRooms.push({ id: `${conf.prefix}-${i}`, type: conf.name, state: state });
    }
});

let currentOcc = 0, currentFree = 0, currentDirty = 0, currentClean = 0;
function calculateLiveStats() {
    currentOcc = 0; currentFree = 0; currentDirty = 0; currentClean = 0;
    hotelRooms.forEach(r => {
        if (r.state === 'occ') currentOcc++;
        else if (r.state === 'free') currentFree++;
        else if (r.state === 'dirty') currentDirty++;
        else if (r.state === 'clean') currentClean++;
    });
    
    const occPct = Math.round((currentOcc / 510) * 100);
    const freePct = Math.round((currentFree / 510) * 100);

    // Ενημέρωση UI
    document.getElementById('live-occ-badge').textContent = `Πληρ. ${occPct}%`;
    document.getElementById('dash-occ-val').textContent = `${occPct}%`;
    document.getElementById('dash-occ-sub').textContent = `${currentOcc} / 510 δωμάτια`;
    document.getElementById('dash-occ-bar').style.width = `${occPct}%`;
    
    if(document.getElementById('stat-occ')) {
        document.getElementById('stat-occ').textContent = currentOcc;
        document.getElementById('stat-occ-pct').textContent = `${occPct}%`;
        document.getElementById('stat-occ-bar').style.width = `${occPct}%`;
        document.getElementById('stat-free').textContent = currentFree;
        document.getElementById('stat-free-pct').textContent = `${freePct}%`;
        document.getElementById('stat-dirty').textContent = currentDirty;
        document.getElementById('stat-clean').textContent = currentClean;
    }
    checkDynamicPricing(occPct);
}

function renderMap() {
    const rmap = document.getElementById('rmap');
    if (!rmap) return;
    rmap.innerHTML = '';
    hotelRooms.forEach(r => {
        const d = document.createElement('div');
        d.className = 'rc rc-' + r.state;
        d.textContent = r.id; 
        d.title = `${r.type} ${r.id} | ${r.state === 'occ' ? 'Κατειλημμένο' : r.state === 'free' ? 'Ελεύθερο' : r.state === 'dirty' ? 'Υπό Καθαρισμό' : 'Έτοιμο'}`;
        rmap.appendChild(d);
    });
    calculateLiveStats();
}
renderMap();


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
const staffData = [
    {n:'Αναστασίου Κ.',dept:'Υποδοχή',since:'2021',leaves:'5',salary:'€850',score:'4.8'},
    {n:'Δημητρίου Σ.',dept:'Εστιατόριο',since:'2019',leaves:'8',salary:'€780',score:'4.5'},
    {n:'Νικολάου Π.',dept:'Καθαριότητα',since:'2022',leaves:'12',salary:'€700',score:'4.6'},
];
function renderStaff(filter){
    const data = filter === 'all' ? staffData : staffData.filter(s => ({reception:'Υποδοχή',clean:'Καθαριότητα',restaurant:'Εστιατόριο'}[filter] === s.dept));
    document.getElementById('staff-body').innerHTML = data.map(s => `<tr><td>${s.n}</td><td>${s.dept}</td><td>Από ${s.since}</td><td>${s.leaves} ημ.</td><td>${s.salary}</td><td>⭐${s.score}</td><td><button class="btn btn-sm" onclick="triggerAction('Προβολή καρτέλας: ${s.n}', 'info')"><i class="ti ti-eye" aria-hidden="true"></i></button></td></tr>`).join('');
}
if(document.getElementById('staff-body')) renderStaff('all');

function stTab(f, el){
    document.querySelectorAll('#v-staff .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    renderStaff(f);
}

function resolveComplaint(btn) {
    const row = btn.closest('tr');
    row.cells[3].innerHTML = '<span class="pill p-g">Επιλύθηκε</span>';
    btn.textContent = 'Αρχείο';
    btn.classList.replace('btn-dark', 'btn');
    btn.onclick = () => archiveComplaint(btn);
    showToast("Το παράπονο επισημάνθηκε ως επιλυμένο.", "success");
}

function archiveComplaint(btn) {
    const row = btn.closest('tr');
    row.style.opacity = '0';
    setTimeout(() => { row.remove(); showToast("Το παράπονο μεταφέρθηκε στο αρχείο.", "info"); }, 300);
}


/* ==============================================================
   ΚΟΥΜΠΙΑ: ΕΣΤΙΑΤΟΡΙΟ (ΠΑΡΑΓΓΕΛΙΕΣ)
   ============================================================== */
function placeOrder(btn, itemName) {
    btn.disabled = true;
    btn.textContent = "Παραγγέλθηκε";
    btn.classList.replace('btn-dark', 'btn');
    
    const statusCell = btn.parentElement.previousElementSibling;
    statusCell.innerHTML = '<span class="pill p-b">Αναμένεται</span>';
    
    showToast(`Στάλθηκε αυτόματη παραγγελία στον προμηθευτή για: ${itemName}`, "success");
}


/* ==============================================================
   ΚΟΥΜΠΙΑ: ΕΝΟΙΚΙΑΖΟΜΕΝΑ (ΝΟΜΙΚΕΣ ΕΙΔΟΠΟΙΗΣΕΙΣ)
   ============================================================== */
function sendNotice(btn, type) {
    btn.disabled = true;
    if(type === 'legal') {
        btn.textContent = "Εστάλη Εξώδικο";
        showToast("Το εξώδικο έχει σταλεί μέσω email στον νομικό σύμβουλο.", "warning");
    } else {
        btn.textContent = "Εστάλη";
        showToast("Η φιλική υπενθύμιση εστάλη στον ενοικιαστή.", "success");
    }
}


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

document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => {
        if (el.dataset.v === 'revenue') setTimeout(buildRevChart, 50);
    });
});

