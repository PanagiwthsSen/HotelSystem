import { supabase } from './supabase-config.js';
import { showToast, updateLiveTime } from './utils/ui.js';

const userData = localStorage.getItem('hotel_user');
if (!userData) { window.location.href = "/pages/login.html"; }

const hiddenTripIds = new Set();

let currentUser = null;
let todayTrips = [];
let allVehicles = [];
let myVehicle = null;
let localCompleted = new Set();

document.addEventListener("DOMContentLoaded", async () => {
    setTimeout(() => {
        const loader = document.getElementById("app-loader");
        if (loader) loader.style.display = "none";
        const app = document.querySelector(".app");
        if (app) app.style.display = "flex";
    }, 800);

    document.querySelectorAll('.sb-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.sb-item').forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
            item.classList.add('active');
            const targetView = item.getAttribute('data-v');
            const view = document.getElementById(`v-${targetView}`);
            if (view) view.classList.add('active');
            const tbTitle = document.getElementById('tb-title');
            if (tbTitle) tbTitle.innerText = item.innerText;
        });
    });

    await loadDriverData();

    window.addEventListener('beforeunload', () => {
        const user = JSON.parse(localStorage.getItem('hotel_user'));
        if (user && user.id) {
            fetch(import.meta.env.VITE_SUPABASE_URL + '/rest/v1/EMPLOYEE?EmpID=eq.' + user.id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_KEY, 'Authorization': 'Bearer ' + import.meta.env.VITE_SUPABASE_KEY },
                body: JSON.stringify({ IsLoggedIn: false }),
                keepalive: true
            });
        }
    });
});

async function loadDriverData() {
    const userData = localStorage.getItem('hotel_user');
    if (!userData) { window.location.href = "/pages/login.html"; return; }
    currentUser = JSON.parse(userData);

    const { error: statusErr } = await supabase.from('TRIP').select('Status').limit(0).maybeSingle();
    window._tripHasStatus = !statusErr;

    try {
        const { data: empData, error: empErr } = await supabase
            .from('EMPLOYEE')
            .select('*')
            .eq('EmpID', currentUser.id)
            .single();
        if (empErr) throw empErr;

        const initials = ((empData.FirstName?.[0] || '') + (empData.LastName?.[0] || '')).trim() || 'ΔΟ';
        const avCircle = document.querySelector('.av-circle');
        if (avCircle) avCircle.textContent = initials;
        const avName = document.querySelector('.av-name');
        if (avName) avName.textContent = `${empData.FirstName || ''} ${empData.LastName || ''}`.trim() || 'Οδηγός';

        const today = new Date().toISOString().split('T')[0];
        const { data: shiftData } = await supabase
            .from('SHIFT')
            .select('Hours')
            .eq('EmpID', currentUser.id)
            .eq('Date', today)
            .maybeSingle();
        const avShift = document.querySelector('.av-shift');
        if (avShift) {
            avShift.textContent = shiftData ? `${Math.floor(shiftData.Hours)}h βάρδια` : 'Σήμερα';
        }

        const tripSelect = window._tripHasStatus
            ? 'TripID, VehicleID, Date, Cost, Destination, Status, CUSTOMER(FirstName, LastName, IsGroup)'
            : 'TripID, VehicleID, Date, Cost, Destination, CUSTOMER(FirstName, LastName, IsGroup)';
        const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(); dayEnd.setHours(24, 0, 0, 0);
        const { data: trips, error: tripErr } = await supabase
            .from('TRIP')
            .select(tripSelect)
            .eq('DriverID', currentUser.id)
            .gte('Date', dayStart.toISOString())
            .order('Date', { ascending: false });

        const { data: pastPendingTrips } = await supabase
            .from('TRIP')
            .select(tripSelect)
            .eq('DriverID', currentUser.id)
            .eq('Status', 'pending')
            .lt('Date', dayStart.toISOString())
            .order('Date', { ascending: false });

        const allTrips = (trips || []).concat(pastPendingTrips || []);
        const seen = new Set();
        todayTrips = allTrips.filter(t => {
            if (seen.has(t.TripID)) return false;
            seen.add(t.TripID);
            return true;
        });
        todayTrips.sort((a, b) => new Date(b.Date) - new Date(a.Date));
        if (tripErr) throw tripErr;

        if (todayTrips.length > 0 && todayTrips[0].VehicleID) {
            const { data: veh } = await supabase
                .from('VEHICLE')
                .select('*')
                .eq('VehicleID', todayTrips[0].VehicleID)
                .maybeSingle();
            myVehicle = veh || null;
        }

        const { data: vehicles, error: vehErr } = await supabase
            .from('VEHICLE')
            .select('*')
            .order('VehicleID', { ascending: true });
        if (vehErr) throw vehErr;
        allVehicles = vehicles || [];

        populateFaultVehicleSelect();
        updateOverview();
        renderTrips();
        renderFleet();
        updateLiveTime();

    } catch (err) {
        console.error('Σφάλμα φόρτωσης δεδομένων:', err);
        showToast('Αποτυχία φόρτωσης δεδομένων: ' + err.message, 'error');
    }
}

