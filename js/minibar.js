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
function triggerAction(msg, type) { showToast(msg, type); }

/* ==============================================================
   LOGOUT
   ============================================================== */
function logoutMinibar() {
    showToast("Γίνεται αποσύνδεση... Καλή ξεκούραση.", "info");
    setTimeout(() => { window.location.href = "login.html"; }, 1500);
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
const prices = { water: 2.00, soda: 1.50, beer: 4.00, snack: 2.00 };

function calcTotal() {
    const qWater = parseInt(document.getElementById('qty-water').value) || 0;
    const qSoda = parseInt(document.getElementById('qty-soda').value) || 0;
    const qBeer = parseInt(document.getElementById('qty-beer').value) || 0;
    const qSnack = parseInt(document.getElementById('qty-snack').value) || 0;
    const total = (qWater * prices.water) + (qSoda * prices.soda) + (qBeer * prices.beer) + (qSnack * prices.snack);
    document.getElementById('mb-total-price').textContent = `€${total.toFixed(2)}`;
    return total;
}

function setRoomSelect(roomNum) {
    const sel = document.getElementById('mb-room');
    for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === roomNum) { sel.selectedIndex = i; break; }
    }
    document.getElementById('qty-water').value = 0;
    document.getElementById('qty-soda').value = 0;
    document.getElementById('qty-beer').value = 0;
    document.getElementById('qty-snack').value = 0;
    calcTotal();
}

let consumptionCount = 0;

/* ==============================================================
   SUPABASE — CACHED DATA
   ============================================================== */
let itemIdByName = {};

async function loadItemMap() {
    const { data } = await window.supabase.from('INVENTORY_ITEM').select('ItemID, Name');
    itemIdByName = {};
    (data || []).forEach(item => { itemIdByName[item.Name] = item.ItemID; });
    return data || [];
}

/* ==============================================================
   SUPABASE — DASHBOARD
   ============================================================== */
async function loadDashboard() {
    const supabase = window.supabase;
    const today = new Date().toISOString().split('T')[0];

    const [res1, res2, res3, res4] = await Promise.all([
        supabase.from('RESERVATION').select('ReservationID', { count: 'exact', head: true }).eq('Status', 'CheckedIn'),
        supabase.from('MINIBAR_CONSUMPTION').select('Charge'),
        supabase.from('RESERVATION').select('ReservationID', { count: 'exact', head: true }).eq('Status', 'CheckedIn').eq('CheckOutDate', today),
        supabase.from('INVENTORY_ITEM').select('*')
    ]);

    const roomsToCheck = res1.count || 0;
    const charges = res2.data || [];
    const todayCharges = charges.reduce((s, c) => s + (c.Charge || 0), 0);
    const urgentDepartures = res3.count || 0;
    const allItems = res4.data || [];
    const lowStockCount = allItems.filter(i => i.Quantity < i.MinThreshold).length;

    document.getElementById('stat-rooms').textContent = roomsToCheck;
    document.getElementById('stat-charges').textContent = `€${todayCharges.toFixed(2)}`;
    document.getElementById('stat-urgent').textContent = urgentDepartures;
    document.getElementById('stat-lowstock').textContent = lowStockCount;

    document.getElementById('urgent-count').textContent = urgentDepartures;
    document.getElementById('done-count').textContent = consumptionCount;

    // Urgent notifications
    const notifContainer = document.getElementById('urgent-notifications');
    notifContainer.innerHTML = '';

    if (urgentDepartures > 0) {
        const { data: urgentRes } = await supabase
            .from('RESERVATION')
            .select('ReservationID, CheckOutDate, RESERVATION_ROOM(RoomNumber), CUSTOMER(FirstName, LastName)')
            .eq('Status', 'CheckedIn')
            .eq('CheckOutDate', today);
        (urgentRes || []).forEach(res => {
            const room = res.RESERVATION_ROOM?.[0]?.RoomNumber || '—';
            const guest = [
                res.CUSTOMER?.FirstName || '',
                res.CUSTOMER?.LastName || ''
            ].filter(Boolean).join(' ').trim() || '—';
            const div = document.createElement('div');
            div.className = 'ns ns-e';
            div.style.cursor = 'pointer';
            div.title = 'Κλικ για αντιγραφή στο πρόχειρο';
            div.innerHTML = `<i class="ti ti-alert-triangle" aria-hidden="true"></i><div><strong>ΕΠΕΙΓΟΝ — ${room} (${guest}):</strong> Ο πελάτης αναχωρεί σήμερα. Ελέγξτε το mini-bar ΑΜΕΣΑ.</div>`;
            div.addEventListener('click', () => {
                navigator.clipboard.writeText(div.textContent.trim())
                    .then(() => showToast('Αντιγράφηκε στο πρόχειρο', 'info'))
                    .catch(() => showToast('Αποτυχία αντιγραφής', 'error'));
            });
            notifContainer.appendChild(div);
        });
    }

    // Priority list
    const priorityBody = document.getElementById('priority-list');
    priorityBody.innerHTML = '';

    const { data: checkedIn } = await supabase
        .from('RESERVATION')
        .select('ReservationID, CheckInDate, CheckOutDate, RESERVATION_ROOM(RoomNumber), CUSTOMER(FirstName, LastName)')
        .eq('Status', 'CheckedIn')
        .order('CheckOutDate', { ascending: true });

    (checkedIn || []).forEach(res => {
        const room = res.RESERVATION_ROOM?.[0]?.RoomNumber || '—';
        const guest = [
            res.CUSTOMER?.FirstName || '',
            res.CUSTOMER?.LastName || ''
        ].filter(Boolean).join(' ').trim() || '—';
        const checkout = res.CheckOutDate;
        const isUrgent = checkout === today;

        const tr = document.createElement('tr');
        if (isUrgent) tr.style.background = '#FFF8F8';
        tr.innerHTML = `
            <td><strong>${room}</strong></td>
            <td><span class="pill ${isUrgent ? 'p-r' : 'p-b'}">${isUrgent ? 'Άμεσο Check-out' : 'Παραμονή'}</span></td>
            <td>${isUrgent ? 'Αναχώρηση σήμερα' : 'Καθημερινή Ρουτίνα'}</td>
            <td><button class="btn btn-sm ${isUrgent ? 'btn-dark' : ''}" onclick="navTo('consumption'); setRoomSelect('${room}')">Έλεγχος</button></td>
        `;
        priorityBody.appendChild(tr);
    });
}

