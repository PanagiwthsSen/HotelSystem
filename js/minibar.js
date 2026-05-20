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
    localStorage.removeItem('hotel_user');
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
function getItemPrice(name) {
    if (name.includes('Νερό') || name.includes('Water')) return 2.00;
    if (name.includes('Coca') || name.includes('Sprite') || name.includes('Αναψυκτικό')) return 1.50;
    if (name.includes('Μπύρα') || name.includes('Κρασί') || name.includes('Wine') || name.includes('Αλκοόλ')) return 4.00;
    if (name.includes('Σοκολάτες') || name.includes('Σνακ') || name.includes('Snack') || name.includes('Ξηροί')) return 2.00;
    return 2.00;
}

function refreshTotal() {
    let total = 0;
    document.querySelectorAll('#consumption-items .qty').forEach(inp => {
        const qty = parseInt(inp.value) || 0;
        const price = parseFloat(inp.dataset.price) || 0;
        total += qty * price;
    });
    document.getElementById('mb-total-price').textContent = `€${total.toFixed(2)}`;
    return total;
}

function setRoomSelect(roomNum) {
    document.getElementById('mb-room').value = roomNum;
    document.querySelectorAll('#consumption-items .qty').forEach(inp => inp.value = 0);
    refreshTotal();
}

let consumptionCount = 0;

/* ==============================================================
   SUPABASE — CACHED DATA
   ============================================================== */
let inventoryItems = {};