setInterval(updateLiveTime, 60000);
setInterval(refreshTrips, 30000);

async function refreshTrips() {
    if (!currentUser) return;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const tripSelect = window._tripHasStatus
        ? 'TripID, VehicleID, Date, Cost, Destination, Status, CUSTOMER(FirstName, LastName, IsGroup)'
        : 'TripID, VehicleID, Date, Cost, Destination, CUSTOMER(FirstName, LastName, IsGroup)';

    const { data: trips } = await supabase
        .from('TRIP')
        .select(tripSelect)
        .eq('DriverID', currentUser.id)
        .gte('Date', dayStart.toISOString())
        .order('Date', { ascending: false });

    const { data: pastPending } = await supabase
        .from('TRIP')
        .select(tripSelect)
        .eq('DriverID', currentUser.id)
        .eq('Status', 'pending')
        .lt('Date', dayStart.toISOString())
        .order('Date', { ascending: false });

    const allTrips = (trips || []).concat(pastPending || []);
    const seen = new Set();
    const merged = allTrips.filter(t => {
        if (seen.has(t.TripID)) return false;
        seen.add(t.TripID);
        return true;
    });
    merged.sort((a, b) => new Date(b.Date) - new Date(a.Date));

    const changed = JSON.stringify(merged.map(t => t.TripID + ':' + t.Status)) !==
                    JSON.stringify(todayTrips.map(t => t.TripID + ':' + t.Status));
    if (changed) {
        todayTrips = merged;
        updateOverview();
        renderTrips();
    }
}