/* ==============================================================
   SUPABASE — ROOM SELECT
   ============================================================== */
async function loadRoomSelect() {
    const supabase = window.supabase;
    const { data: reservations } = await supabase
        .from('RESERVATION')
        .select('ReservationID, CheckInDate, CheckOutDate, CustomerID')
        .eq('Status', 'CheckedIn');

    if (!reservations || reservations.length === 0) return;

    const ids = reservations.map(r => r.ReservationID);
    const custIds = [...new Set(reservations.map(r => r.CustomerID))];

    const [{ data: resRooms }, { data: customers }] = await Promise.all([
        supabase.from('RESERVATION_ROOM').select('ReservationID, RoomNumber').in('ReservationID', ids),
        supabase.from('CUSTOMER').select('CustomerID, FirstName, LastName').in('CustomerID', custIds)
    ]);

    const roomByRes = {};
    (resRooms || []).forEach(rr => { roomByRes[rr.ReservationID] = rr.RoomNumber; });

    const custByID = {};
    (customers || []).forEach(c => {
        custByID[c.CustomerID] = [c.FirstName || '', c.LastName || ''].filter(Boolean).join(' ').trim();
    });

    const sel = document.getElementById('mb-room');
    sel.innerHTML = '<option value="">Επιλέξτε Δωμάτιο προς έλεγχο...</option>';

    reservations.forEach(res => {
        const room = roomByRes[res.ReservationID];
        if (!room) return;
        const guest = custByID[res.CustomerID] || '';
        const opt = document.createElement('option');
        opt.value = room;
        opt.dataset.rid = res.ReservationID;
        opt.textContent = guest ? `${room} — ${guest}` : room;
        sel.appendChild(opt);
    });
}

/* ==============================================================
   SUPABASE — STOCK
   ============================================================== */