async function loadItemMap() {
    const { data } = await window.supabase.from('INVENTORY_ITEM').select('*');
    inventoryItems = {};
    (data || []).forEach(item => { inventoryItems[item.Name] = item; });
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
   SUPABASE — ROOM DATALIST + LOOKUP
   ============================================================== */
const roomData = {};

async function loadRoomSelect() {
    const supabase = window.supabase;
    const { data: reservations } = await supabase
        .from('RESERVATION')
        .select('ReservationID, CheckInDate, CheckOutDate, CustomerID')
        .eq('Status', 'CheckedIn');

    const list = document.getElementById('room-list');
    list.innerHTML = '';
    Object.keys(roomData).forEach(k => delete roomData[k]);

    if (!reservations || reservations.length === 0) return;

    const ids = reservations.map(r => r.ReservationID);
    const custIds = [...new Set(reservations.map(r => r.CustomerID))];

    const [{ data: resRooms }, { data: customers }] = await Promise.all([
        supabase.from('RESERVATION_ROOM').select('ReservationID, RoomNumber').in('ReservationID', ids),
        supabase.from('CUSTOMER').select('CustomerID, FirstName, LastName').in('CustomerID', custIds)
    ]);

    const custByID = {};
    (customers || []).forEach(c => {
        custByID[c.CustomerID] = [c.FirstName || '', c.LastName || ''].filter(Boolean).join(' ').trim();
    });

    (resRooms || []).forEach(rr => {
        const res = reservations.find(r => r.ReservationID === rr.ReservationID);
        if (!res) return;
        const guest = custByID[res.CustomerID] || '';
        roomData[rr.RoomNumber] = { reservationId: rr.ReservationID, guest };
        const opt = document.createElement('option');
        opt.value = rr.RoomNumber;
        opt.label = guest ? `${rr.RoomNumber} — ${guest}` : rr.RoomNumber;
        list.appendChild(opt);
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
   LIVE ROOM RESOLUTION (ενεργός ή τελευταίος πελάτης)
   ============================================================== */
async function resolveRoomReservation(roomNum) {
    const supabase = window.supabase;
    const { data: rr } = await supabase
        .from('RESERVATION_ROOM')
        .select('ReservationID')
        .eq('RoomNumber', roomNum);
    if (!rr || rr.length === 0) return null;
    const ids = rr.map(r => r.ReservationID);
    const { data: active } = await supabase
        .from('RESERVATION')
        .select('ReservationID')
        .in('ReservationID', ids)
        .eq('Status', 'CheckedIn')
        .limit(1);
    if (active && active.length > 0) return { reservationId: active[0].ReservationID, isActive: true };
    return { reservationId: ids[ids.length - 1], isActive: false };
}

/* ==============================================================
   ΔΥΝΑΜΙΚΗ ΦΟΡΜΑ ΠΡΟΪΟΝΤΩΝ (από INVENTORY_ITEM)
   ============================================================== */
async function loadConsumptionItems() {
    const container = document.getElementById('consumption-items');
    if (!container) return;
    const items = Object.values(inventoryItems);
    if (items.length === 0) return;

    container.innerHTML = items.map(item => {
        const price = getItemPrice(item.Name);
        const status = item.Quantity <= 0 ? 'Εξαντλήθηκε' :
                       item.Quantity <= item.MinThreshold ? 'Χαμηλό' : 'Απόθεμα';
        const statusColor = item.Quantity <= 0 ? '#E24B4A' :
                            item.Quantity <= item.MinThreshold ? '#EF9F27' : 'var(--color-text-secondary)';
        return `
            <div class="consumption-row">
                <span class="item-name">${item.Name}</span>
                <span class="item-stock" style="color:${statusColor}">${status}: ${item.Quantity}</span>
                <span class="item-price">€${price.toFixed(2)}</span>
                <input type="number" class="qty" min="0" value="0"
                    data-item-id="${item.ItemID}" data-price="${price}"
                    oninput="refreshTotal()" onclick="this.select()"
                    ${item.Quantity <= 0 ? 'disabled' : ''}>
            </div>
        `;
    }).join('');
    refreshTotal();
}

/* ==============================================================
   SUBMIT CONSUMPTION (ΑΠΟΘΗΚΕΥΣΗ ΣΤΟ DB)
   ============================================================== */
async function submitConsumption() {
    const supabase = window.supabase;
    const room = document.getElementById('mb-room').value.trim();
    if (!room) {
        showToast('Παρακαλώ συμπληρώστε τον αριθμό δωματίου.', 'error');
        return;
    }

    // Resolve reservation — live: active CheckedIn first, else last guest
    const resolved = await resolveRoomReservation(room);
    if (!resolved) {
        showToast(`Το δωμάτιο ${room} δεν βρέθηκε σε καμία κράτηση.`, 'error');
        return;
    }
    const resId = resolved.reservationId;
    if (!resolved.isActive) {
        showToast(`Το δωμάτιο ${room} δεν έχει ενεργό πελάτη. Η χρέωση γίνεται στον τελευταίο πελάτη.`, 'warning');
    }

    // Collect items with quantity > 0
    const items = [];
    document.querySelectorAll('#consumption-items .qty').forEach(inp => {
        const qty = parseInt(inp.value) || 0;
        if (qty === 0) return;
        const itemId = parseInt(inp.dataset.itemId);
        const price = parseFloat(inp.dataset.price);
        const name = inp.closest('.consumption-row')?.querySelector('.item-name')?.textContent?.trim() || '—';
        items.push({ itemId, qty, charge: qty * price, name });
    });

    if (items.length === 0) {
        showToast('Παρακαλώ συμπληρώστε ποσότητα σε τουλάχιστον ένα προϊόν.', 'error');
        return;
    }

    // Insert consumption + decrement + auto-notify
    let successCount = 0;
    for (const item of items) {
        const { error: insertErr } = await supabase
            .from('MINIBAR_CONSUMPTION')
            .insert({ ReservationID: resId, ItemID: item.itemId, Quantity: item.qty, Charge: item.charge });

        if (insertErr) {
            showToast(`Σφάλμα καταχώρησης: ${insertErr.message}`, 'error');
            continue;
        }

        const invItem = await supabase
            .from('INVENTORY_ITEM')
            .select('Quantity, MinThreshold')
            .eq('ItemID', item.itemId)
            .single();

        if (invItem.data) {
            const newQty = Math.max(0, invItem.data.Quantity - item.qty);
            await supabase
                .from('INVENTORY_ITEM')
                .update({ Quantity: newQty })
                .eq('ItemID', item.itemId);

            // Auto-notify when stock exhausted or below threshold
            if (newQty === 0) {
                supabase.from('NOTIFICATION').insert({
                    TargetRole: 'both',
                    Type: 'out_of_stock',
                    Message: `Το ${item.name} έχει ΕΞΑΝΤΛΗΘΕΙ πλήρως`,
                    ItemID: item.itemId
                }).then();
            } else if (newQty <= invItem.data.MinThreshold) {
                supabase.from('NOTIFICATION').insert({
                    TargetRole: 'both',
                    Type: 'restock',
                    Message: `Το ${item.name} έχει πέσει κάτω από το ελάχιστο όριο (${newQty}/${invItem.data.MinThreshold})`,
                    ItemID: item.itemId
                }).then();
            }
        }

        successCount++;
    }

    if (successCount > 0) {
        showToast(`Επιτυχία! Το ${room} ενημερώθηκε (${successCount} προϊόντα).`, 'success');
        setRoomSelect('');
        await loadItemMap();
        await loadConsumptionItems();
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
        loadRecentLogs(),
        loadConsumptionItems()
    ]);
}

/* ==============================================================
   ΑΠΟΘΗΚΗ / ΑΝΕΦΟΔΙΑΣΜΟΣ
   ============================================================== */
async function requestRestock(btn) {
    const tr = btn.closest('tr');
    const itemName = tr?.querySelector('td')?.textContent?.trim();
    if (itemName) {
        const item = inventoryItems[itemName];
        if (item) {
            try {
                await window.supabase.from('NOTIFICATION').insert({
                    TargetRole: 'both',
                    Type: 'restock',
                    Message: `Αίτημα ανεφοδιασμού: ${itemName}`,
                    ItemID: item.ItemID
                });
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
            loadRecentLogs(),
            loadConsumptionItems()
        ]);
    } catch (err) {
        showToast('Σφάλμα φόρτωσης δεδομένων: ' + (err.message || err), 'error');
    }
});