function updateOverview() {
    const visible = todayTrips.filter(t => !hiddenTripIds.has(t.TripID));
    const completedCount = window._tripHasStatus
        ? visible.filter(t => t.Status === 'completed').length
        : localCompleted.size;
    const tripCount = visible.length;
    const pendingCount = tripCount - completedCount;

    const elTripCount = document.getElementById('stat-trip-count');
    if (elTripCount) elTripCount.textContent = tripCount;
    const elTripSub = document.getElementById('stat-trip-sub');
    if (elTripSub) elTripSub.textContent = `${pendingCount} Εκκρεμούν`;

    const pendingTrips = visible.filter(t => t.Status !== 'completed');
    const elNextPickup = document.getElementById('stat-next-pickup');
    const elNextSub = document.getElementById('stat-next-sub');
    if (pendingTrips.length > 0) {
        const next = pendingTrips[0];
        const time = next.Date ? new Date(next.Date).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        if (elNextPickup) elNextPickup.textContent = time;
        if (elNextSub) elNextSub.textContent = next.Destination || '—';
    } else if (tripCount > 0) {
        if (elNextPickup) elNextPickup.textContent = '—';
        if (elNextSub) elNextSub.textContent = 'Όλες ολοκληρώθηκαν';
    } else {
        if (elNextPickup) elNextPickup.textContent = '—';
        if (elNextSub) elNextSub.textContent = 'Δεν υπάρχουν διαδρομές';
    }

    const elVehStatus = document.getElementById('stat-vehicle-status');
    const elVehSub = document.getElementById('stat-vehicle-sub');
    if (myVehicle) {
        const statusLabels = { available: 'Διαθέσιμο', in_use: 'Σε χρήση', maintenance: 'Συντήρηση' };
        if (elVehStatus) {
            elVehStatus.textContent = statusLabels[myVehicle.Status] || myVehicle.Status;
            elVehStatus.style.color = myVehicle.Status === 'available' ? '#1D9E75' : myVehicle.Status === 'in_use' ? '#378ADD' : '#DC2626';
        }
        if (elVehSub) elVehSub.textContent = `${myVehicle.Type || 'Όχημα'} (${myVehicle.PlateNumber || '—'})`;
    } else {
        if (elVehStatus) { elVehStatus.textContent = '—'; elVehStatus.style.color = ''; }
        if (elVehSub) elVehSub.textContent = 'Δεν έχει οριστεί';
    }

    const elBadgeCompleted = document.getElementById('badge-completed');
    if (elBadgeCompleted) elBadgeCompleted.textContent = `Ολοκλ. ${completedCount}/${tripCount}`;
    const elBadgeNext = document.getElementById('badge-next');
    if (elBadgeNext) {
        if (pendingTrips.length > 0) {
            const t = pendingTrips[0].Date ? new Date(pendingTrips[0].Date).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : '—';
            elBadgeNext.textContent = `Επόμενο: ${t}`;
        } else {
            elBadgeNext.textContent = tripCount > 0 ? 'Ολοκλήρωση' : '—';
        }
    }

    const elFuel = document.getElementById('stat-fuel');
    const elFuelSub = document.getElementById('stat-fuel-sub');
    if (elFuel) elFuel.textContent = '—';
    if (elFuelSub) elFuelSub.textContent = 'Μη διαθέσιμο';

    const nextCard = document.getElementById('next-trip-card');
    if (!nextCard) return;
    if (pendingTrips.length > 0) {
        const next = pendingTrips[0];
        const cust = next.CUSTOMER || {};
        const customerName = `${cust.FirstName || ''} ${cust.LastName || ''}`.trim() || 'Επισκέπτης';
        const time = next.Date ? new Date(next.Date).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const groupLabel = cust.IsGroup ? '(Group)' : '';
        nextCard.style.display = 'flex';
        nextCard.innerHTML = `
            <div class="room-num"><i class="ti ti-steering-wheel"></i></div>
            <div class="room-info">
                <div style="font-weight:600;font-size:14px">${next.Destination || 'Μεταφορά'}</div>
                <div class="room-type">${time} — ${customerName} ${groupLabel}</div>
            </div>
            <button class="btn btn-dark" onclick="window.navTo('schedule')">Λεπτομέρειες</button>`;
    } else if (tripCount > 0) {
        nextCard.style.display = 'flex';
        nextCard.innerHTML = `
            <div class="room-num"><i class="ti ti-circle-check" style="color:#1D9E75"></i></div>
            <div class="room-info">
                <div style="font-weight:600;font-size:14px">Όλες οι διαδρομές ολοκληρώθηκαν</div>
            </div>`;
    } else {
        nextCard.style.display = 'none';
    }
}