async function loadStock() {
    const supabase = window.supabase;
    const { data: items } = await supabase.from('INVENTORY_ITEM').select('*').order('Name');

    const tbody = document.getElementById('stock-list');
    tbody.innerHTML = '';

    (items || []).forEach(item => {
        const status = item.Quantity <= 0 ? 'Εξαντλημένο' :
                       item.Quantity < item.MinThreshold ? 'Κάτω από όριο' :
                       item.Quantity === item.MinThreshold ? 'Οριακά' : 'OK';

        const pillClass = item.Quantity <= 0 ? 'p-r' :
                          item.Quantity < item.MinThreshold ? 'p-r' :
                          item.Quantity === item.MinThreshold ? 'p-a' : 'p-g';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.Name}</td>
            <td>${item.Quantity} τεμ.</td>
            <td>${item.MinThreshold}</td>
            <td><span class="pill ${pillClass}">${status}</span></td>
            <td>${item.Quantity < item.MinThreshold ? '<button class="btn btn-sm btn-warn" onclick="requestRestock(this)">Αίτημα</button>' : '—'}</td>
        `;
        tbody.appendChild(tr);
    });
}

/* ==============================================================
   SUPABASE — HISTORY
   ============================================================== */
async function loadHistory() {
    const supabase = window.supabase;
    const { data: records } = await supabase
        .from('MINIBAR_CONSUMPTION')
        .select('ConsumptionID, Quantity, Charge, ReservationID, INVENTORY_ITEM(Name)')
        .order('ConsumptionID', { ascending: false })
        .limit(50);

    if (!records || records.length === 0) return;

    const resIds = [...new Set(records.map(r => r.ReservationID))];

    const [{ data: resRooms }, { data: reservations }] = await Promise.all([
        supabase.from('RESERVATION_ROOM').select('ReservationID, RoomNumber').in('ReservationID', resIds),
        supabase.from('RESERVATION').select('ReservationID, CustomerID').in('ReservationID', resIds),
    ]);

    const roomByRes = {};
    (resRooms || []).forEach(rr => { roomByRes[rr.ReservationID] = rr.RoomNumber; });

    const tbody = document.getElementById('history-list');
    tbody.innerHTML = '';

    records.forEach(rec => {
        const room = roomByRes[rec.ReservationID] || '—';
        const itemName = rec.INVENTORY_ITEM?.Name || '—';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${rec.ConsumptionID}</td>
            <td>${room}</td>
            <td>${rec.Quantity}× ${itemName}</td>
            <td>€${(rec.Charge || 0).toFixed(2)}</td>
            <td><span class="pill p-g">Στάλθηκε</span></td>
        `;
        tbody.appendChild(tr);
    });

    consumptionCount = records.length;
    document.getElementById('done-count').textContent = consumptionCount;
}

/* ==============================================================
   SUPABASE — RECENT LOGS (dashboard)
   ============================================================== */
async function loadRecentLogs() {
    const supabase = window.supabase;
    const { data: records } = await supabase
        .from('MINIBAR_CONSUMPTION')
        .select('ConsumptionID, Quantity, Charge, ReservationID, INVENTORY_ITEM(Name)')
        .order('ConsumptionID', { ascending: false })
        .limit(4);

    if (!records || records.length === 0) return;

    const resIds = [...new Set(records.map(r => r.ReservationID))];
    const { data: resRooms } = await supabase
        .from('RESERVATION_ROOM')
        .select('ReservationID, RoomNumber')
        .in('ReservationID', resIds);

    const roomByRes = {};
    (resRooms || []).forEach(rr => { roomByRes[rr.ReservationID] = rr.RoomNumber; });

    const container = document.getElementById('recent-logs');
    container.innerHTML = '';

    records.forEach(rec => {
        const room = roomByRes[rec.ReservationID] || '—';
        const itemName = rec.INVENTORY_ITEM?.Name || '—';
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;padding:8px;background:var(--color-background-secondary);border-radius:6px;';
        div.innerHTML = `
            <div><div style="font-weight:500;font-size:12px">${room}</div><div style="font-size:11px;color:var(--color-text-secondary)">${rec.Quantity}× ${itemName}</div></div>
            <div style="font-weight:500;color:#1D9E75">€${(rec.Charge || 0).toFixed(2)}</div>
        `;
        container.appendChild(div);
    });
}

/* ==============================================================
   SUBMIT CONSUMPTION (ΑΠΟΘΗΚΕΥΣΗ ΣΤΟ DB)
   ============================================================== */
