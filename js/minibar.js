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

function triggerAction(msg, type) {
    showToast(msg, type);
}

/* ==============================================================
   LOGOUT
   ============================================================== */
function logoutMinibar() {
    showToast("Γίνεται αποσύνδεση... Καλή ξεκούραση.", "info");
    setTimeout(() => {
        window.location.href = "login.html"; 
    }, 1500);
}

/* ==============================================================
   NAVIGATION & LIVE TIME
   ============================================================== */
const viewTitles = {
    overview: 'Επισκόπηση Βάρδιας', 
    consumption: 'Καταχώρηση Κατανάλωσης (Mini-bar)', 
    stock: 'Αποθεματικό Καροτσιού / Αποθήκης',
    history: 'Ιστορικό Χρεώσεων'
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
    document.getElementById('live-time').innerHTML = now.toLocaleDateString('el-GR', options);
}
setInterval(updateLiveTime, 60000);
updateLiveTime();

/* ==============================================================
   ΛΟΓΙΚΗ ΚΑΤΑΧΩΡΗΣΗΣ ΚΑΤΑΝΑΛΩΣΗΣ (MINI-BAR)
   ============================================================== */
// Τιμές Προϊόντων
const prices = {
    water: 2.00,
    soda: 1.50,
    beer: 4.00,
    snack: 2.00
};

// Υπολογισμός Συνολικού Ποσού live
function calcTotal() {
    const qWater = parseInt(document.getElementById('qty-water').value) || 0;
    const qSoda = parseInt(document.getElementById('qty-soda').value) || 0;
    const qBeer = parseInt(document.getElementById('qty-beer').value) || 0;
    const qSnack = parseInt(document.getElementById('qty-snack').value) || 0;

    const total = (qWater * prices.water) + (qSoda * prices.soda) + (qBeer * prices.beer) + (qSnack * prices.snack);
    
    document.getElementById('mb-total-price').textContent = `€${total.toFixed(2)}`;
    return total;
}

// Βοηθητική συνάρτηση για επιλογή δωματίου από το Dashboard
function setRoomSelect(roomNum) {
    document.getElementById('mb-room').value = roomNum;
    // Μηδενισμός ποσοτήτων
    document.getElementById('qty-water').value = 0;
    document.getElementById('qty-soda').value = 0;
    document.getElementById('qty-beer').value = 0;
    document.getElementById('qty-snack').value = 0;
    calcTotal();
}

let doneCount = 14;

// Αποστολή Φόρμας
function submitConsumption() {
    const room = document.getElementById('mb-room').value;
    if (!room) {
        showToast('Παρακαλώ επιλέξτε το δωμάτιο που ελέγξατε.', 'error');
        return;
    }

    const qWater = parseInt(document.getElementById('qty-water').value) || 0;
    const qSoda = parseInt(document.getElementById('qty-soda').value) || 0;
    const qBeer = parseInt(document.getElementById('qty-beer').value) || 0;
    const qSnack = parseInt(document.getElementById('qty-snack').value) || 0;
    const total = calcTotal();

    let itemsConsumed = [];
    if (qWater > 0) itemsConsumed.push(`${qWater}× Νερό`);
    if (qSoda > 0) itemsConsumed.push(`${qSoda}× Αναψυκτικό`);
    if (qBeer > 0) itemsConsumed.push(`${qBeer}× Αλκοόλ`);
    if (qSnack > 0) itemsConsumed.push(`${qSnack}× Σνακ`);

    let itemsString = itemsConsumed.length > 0 ? itemsConsumed.join(', ') : 'Καμία κατανάλωση';

    // Ενημέρωση UI & Προσθήκη στο Ιστορικό
    doneCount++;
    document.getElementById('done-count').textContent = doneCount;
    
    // Αν ήταν το M-205, μειώνουμε τα επείγοντα
    if (room === 'Μ-205') {
        const urgCount = document.getElementById('urgent-count');
        urgCount.textContent = Math.max(0, parseInt(urgCount.textContent) - 1);
    }

    addToHistory(room, itemsString, total);
    
    showToast(`Επιτυχία! Το ${room} ενημερώθηκε και τα δεδομένα στάλθηκαν στη ρεσεψιόν.`, 'success');

    // Καθαρισμός Φόρμας
    setRoomSelect('');
}

// Προσθήκη στο ιστορικό
function addToHistory(room, items, total) {
    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    
    // Προσθήκη στον πίνακα του Tab "Ιστορικό"
    const tbody = document.querySelector('#history-table tbody');
    if (tbody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${time}</td><td>${room}</td><td>${items}</td><td>€${total.toFixed(2)}</td><td><span class="pill p-g">Στάλθηκε</span></td>`;
        tbody.insertBefore(tr, tbody.firstChild);
    }

    // Προσθήκη στα "Πρόσφατα" του Dashboard
    const recentDiv = document.getElementById('recent-logs');
    if (recentDiv) {
        const logHtml = `
          <div style="display:flex;justify-content:space-between;padding:8px;background:var(--color-background-secondary);border-radius:6px;">
            <div><div style="font-weight:500;font-size:12px">${room}</div><div style="font-size:11px;color:var(--color-text-secondary)">${items}</div></div>
            <div style="font-weight:500; ${total > 0 ? 'color:#1D9E75' : 'color:var(--color-text-secondary)'}">€${total.toFixed(2)}</div>
          </div>`;
        recentDiv.insertAdjacentHTML('afterbegin', logHtml);
        
        // Κρατάμε μόνο τα 4 τελευταία στο dashboard
        if(recentDiv.children.length > 4) recentDiv.lastElementChild.remove();
    }
}

/* ==============================================================
   ΑΠΟΘΗΚΗ / ΑΝΕΦΟΔΙΑΣΜΟΣ
   ============================================================== */
function requestRestock(btn) {
    btn.disabled = true;
    btn.textContent = "Στάλθηκε";
    btn.classList.replace('btn-warn', 'btn');
    
    // Αλλάζουμε την ετικέτα κατάστασης σε "Αναμονή"
    const statusCell = btn.parentElement.previousElementSibling;
    statusCell.innerHTML = '<span class="pill p-b">Σε αναμονή</span>';
    
    showToast("Το αίτημα ανεφοδιασμού στάλθηκε στην κεντρική αποθήκη του εστιατορίου.", "info");
}