function renderTrips() {
    const container = document.getElementById('trip-list');
    if (!container) return;
    const visible = todayTrips.filter(t => !hiddenTripIds.has(t.TripID));

    if (visible.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Δεν υπάρχουν προγραμματισμένες διαδρομές για σήμερα.</div>';
        const badge = document.getElementById('badge-trips');
        if (badge) badge.style.display = 'none';
        renderHiddenBanner(container);
        return;
    }

    const isPersisted = window._tripHasStatus;
    const pendingCount = isPersisted
        ? visible.filter(t => t.Status !== 'completed').length
        : visible.length - localCompleted.size;
    const badge = document.getElementById('badge-trips');
    if (badge) { badge.textContent = pendingCount; badge.style.display = ''; }

    let lastCompletedIndex = -1;
    for (let i = 0; i < visible.length; i++) {
        const done = isPersisted ? visible[i].Status === 'completed' : localCompleted.has(i);
        if (done) lastCompletedIndex = i;
        else break;
    }

    container.innerHTML = visible.map((trip, i) => {
        const isDone = isPersisted ? trip.Status === 'completed' : localCompleted.has(i);
        const cust = trip.CUSTOMER || {};
        const customerName = `${cust.FirstName || ''} ${cust.LastName || ''}`.trim() || 'Επισκέπτης';
        const time = trip.Date ? new Date(trip.Date).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const dateStr = trip.Date ? new Date(trip.Date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' }) : '';
        const cost = trip.Cost != null ? `€${trip.Cost}` : '';
        const dest = trip.Destination || 'Μεταφορά';
        const isNext = i === lastCompletedIndex + 1;

        let rowCls, sideCls, pillCls, pillIcon, label;
        if (isDone) {
            rowCls = 'trip-done';
            sideCls = 'trip-sidebar-done';
            pillCls = 'trip-pill-done';
            pillIcon = 'ti ti-circle-check';
            label = 'Ολοκληρώθηκε';
        } else if (isNext) {
            rowCls = '';
            sideCls = 'trip-sidebar-next';
            pillCls = 'trip-pill-next';
            pillIcon = 'ti ti-clock';
            label = 'Επόμενο';
        } else {
            rowCls = '';
            sideCls = 'trip-sidebar-pending';
            pillCls = 'trip-pill-pending';
            pillIcon = 'ti ti-minus';
            label = 'Εκκρεμεί';
        }

        const groupLabel = cust.IsGroup ? 'Πρακτορείο' : 'Ιδιώτης';

        return `
        <div class="trip-row ${rowCls}">
            <div class="trip-sidebar ${sideCls}"></div>
            <div class="trip-body">
                <div class="trip-time">
                    <div class="trip-time-val">${time}</div>
                    <div class="trip-time-date">${dateStr}</div>
                </div>
                <div class="trip-info">
                    <div class="trip-dest">${dest}</div>
                    <div class="trip-meta">
                        <span>${customerName}</span>
                        <span class="trip-meta-dot"></span>
                        <span>${groupLabel}</span>
                        ${cost ? `<span class="trip-meta-dot"></span><span>${cost}</span>` : ''}
                    </div>
                </div>
                <div class="trip-status">
                    <span class="trip-pill ${pillCls}"><i class="${pillIcon}"></i> ${label}</span>
                </div>
                <div class="trip-action">
                    ${!isDone
                        ? `<button class="btn-complete" onclick="window.completeTrip(${trip.TripID})"><i class="ti ti-check"></i> Ολοκλήρωση</button>`
                        : `<span class="trip-check"><i class="ti ti-check"></i></span>`}
                    <button class="btn-del" onclick="window.hideTrip(${trip.TripID})" title="Απόκρυψη"><i class="ti ti-eye-off"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');

    renderHiddenBanner(container);
}

function renderHiddenBanner(container) {
    if (hiddenTripIds.size === 0) return;
    const restore = document.createElement('div');
    restore.style.cssText = 'text-align:center;padding:10px;font-size:12px;color:var(--color-text-secondary);border-top:1px solid var(--color-border-tertiary);margin-top:6px;cursor:pointer';
    restore.innerHTML = `${hiddenTripIds.size} κρυφές — <a style="color:#378ADD;text-decoration:underline;cursor:pointer">Εμφάνιση</a>`;
    restore.querySelector('a').onclick = function() {
        hiddenTripIds.clear();
        renderTrips();
        updateOverview();
    };
    container.appendChild(restore);
}

window.completeTrip = async function(tripId) {
    if (window._tripHasStatus) {
        try {
            const { error } = await supabase
                .from('TRIP')
                .update({ Status: 'completed' })
                .eq('TripID', tripId);
            if (error) throw error;

            const trip = todayTrips.find(t => t.TripID === tripId);
            if (trip) trip.Status = 'completed';

            const driverName = currentUser?.name || 'Οδηγός';
            const dest = trip?.Destination || '—';
            const cost = trip?.Cost || '—';
            const dateStr = trip?.Date ? new Date(trip.Date).toLocaleDateString('el-GR') : '—';

            let vehicleInfo = '—';
            if (trip?.VehicleID) {
                const { data: veh } = await supabase
                    .from('VEHICLE')
                    .select('PlateNumber')
                    .eq('VehicleID', trip.VehicleID)
                    .maybeSingle();
                if (veh) vehicleInfo = veh.PlateNumber || '—';
            }

            await supabase.from('NOTIFICATION').insert([{
                TargetRole: 'external_manager',
                Type: 'trip_completed',
                Message: `${driverName} | Προορισμός: ${dest} | Κόστος: €${cost} | Όχημα: ${vehicleInfo} | Ημ/νία: ${dateStr}`,
                IsRead: false,
                CreatedAt: new Date().toISOString()
            }]);
        } catch (err) {
            showToast('Σφάλμα ενημέρωσης: ' + err.message, 'error');
            return;
        }
    } else {
        const idx = todayTrips.findIndex(t => t.TripID === tripId);
        if (idx !== -1) localCompleted.add(idx);
    }
    updateOverview();
    renderTrips();
    showToast('Η διαδρομή ολοκληρώθηκε!', 'success');
};

window.hideTrip = function(tripId) {
    hiddenTripIds.add(tripId);
    renderTrips();
};

window.hideAllTrips = function() {
    todayTrips.forEach(t => hiddenTripIds.add(t.TripID));
    renderTrips();
};

function renderFleet() {
    const container = document.getElementById('fleet-list');
    if (!container) return;

    if (allVehicles.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Δεν υπάρχουν καταχωρημένα οχήματα.</div>';
        return;
    }

    const statusLabels = { available: 'Διαθέσιμο', in_use: 'Σε χρήση', maintenance: 'Συντήρηση' };
    const statusColors = { available: '#C0DD97', in_use: '#93C5FD', maintenance: '#F7C1C1' };
    const statusBg = { available: '#EAF3DE', in_use: '#E6F1FB', maintenance: '#FFF8F8' };

    container.innerHTML = allVehicles.map(v => {
        const isMine = myVehicle && v.VehicleID === myVehicle.VehicleID;
        const label = statusLabels[v.Status] || v.Status;
        const color = statusColors[v.Status] || '#D1D5DB';
        const bg = statusBg[v.Status] || '#F3F4F6';
        return `
        <div class="sc" style="border:1px solid ${color};background:${bg};${isMine ? '' : 'opacity:0.6'}">
            <div class="sc-lbl">${v.PlateNumber || '—'} ${isMine ? '(Εσείς)' : ''}</div>
            <div class="sc-val" style="font-size:16px">${v.Type || 'Όχημα'}</div>
            <div class="sc-sub">Κατάσταση: ${label}</div>
        </div>`;
    }).join('');
}

function populateFaultVehicleSelect() {
    const select = document.getElementById('fault-vehicle');
    if (!select || allVehicles.length === 0) return;
    select.innerHTML = '<option value="">— Επιλέξτε Όχημα —</option>' + allVehicles.map(v =>
        `<option value="${v.VehicleID}">${v.Type || 'Όχημα'} (${v.PlateNumber || '—'})</option>`
    ).join('');
}

window.submitFuelExpense = async function() {
    const type = document.getElementById('exp-type')?.value || 'Καύσιμα';
    const amount = document.getElementById('exp-amount')?.value;
    const odometer = document.getElementById('exp-odometer')?.value;

    if (!amount || parseFloat(amount) <= 0) {
        showToast('Παρακαλώ συμπληρώστε το ποσό.', 'error');
        return;
    }

    try {
        const { data: maxRec } = await supabase
            .from('RECEIPT')
            .select('ReceiptID')
            .order('ReceiptID', { ascending: false })
            .limit(1)
            .maybeSingle();
        const nextId = (maxRec?.ReceiptID || 0) + 1;

        const { error } = await supabase
            .from('RECEIPT')
            .insert([{
                ReceiptID: nextId,
                PaymentDate: new Date().toISOString().split('T')[0],
                Amount: parseFloat(amount),
                Category: 'fuel'
            }]);
        if (error) throw error;

        const driverName = currentUser?.name || 'Οδηγός';
        const vehicleStr = myVehicle
            ? `${myVehicle.Type || 'Όχημα'} (${myVehicle.PlateNumber || '—'})`
            : '—';
        const odometerStr = odometer ? ` | Χλμ: ${odometer}` : '';

        const { error: notifErr } = await supabase.from('NOTIFICATION').insert([{
            TargetRole: 'external_manager',
            Type: 'fuel_expense',
            Message: `${driverName} | Τύπος: ${type} | Ποσό: €${amount} | Όχημα: ${vehicleStr}${odometerStr} | Ημ/νία: ${new Date().toISOString().split('T')[0]}`,
            IsRead: false,
            CreatedAt: new Date().toISOString()
        }]);
        if (notifErr) throw notifErr;

        showToast('Το αίτημα εξόδων υποβλήθηκε για έγκριση.', 'success');
        document.getElementById('exp-amount').value = '';
        if (document.getElementById('exp-odometer')) document.getElementById('exp-odometer').value = '';
    } catch (err) {
        showToast('Σφάλμα υποβολής: ' + err.message, 'error');
    }
};

window.submitFault = async function() {
    const vehicleSelect = document.getElementById('fault-vehicle');
    const desc = document.getElementById('fault-desc')?.value;
    const urgency = document.getElementById('fault-urgency')?.value;

    if (!desc || desc.trim() === '') {
        showToast('Παρακαλώ συμπληρώστε την περιγραφή της βλάβης.', 'error');
        return;
    }

    const vehicleId = vehicleSelect ? parseInt(vehicleSelect.value) : null;
    const vehicleText = vehicleSelect && vehicleSelect.selectedIndex > 0
        ? vehicleSelect.options[vehicleSelect.selectedIndex].text
        : null;
    const isUrgent = urgency && urgency.includes('ΝΑΙ');

    try {
        const now = new Date();
        const timeStr = now.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const driverName = currentUser?.name || '—';

        let vehicleInfo = vehicleText ? ` | Όχημα: ${vehicleText}` : '';
        if (vehicleId) {
            const { data: veh } = await supabase
                .from('VEHICLE')
                .select('Type, PlateNumber')
                .eq('VehicleID', vehicleId)
                .maybeSingle();
            if (veh) {
                vehicleInfo = ` | Όχημα: ${veh.Type || '—'} (${veh.PlateNumber || '—'})`;
            }
        }

        const { error } = await supabase
            .from('NOTIFICATION')
            .insert([{
                TargetRole: 'external_manager',
                Type: 'vehicle_fault',
                Message: `${isUrgent ? ' [ΕΠΕΙΓΟΝ]' : ''}Βλάβη από ${driverName}${vehicleInfo} | Ώρα: ${timeStr} | Περιγραφή: ${desc.trim()}`,
                IsRead: false,
                CreatedAt: now.toISOString()
            }]);
        if (error) throw error;

        showToast('Η αναφορά στάλθηκε στο Τεχνικό Τμήμα.', 'success');
        document.getElementById('fault-desc').value = '';
    } catch (err) {
        showToast('Σφάλμα αποστολής: ' + err.message, 'error');
    }
};

window.navTo = function(viewId) {
    const targetItem = document.querySelector(`.sb-item[data-v="${viewId}"]`);
    if (targetItem) targetItem.click();
};

window.logout = async function() {
    const user = JSON.parse(localStorage.getItem('hotel_user'));
    if (user) await supabase.from('EMPLOYEE').update({ IsLoggedIn: false }).eq('EmpID', user.id);
    localStorage.removeItem('hotel_user');
    alert("Αποσυνδεθήκατε επιτυχώς!");
    window.location.href = "/pages/login.html";
};