async function submitConsumption() {
    const supabase = window.supabase;
    const sel = document.getElementById('mb-room');
    const room = sel.value;
    if (!room) {
        showToast('Παρακαλώ επιλέξτε το δωμάτιο που ελέγξατε.', 'error');
        return;
    }
    const resId = parseInt(sel.options[sel.selectedIndex]?.dataset?.rid);
    if (!resId) {
        showToast('Σφάλμα: δεν βρέθηκε η κράτηση για αυτό το δωμάτιο.', 'error');
        return;
    }

    const qWater = parseInt(document.getElementById('qty-water').value) || 0;
    const qSoda = parseInt(document.getElementById('qty-soda').value) || 0;
    const qBeer = parseInt(document.getElementById('qty-beer').value) || 0;
    const qSnack = parseInt(document.getElementById('qty-snack').value) || 0;

    if (qWater + qSoda + qBeer + qSnack === 0) {
        showToast('Παρακαλώ συμπληρώστε τουλάχιστον ένα προϊόν.', 'error');
        return;
    }

    // Build product groups
    const productGroups = [
        { qty: qWater, price: prices.water, itemName: 'Νερό Εμφιαλωμένο (500ml)' },
        { qty: qSoda, price: prices.soda, itemName: 'Coca-Cola / Sprite' },
        { qty: qBeer, price: prices.beer, itemName: 'Μπύρα (Κουτάκι 330ml)' },
        { qty: qSnack, price: prices.snack, itemName: 'Σοκολάτες' }
    ];

    const results = [];
    for (const group of productGroups) {
        if (group.qty === 0) continue;
        const itemId = itemIdByName[group.itemName];
        if (!itemId) {
            showToast(`Προσοχή: το προϊόν "${group.itemName}" δεν βρέθηκε στη βάση.`, 'warning');
            continue;
        }
        results.push({ itemId, qty: group.qty, charge: group.qty * group.price, itemName: group.itemName });
    }

    if (results.length === 0) {
        showToast('Δεν βρέθηκαν αντιστοιχίσεις προϊόντων στη βάση.', 'error');
        return;
    }

    // Insert consumption records + decrement inventory
    let successCount = 0;
    for (const r of results) {
        const { error: insertErr } = await supabase
            .from('MINIBAR_CONSUMPTION')
            .insert([{ ReservationID: resId, ItemID: r.itemId, Quantity: r.qty, Charge: r.charge }]);

        if (insertErr) {
            showToast(`Σφάλμα καταχώρησης ${r.itemName}: ${insertErr.message}`, 'error');
            continue;
        }

        // Decrement inventory
        const { data: inv } = await supabase
            .from('INVENTORY_ITEM')
            .select('Quantity')
            .eq('ItemID', r.itemId)
            .single();

        if (inv) {
            await supabase
                .from('INVENTORY_ITEM')
                .update({ Quantity: Math.max(0, inv.Quantity - r.qty) })
                .eq('ItemID', r.itemId);
        }

        successCount++;
    }

    if (successCount > 0) {
        showToast(`Επιτυχία! Το ${room} ενημερώθηκε (${successCount} προϊόντα).`, 'success');
        setRoomSelect('');
        refreshAll();
    }
}

/* ==============================================================
   REFRESH ALL DATA
   ============================================================== */
async function refreshAll() {
    await Promise.all([
        loadDashboard(),
        loadStock(),
        loadHistory(),
        loadRecentLogs()
    ]);
}

/* ==============================================================
   ΑΠΟΘΗΚΗ / ΑΝΕΦΟΔΙΑΣΜΟΣ
   ============================================================== */
async function requestRestock(btn) {
    const tr = btn.closest('tr');
    const itemName = tr?.querySelector('td')?.textContent?.trim();
    if (itemName) {
        const itemId = itemIdByName[itemName];
        if (itemId) {
            try {
                await window.supabase.from('NOTIFICATION').insert([{
                    TargetRole: 'both',
                    Type: 'restock',
                    Message: `Αίτημα ανεφοδιασμού: ${itemName}`,
                    ItemID: itemId
                }]);
            } catch (err) {
                showToast('Σφάλμα αποστολής ειδοποίησης.', 'error');
            }
        }
    }
    btn.disabled = true;
    btn.textContent = "Στάλθηκε";
    btn.classList.replace('btn-warn', 'btn');
    const statusCell = btn.parentElement.previousElementSibling;
    statusCell.innerHTML = '<span class="pill p-b">Σε αναμονή</span>';
    showToast("Το αίτημα ανεφοδιασμού στάλθηκε στον διαχειριστή και τον διευθυντή.", "info");
}

/* ==============================================================
   INIT
   ============================================================== */
document.addEventListener('DOMContentLoaded', async function initPage() {
    try {
        await loadItemMap();
        await Promise.all([
            loadRoomSelect(),
            loadDashboard(),
            loadStock(),
            loadHistory(),
            loadRecentLogs()
        ]);
    } catch (err) {
        showToast('Σφάλμα φόρτωσης δεδομένων: ' + (err.message || err), 'error');
    }
});
