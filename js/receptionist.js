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
   LOGOUT RECEPTIONIST
   ============================================================== */


/* ==============================================================
   NAVIGATION
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

/* ==============================================================
   LIVE TIME
   ============================================================== */
function updateLiveTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('live-time').innerHTML = now.toLocaleDateString('el-GR', options);
}
setInterval(updateLiveTime, 60000);
updateLiveTime();

/* ==============================================================
   ROOMS GENERATION & LIVE STATS
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
        let state = 'free'; // Άδειο χωρίς καθαριότητα
        if (r < 0.65) state = 'occ'; // Κατειλημμένο
        else if (r < 0.75) state = 'dirty'; // Προσεχώς άδειο / Υπό καθαρισμό
        else if (r < 0.85) state = 'clean'; // Έτοιμο για νέο πελάτη
        
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

    document.getElementById('live-occ-badge').textContent = `Πληρ. ${occPct}%`;
    document.getElementById('dash-occ-val').textContent = `${occPct}%`;
    document.getElementById('dash-occ-bar').style.width = `${occPct}%`;
    document.getElementById('dash-free-val').textContent = currentFree + currentClean;
    
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
        
        let sText = r.state === 'occ' ? 'Κατειλημμένο' : r.state === 'free' ? 'Άδειο χωρίς καθαριότητα' : r.state === 'dirty' ? 'Προσεχώς άδειο' : 'Έτοιμο';
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

renderMap();

/* ==============================================================
   BOOKING LOGIC
   ============================================================== */
const prepayMap = {
    phone: { txt: 'Τηλεφωνική/Κάρτα (20%)', pct: 20 },
    prepaid: { txt: 'Προπληρωμένη >90 ημέρες (50%)', pct: 50 },
    group: { txt: 'Ειδική Γκρουπ (15%)', pct: 15 },
    walkin: { txt: 'Walk-in (100% κατά την άφιξη)', pct: 100 }
};

function calcNights() {
    const i = document.getElementById('nb-in')?.value;
    const o = document.getElementById('nb-out')?.value;
    if(!i || !o) return 3;
    return Math.max(1, Math.round((new Date(o) - new Date(i)) / 86400000));
}

function updatePrice() {
    const price = parseInt(document.getElementById('nb-rtype')?.value || 140);
    const nights = calcNights();
    
    // Έλεγχος Z% (Έστω ότι η πληρότητα είναι μικρότερη του 60%)
    const occPct = Math.round((currentOcc / 510) * 100);
    let finalPrice = price;
    let dynNotice = "";
    if (occPct < 60) {
        finalPrice = Math.round(price * 0.85); // -15% έκπτωση
        dynNotice = "(-15% λόγω χαμηλής πληρότητας)";
    }
    
    const total = finalPrice * nights;
    
    const typeSelect = document.getElementById('nb-rtype');
    const typeText = typeSelect.options[typeSelect.selectedIndex].text;
    
    document.getElementById('sp-room').textContent = typeText;
    document.getElementById('sp-nights').textContent = nights;
    document.getElementById('sp-sub').textContent = `€${finalPrice} × ${nights}`;
    document.getElementById('dyn-price-notice').textContent = dynNotice;
    document.getElementById('sp-total').textContent = `€${total}`;
    
    updatePrepay(total);
}

function updatePrepay(totalVal) {
    const t = document.getElementById('nb-btype')?.value;
    if(!t) return;
    
    const total = totalVal || parseInt(document.getElementById('sp-total').textContent.replace('€',''));
    const config = prepayMap[t];
    const amt = Math.round(total * config.pct / 100);
    
    const box = document.getElementById('prepay-box');
    box.innerHTML = `<i class="ti ti-info-circle" aria-hidden="true"></i> Προκαταβολή: ${config.txt} — <strong id="prepay-amt">€${amt}</strong>`;
}

function submitBooking() {
    const last = document.getElementById('nb-last')?.value;
    if(!last) {
        showToast('Παρακαλώ συμπληρώστε τουλάχιστον το Επώνυμο.', 'error');
        return;
    }
    showToast('Η κράτηση καταχωρήθηκε επιτυχώς! Ο αριθμός δωματίου θα οριστεί το πρωί της άφιξης.', 'success');
}

if(document.getElementById('nb-rtype')) {
    updatePrice();
}

/* ==============================================================
   CHECK-IN / CHECK-OUT / MINIBAR ACTIONS
   ============================================================== */
function doCheckin(btn) {
    btn.disabled = true;
    btn.textContent = "Ολοκληρώθηκε";
    btn.classList.replace('btn-dark', 'btn');
    
    const statusCell = btn.parentElement.previousElementSibling;
    statusCell.innerHTML = '<span class="pill p-g">Check-in OK</span>';
    
    showToast('Το Check-in ολοκληρώθηκε και το δωμάτιο εκχωρήθηκε στον πελάτη.', 'success');
}

function doCheckout(btn, name) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-printer"></i> Απόδειξη';
    btn.classList.replace('btn-dark', 'btn');
    
    const statusCell = btn.parentElement.previousElementSibling;
    statusCell.innerHTML = '<span class="pill p-g">Εξοφλήθηκε</span>';
    
    showToast(`Επιτυχές Check-out για τον πελάτη: ${name}. Η απόδειξη εκτυπώνεται...`, 'success');
}

function chargeMinibar(btn) {
    btn.disabled = true;
    btn.textContent = "Χρεώθηκε";
    btn.classList.replace('btn-dark', 'btn');
    
    showToast('Το ποσό του Mini-bar προστέθηκε επιτυχώς στον λογαριασμό του πελάτη.', 'success');
}