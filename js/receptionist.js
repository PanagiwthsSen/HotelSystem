import { supabase } from './supabase-config.js';
import { showToast, normalizeString, formatDate, updateLiveTime } from './utils/ui.js';
import { isSoonCheckout, getStatusLabel, buildCheckoutMap, calcDynamicPrice, fetchSpecialPricing, fetchOccupancyPercentage, mapDbStatusToUI, fetchOverlappingReservations, fetchBusyRoomNumbers } from './services/api.js';
import { renderRoomMap } from './components/RoomMap.js';

/* ==============================================================
   NAVIGATION
   ============================================================== */
const viewTitles = {
    dash: 'Επισκόπηση', rooms: 'Κατάσταση Δωματίων', 'new-booking': 'Νέα Κράτηση',
    'room-search': 'Αναζήτηση Δωματίων',
    arrivals: 'Αφίξεις (Check-in)', departures: 'Αναχωρήσεις (Check-out)', 
    bookings: 'Όλες οι Κρατήσεις',
    minibar: 'Χρεώσεις Mini-bar', policies: 'Πολιτική Ξενοδοχείου'
};

async function navTo(id) {
    document.querySelectorAll('.sb-item').forEach(i => i.classList.toggle('active', i.dataset.v === id));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
    document.getElementById('tb-title').textContent = viewTitles[id] || id;
    if (id === 'new-booking') {
        await fetchRoomPrices();
        fetchAvailableRooms();
    }
    if (id === 'bookings') fetchAllReservations();
    if (id === 'minibar') fetchMinibarView();
}

document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => navTo(el.dataset.v));
});

/* ==============================================================
   STATE & ROOMS FETCHING (SUPABASE)
   ============================================================== */
let hotelRooms = [];
let currentOcc = 0, currentFree = 0, currentDirty = 0, currentCleaning = 0;
let selectedRoom = null;
let checkoutMap = {};

async function fetchRoomsAndRender() {
    try {
        const { data: rooms, error } = await supabase
            .from('ROOM')
            .select('*')
            .order('RoomNumber', { ascending: true });

        if (error) throw error;

        checkoutMap = await buildCheckoutMap();

        hotelRooms = rooms.map(r => {
            const state = mapDbStatusToUI(r.Status);
            const checkOutDate = checkoutMap[r.RoomNumber] || null;
            return {
                id: r.RoomNumber,
                type: r.RoomType,
                state: state === 'occ' && isSoonCheckout(checkOutDate) ? 'soon' : state,
                dbStatus: r.Status,
                checkOutDate
            };
        });

        renderMap();
    } catch (err) {
        console.error("Σφάλμα κατά τη φόρτωση των δωματίων:", err.message);
        showToast("Αποτυχία φόρτωσης δωματίων από τη βάση.", "error");
    }
}

function calculateLiveStats() {
    currentOcc = 0; currentFree = 0; currentDirty = 0; currentCleaning = 0;
    
    hotelRooms.forEach(r => {
        if (r.state === 'occ') currentOcc++;
        else if (r.state === 'dirty') currentDirty++;
        else if (r.state === 'cleaning') currentCleaning++;
        else currentFree++;
    });
    
    const totalRooms = hotelRooms.length || 1;
    const occPct = Math.round((currentOcc / totalRooms) * 100);

    const liveBadge = document.getElementById('live-occ-badge');
    if(liveBadge) liveBadge.textContent = `Πληρ. ${occPct}%`;
    
    const dashOccVal = document.getElementById('dash-occ-val');
    if(dashOccVal) dashOccVal.textContent = `${occPct}%`;
    
    const dashOccSub = document.getElementById('dash-occ-sub');
    if(dashOccSub) dashOccSub.textContent = `${currentOcc} / ${totalRooms} δωμάτια`;
    
    const dashOccBar = document.getElementById('dash-occ-bar');
    if(dashOccBar) dashOccBar.style.width = `${occPct}%`;
    
    const dashFreeVal = document.getElementById('dash-free-val');
    if(dashFreeVal) dashFreeVal.textContent = currentFree;
    
    if(document.getElementById('stat-occ')) {
        document.getElementById('stat-occ').textContent = currentOcc;
        document.getElementById('stat-occ-bar').style.width = `${occPct}%`;
        document.getElementById('stat-free').textContent = currentFree;
        document.getElementById('stat-dirty').textContent = currentDirty;
        document.getElementById('stat-cleaning').textContent = currentCleaning;
    }
}

function renderMap(filter = 'all') {
    renderRoomMap('rmap', hotelRooms, { filter });
    calculateLiveStats();
}

function filterRooms(f, el) {
    document.querySelectorAll('.active-filter').forEach(b => b.classList.remove('active-filter'));
    el.classList.add('active-filter');
    renderMap(f);
}

/* ==============================================================
   RESERVATIONS FETCHING (SUPABASE)
   ============================================================== */
/* ── Fetch minibar charges for a set of reservation IDs ── */

async function fetchMinibarForDepartures(reservationIds) {
    if (!reservationIds || reservationIds.length === 0) return {};
    try {
        const { data, error } = await supabase
            .from('MINIBAR_CONSUMPTION')
            .select('ReservationID, Quantity, Charge, INVENTORY_ITEM ( Name )')
            .in('ReservationID', reservationIds);

        if (error) throw error;
        if (!data || data.length === 0) return {};

        const map = {};
        data.forEach(r => {
            const rid = r.ReservationID;
            if (!map[rid]) map[rid] = { total: 0, items: [] };
            map[rid].total += parseFloat(r.Charge) || 0;
            map[rid].items.push({
                name: r.INVENTORY_ITEM?.Name || 'Είδος',
                qty: r.Quantity || 0,
                charge: parseFloat(r.Charge) || 0
            });
        });
        return map;
    } catch (err) {
        console.error('Σφάλμα minibar:', err.message);
        return {};
    }
}

async function fetchMinibarView() {
    const tbody = document.querySelector('#v-minibar tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--color-text-secondary)">Φόρτωση...</td></tr>';

    try {
        const { data: records, error } = await supabase
            .from('MINIBAR_CONSUMPTION')
            .select('ConsumptionID, Quantity, Charge, ReservationID, INVENTORY_ITEM ( Name )')
            .order('ConsumptionID', { ascending: false });

        if (error) throw error;

        tbody.innerHTML = '';

        if (!records || records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--color-text-secondary)">Δεν υπάρχουν χρεώσεις mini-bar.</td></tr>';
            return;
        }

        const resIds = [...new Set(records.map(r => r.ReservationID))];

        const [{ data: resRooms }, { data: reservations }] = await Promise.all([
            supabase.from('RESERVATION_ROOM').select('ReservationID, RoomNumber').in('ReservationID', resIds),
            supabase.from('RESERVATION').select('ReservationID, CustomerID, Status').in('ReservationID', resIds)
        ]);

        const custIds = [...new Set((reservations || []).map(r => r.CustomerID))];
        const { data: customers } = await supabase
            .from('CUSTOMER')
            .select('CustomerID, FirstName, LastName')
            .in('CustomerID', custIds);

        const roomByRes = {};
        (resRooms || []).forEach(rr => { roomByRes[rr.ReservationID] = rr.RoomNumber; });

        const custByRes = {};
        (reservations || []).forEach(r => { custByRes[r.ReservationID] = r.CustomerID; });

        const statusByRes = {};
        (reservations || []).forEach(r => { statusByRes[r.ReservationID] = r.Status; });

        const nameByCust = {};
        (customers || []).forEach(c => {
            nameByCust[c.CustomerID] = [c.FirstName || '', c.LastName || ''].filter(Boolean).join(' ').trim() || 'Άγνωστος';
        });

        records.forEach(rec => {
            const roomNumber = roomByRes[rec.ReservationID] || '-';
            const custId = custByRes[rec.ReservationID];
            const customerName = nameByCust[custId] || 'Άγνωστος';
            const itemName = rec.INVENTORY_ITEM?.Name || 'Είδος';
            const charge = parseFloat(rec.Charge) || 0;
            const qty = rec.Quantity || 0;
            const isCharged = statusByRes[rec.ReservationID] === 'CheckedOut';
            const statusPill = isCharged ? 'p-g' : 'p-b';
            const statusText = isCharged ? 'Χρεώθηκε' : 'Αναμονή';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${roomNumber}</td>
                <td>${customerName}</td>
                <td>${itemName} x${qty}</td>
                <td>€${charge.toFixed(2)}</td>
                <td><span class="pill ${statusPill}">${statusText}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Σφάλμα φόρτωσης mini-bar:', err.message);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--color-text-secondary)">Σφάλμα φόρτωσης δεδομένων.</td></tr>';
    }
}

async function fetchTodayReservations() {
    const today = new Date().toISOString().split('T')[0];

    try {
        // Αφίξεις Σήμερα
        const { data: arrivals, error: arrErr } = await supabase
            .from('RESERVATION')
            .select(`ReservationID, Status, RoomType, CUSTOMER ( FirstName, LastName, IsGroup )`)
            .eq('CheckInDate', today);

        // Αναχωρήσεις Σήμερα
        const { data: departures, error: depErr } = await supabase
            .from('RESERVATION')
            .select(`ReservationID, Status, TotalCost, CUSTOMER ( FirstName, LastName, IsGroup )`)
            .eq('CheckOutDate', today);

        if (arrErr) throw arrErr;
        if (depErr) throw depErr;

        const arrList = arrivals || [];
        const depList = departures || [];

        // Φόρτωση δωματίων από RESERVATION_ROOM για όλες τις κρατήσεις
        const allIds = [...arrList.map(a => a.ReservationID), ...depList.map(d => d.ReservationID)];
        const roomMap = {};

        if (allIds.length > 0) {
            const { data: rrData, error: rrErr } = await supabase
                .from('RESERVATION_ROOM')
                .select('ReservationID, RoomNumber')
                .in('ReservationID', allIds);
            if (!rrErr && rrData) {
                rrData.forEach(r => { roomMap[r.ReservationID] = r.RoomNumber; });
            }
        }

        arrList.forEach(a => a._roomNumber = roomMap[a.ReservationID] || '-');
        depList.forEach(d => d._roomNumber = roomMap[d.ReservationID] || '-');

        // Φόρτωση χρεώσεων mini-bar για τις αναχωρήσεις
        const depIds = depList.map(d => d.ReservationID);
        const mbMap = await fetchMinibarForDepartures(depIds);
        depList.forEach(d => {
            const mb = mbMap[d.ReservationID];
            d._mbTotal = mb ? mb.total : 0;
            d._mbItems = mb ? mb.items : [];
        });

        renderArrivals(arrList);
        renderDepartures(depList);
        
        const liveArrBadge = document.getElementById('live-arr-badge');
        if(liveArrBadge) liveArrBadge.textContent = `Αφίξεις: ${arrList.length}`;
        const dashArrCount = document.getElementById('dash-arr-count');
        if (dashArrCount) dashArrCount.textContent = arrList.length;
        const dashDepCount = document.getElementById('dash-dep-count');
        if (dashDepCount) dashDepCount.textContent = depList.length;

    } catch (err) {
        console.error("Σφάλμα κρατήσεων:", err.message);
        showToast("Σφάλμα φόρτωσης κρατήσεων: " + err.message, "error");
    }
}

function renderArrivals(arrivals) {
    const tbody = document.querySelector('#v-arrivals table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    arrivals.forEach(arr => {
        const c = arr.CUSTOMER || {};
        const customerName = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
        const roomNumber = arr._roomNumber || '-';
        const isCheckedIn = (arr.Status === 'CheckedIn' || arr.Status === 'CheckedOut');
        const isGroup = c.IsGroup === true;
        const hasRoom = roomNumber !== '-';
        const safeName = customerName.replace(/'/g, "\\'");
        const roomType = arr.RoomType || '—';
        const safeRoomType = roomType.replace(/'/g, "\\'");
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${customerName}</td>
            <td>${isGroup ? 'Γκρουπ' : 'Ιδιώτης'}</td>
            <td>${roomType}</td>
            <td>${roomNumber}</td>
            <td><span class="pill ${isCheckedIn ? 'p-g' : 'p-a'}">${isCheckedIn ? 'Ολοκλ.' : 'Εκκρεμεί'}</span></td>
            <td>
                <button class="btn btn-sm ${isCheckedIn ? '' : 'btn-dark'}" 
                        ${isCheckedIn ? 'disabled' : ''} 
                        onclick="openCheckinModal(${arr.ReservationID}, '${safeName}', '${safeRoomType}', ${hasRoom ? roomNumber : null})">
                    ${isCheckedIn ? 'C/I OK' : 'Check-in'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Dashboard mini-table
    const dashBody = document.getElementById('dash-arrivals-body');
    if (dashBody) {
        if (arrivals.length === 0) {
            dashBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:8px;">Δεν υπάρχουν αφίξεις σήμερα</td></tr>';
        } else {
            dashBody.innerHTML = arrivals.slice(0, 5).map(arr => {
                const c = arr.CUSTOMER || {};
                const name = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
                const room = arr._roomNumber || '—';
                const isCheckedIn = (arr.Status === 'CheckedIn' || arr.Status === 'CheckedOut');
                const statusHtml = isCheckedIn ? '<span class="pill p-g">Check-In</span>' : '<span class="pill p-a">Εκκρεμεί</span>';
                return `<tr><td><strong>${name}</strong></td><td>${room}</td><td>${statusHtml}</td></tr>`;
            }).join('');
        }
    }
}

function renderDepartures(departures) {
    const tbody = document.querySelector('#v-departures table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    departures.forEach(dep => {
        const c = dep.CUSTOMER || {};
        const customerName = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
        const roomNumber = dep._roomNumber || '-';
        const isCheckedOut = dep.Status === 'CheckedOut';

        // Mini-bar charges
        const mbTotal = dep._mbTotal || 0;
        let mbHtml;
        if (mbTotal > 0) {
            const mbItems = dep._mbItems || [];
            const details = mbItems.map(i => `${i.name} x${i.qty}`).join(', ');
            mbHtml = `<span class="pill p-b" title="Mini-bar: ${details}">€${mbTotal.toFixed(2)}</span>`;
        } else {
            mbHtml = '<span class="pill p-g">OK</span>';
        }

        // Σύνολο = Δωμάτιο + Mini-bar
        const roomCost = parseFloat(dep.TotalCost) || 0;
        const totalWithMb = roomCost + mbTotal;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${customerName}</td>
            <td>${roomNumber}</td>
            <td>${mbHtml}</td>
            <td><strong>€${totalWithMb.toFixed(2)}</strong>${mbTotal > 0 ? `<br><span style="font-size:10px;color:#6B7280;">(Δωμ. €${roomCost} + Mini-bar €${mbTotal.toFixed(2)})</span>` : ''}</td>
            <td><span class="pill ${isCheckedOut ? 'p-g' : 'p-a'}">${isCheckedOut ? 'Ολοκλ.' : 'Εκκρεμεί'}</span></td>
            <td>
                <button class="btn btn-sm ${isCheckedOut ? '' : 'btn-dark'}" 
                        ${isCheckedOut ? 'disabled' : ''} 
                        onclick="doCheckout(this, '${customerName}', ${dep.ReservationID}, '${roomNumber}')">
                    ${isCheckedOut ? 'C/O OK' : 'Check-out'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Dashboard mini-table
    const dashBody = document.getElementById('dash-departures-body');
    if (dashBody) {
        if (departures.length === 0) {
            dashBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:8px;">Δεν υπάρχουν αναχωρήσεις σήμερα</td></tr>';
        } else {
            dashBody.innerHTML = departures.slice(0, 5).map(dep => {
                const c = dep.CUSTOMER || {};
                const name = (c.FirstName || c.LastName) ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : 'Άγνωστος';
                const room = dep._roomNumber || '—';
                const isCheckedOut = dep.Status === 'CheckedOut';
                const mbTotal = dep._mbTotal || 0;
                const totalWithMb = (parseFloat(dep.TotalCost) || 0) + mbTotal;
                const statusHtml = isCheckedOut ? '<span class="pill p-g">Check-Out</span>' : '<span class="pill p-a">Εκκρεμεί</span>';
                return `<tr><td><strong>${name}</strong></td><td>${room}</td><td>€${totalWithMb.toFixed(2)} ${statusHtml}</td></tr>`;
            }).join('');
        }
    }
}

/* ==============================================================
   ΛΕΙΤΟΥΡΓΙΑ ΑΠΟΣΥΝΔΕΣΗΣ (LOGOUT)
   ============================================================== */
async function logout() {
    const user = JSON.parse(localStorage.getItem('hotel_user'));
    if (user) await supabase.from('EMPLOYEE').update({ IsLoggedIn: false }).eq('EmpID', user.id);
    localStorage.removeItem('hotel_user');
    alert("Αποσυνδεθήκατε επιτυχώς!");
    window.location.href = "/pages/login.html";
}

/* ==============================================================
   BOOKING LOGIC (UI CALCS & SUBMIT)
   ============================================================== */
const prepayMap = {
    phone: { txt: 'Τηλεφωνική/Κάρτα (20%)', pct: 20 },
    prepaid: { txt: 'Προπληρωμένη (50%)', pct: 50 },
    group: { txt: 'Ειδική Γκρουπ (15%)', pct: 15 },
    walkin: { txt: 'Walk-in (100% κατά την άφιξη)', pct: 100 }
};

/* ==============================================================
   CARD VALIDATION
   ============================================================== */

function validateCardNumber(num) {
    const digits = num.replace(/\s/g, '');
    if (!/^\d{16}$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        let d = parseInt(digits[i], 10);
        if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
}

function validateExpiry(exp) {
    if (!/^\d{2}\/\d{2}$/.test(exp)) return false;
    const [mm, yy] = exp.split('/').map(Number);
    if (mm < 1 || mm > 12) return false;
    const now = new Date();
    const expDate = new Date(2000 + yy, mm);
    return expDate > now;
}

function validateCVV(cvv) {
    return /^\d{3,4}$/.test(cvv);
}

function validateCardholderName(name) {
    return name && name.trim().length >= 2 && /^[A-Za-zΑ-Ωα-ωάέήίόύώϊϋΐΰΆΈΉΊΌΎΏ\s'-]+$/.test(name.trim());
}

function clearCardErrors(form) {
    const ids = ['card-name', 'card-number', 'card-exp', 'card-cvv'];
    ids.forEach(f => {
        const el = document.getElementById(form + '-' + f);
        if (el) el.classList.remove('card-input-error');
    });
    document.querySelectorAll('#' + form + '-card-section .card-error-msg').forEach(el => el.remove());
}

function validateAllCardFields(form) {
    clearCardErrors(form);
    const errors = [];

    const name = document.getElementById(form + '-card-name')?.value || '';
    if (!validateCardholderName(name)) {
        errors.push('Παρακαλώ συμπληρώστε το όνομα κατόχου κάρτας.');
        const el = document.getElementById(form + '-card-name');
        if (el) { el.classList.add('card-input-error'); el.focus(); }
        return { valid: false, errors };
    }

    const cardNum = document.getElementById(form + '-card-number')?.value || '';
    if (!validateCardNumber(cardNum)) {
        errors.push('Ο αριθμός κάρτας δεν είναι έγκυρος.');
        const el = document.getElementById(form + '-card-number');
        if (el) { el.classList.add('card-input-error'); el.focus(); }
        return { valid: false, errors };
    }

    const exp = document.getElementById(form + '-card-exp')?.value || '';
    if (!validateExpiry(exp)) {
        errors.push('Η ημερομηνία λήξης δεν είναι έγκυρη ή έχει λήξει.');
        const el = document.getElementById(form + '-card-exp');
        if (el) { el.classList.add('card-input-error'); el.focus(); }
        return { valid: false, errors };
    }

    const cvv = document.getElementById(form + '-card-cvv')?.value || '';
    if (!validateCVV(cvv)) {
        errors.push('Το CVV δεν είναι έγκυρο (3-4 ψηφία).');
        const el = document.getElementById(form + '-card-cvv');
        if (el) { el.classList.add('card-input-error'); el.focus(); }
        return { valid: false, errors };
    }

    return { valid: true, errors: [] };
}

function toggleCardSection(form) {
    const btype = document.getElementById(form + '-btype')?.value;
    const payment = document.getElementById(form + '-payment')?.value;
    const section = document.getElementById(form + '-card-section');
    if (!section) return;
    const show = btype === 'phone' && payment === 'card';
    section.style.display = show ? 'block' : 'none';
    if (!show) clearCardErrors(form);
}

/* ==============================================================
   LIVE PRICE MANAGEMENT (fetched from DB)
   ============================================================== */

let roomPrices = {};

async function fetchRoomPrices() {
    try {
        const { data, error } = await supabase
            .from('ROOM').select('RoomType, BasePrice');
        if (error) throw error;
        roomPrices = {};
        (data || []).forEach(r => {
            if (!roomPrices[r.RoomType]) roomPrices[r.RoomType] = r.BasePrice;
        });

        specialPricing = await fetchSpecialPricing();

        const occPct = await fetchOccupancyPercentage();
        lowMultiplier = occPct < 60 ? 0.85 : 1.0;

        populateRoomTypeDropdown();
    } catch (err) {
        console.error('Σφάλμα φόρτωσης τιμών:', err.message);
    }
}

function populateRoomTypeDropdown() {
    const sel = document.getElementById('nb-rtype');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    const entries = Object.entries(roomPrices);
    if (entries.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— Φόρτωση τιμών —';
        sel.appendChild(opt);
        return;
    }
    entries.forEach(([type, price]) => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = `${type} (€${price})`;
        sel.appendChild(opt);
    });
    if (prev && roomPrices[prev]) {
        sel.value = prev;
    }
    updatePrice();
}

function calcNights() {
    const i = document.getElementById('nb-in')?.value;
    const o = document.getElementById('nb-out')?.value;
    if(!i || !o) return 1;
    return Math.max(1, Math.round((new Date(o) - new Date(i)) / 86400000));
}

function updatePrice() {
    const rtypeEl = document.getElementById('nb-rtype');
    if(!rtypeEl) return;
    const typeText = rtypeEl.value;
    if (!typeText || !roomPrices[typeText]) return;
    const basePrice = roomPrices[typeText];
    const checkIn = document.getElementById('nb-in')?.value;
    const checkOut = document.getElementById('nb-out')?.value;
    const nights = calcNights();

    const guestsEl = document.getElementById('nb-guests');
    const guests = parseInt(guestsEl?.value) || 1;
    const capacity = ROOM_CAPACITY[typeText] || 2;
    const roomsNeeded = Math.ceil(guests / capacity);

    const { total: totalPerRoom, groups: groupLabels } = calcDynamicPrice(basePrice, typeText, checkIn, checkOut, specialPricing, lowMultiplier);
    const grandTotal = totalPerRoom * roomsNeeded;
    let breakdown = '';
    if (groupLabels.length > 0) {
        breakdown = `${typeText}: ` + groupLabels.map(g => `${g.label} €${g.pricePerNight}×${g.count}`).join(', ');
    } else {
        breakdown = `${typeText}: €${basePrice} × ${nights}`;
    }
    if (roomsNeeded > 1) breakdown += ` × ${roomsNeeded} δωμ.`;

    document.getElementById('sp-room').textContent = roomsNeeded > 1 ? `${roomsNeeded} × ${typeText}` : typeText;
    document.getElementById('sp-nights').textContent = nights;
    document.getElementById('sp-sub').textContent = breakdown;
    document.getElementById('sp-total').textContent = `€${grandTotal}`;

    updatePrepay(grandTotal);
}

function updatePrepay(totalVal) {
    const t = document.getElementById('nb-btype')?.value;
    if(!t) return;
    const total = totalVal || parseInt(document.getElementById('sp-total').textContent.replace('€',''));
    const config = prepayMap[t];
    const amt = Math.round(total * config.pct / 100);
    
    document.getElementById('prepay-box').innerHTML = `<i class="ti ti-info-circle" aria-hidden="true"></i> Προκαταβολή: ${config.txt} — <strong>€${amt}</strong>`;
}

/* ==============================================================
   ROOM CAPACITY & GUEST CALCULATION
   ============================================================== */

const ROOM_CAPACITY = { 'Μονόκλινο': 1, 'Δίκλινο': 2, 'Φαρδύκλινο': 2, 'Σουίτα': 4 };

let specialPricing = null;
let lowMultiplier = 1.0;

function calculateRoomRequirements(totalGuests, roomType, availableCount) {
    const capacity = ROOM_CAPACITY[roomType] || 2;
    if (totalGuests < 1) return null;
    const roomsNeeded = Math.ceil(totalGuests / capacity);
    const isGroup = roomsNeeded > 1;

    // Distribution: spread guests evenly across rooms
    const distribution = [];
    let remaining = totalGuests;
    for (let i = 0; i < roomsNeeded; i++) {
        const guestsInRoom = Math.ceil(remaining / (roomsNeeded - i));
        distribution.push(guestsInRoom);
        remaining -= guestsInRoom;
    }

    const totalCapacity = capacity * roomsNeeded;
    const wastedBeds = totalCapacity - totalGuests;
    const canAccommodate = availableCount >= roomsNeeded;

    return {
        totalGuests,
        capacity,
        roomsNeeded,
        isGroup,
        distribution,
        wastedBeds,
        canAccommodate,
        availableCount
    };
}

function updateRoomSummary() {
    const guestsEl = document.getElementById('nb-guests');
    const rtypeEl = document.getElementById('nb-rtype');
    const summaryEl = document.getElementById('nb-rooms-summary');
    if (!guestsEl || !rtypeEl || !summaryEl) return;

    const totalGuests = parseInt(guestsEl.value) || 1;
    const roomType = rtypeEl.value;
    if (!roomType) return;

    // Count available rooms displayed
    const availableCount = document.querySelectorAll('#avail-rooms .room-opt').length;
    const calc = calculateRoomRequirements(totalGuests, roomType, availableCount);
    if (!calc) return;

    if (calc.roomsNeeded <= 1 && !calc.isGroup) {
        // Single room — no special message needed, but show capacity info
        summaryEl.innerHTML = `
            <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:8px 12px;font-size:11px;display:flex;align-items:center;gap:8px;color:#166534;">
                <i class="ti ti-users" style="font-size:16px;"></i>
                <span><strong>${totalGuests} άτομο${totalGuests > 1 ? 'α' : ''}</strong> — ${roomType} (χωρητικότητα ${calc.capacity} άτομο${calc.capacity > 1 ? 'α' : ''}) — 1 δωμάτιο</span>
            </div>
        `;
        return;
    }

    // Multi-room / group summary
    const distText = calc.distribution.map(g => `${g} άτομα`).join(' + ');
    const statusIcon = calc.canAccommodate ? 'ti ti-circle-check' : 'ti ti-alert-triangle';
    const statusColor = calc.canAccommodate ? '#166534' : '#991B1B';
    const statusBg = calc.canAccommodate ? '#F0FDF4' : '#FEF2F2';
    const statusBorder = calc.canAccommodate ? '#BBF7D0' : '#FECACA';
    const statusMsg = calc.canAccommodate
        ? `Επαρκής διαθεσιμότητα (${calc.availableCount} διαθέσιμα)`
        : `Μόνο ${calc.availableCount} διαθέσιμα — απαιτούνται ${calc.roomsNeeded}`;

    summaryEl.innerHTML = `
        <div style="background:${statusBg};border:1px solid ${statusBorder};border-radius:8px;padding:10px 12px;font-size:11px;color:${statusColor};">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <i class="ti ti-users" style="font-size:16px;"></i>
                <span><strong>${calc.totalGuests} άτομα</strong> — ${roomType} (χωρ. ${calc.capacity})</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;padding-left:24px;">
                <span>Απαιτούμενα δωμάτια: <strong>${calc.roomsNeeded}</strong></span>
                <span>Κατανομή: <strong>${distText}</strong></span>
                <span>Κενές κλίνες: <strong>${calc.wastedBeds}</strong></span>
                <span><i class="${statusIcon}"></i> ${statusMsg}</span>
            </div>
        </div>
    `;
}

async function submitBooking() {
    const firstName = document.getElementById('nb-first')?.value;
    const lastName = document.getElementById('nb-last')?.value;
    const phone = document.getElementById('nb-phone')?.value;
    const email = document.getElementById('nb-email')?.value;
    const checkIn = document.getElementById('nb-in')?.value;
    const checkOut = document.getElementById('nb-out')?.value;
    const bookingType = document.getElementById('nb-btype')?.value;
    const paymentMethod = document.getElementById('nb-payment')?.value;
    const totalGuests = parseInt(document.getElementById('nb-guests')?.value) || 1;
    const totalCostText = document.getElementById('sp-total').textContent;
    const totalCost = parseFloat(totalCostText.replace('€', ''));

    if (!lastName || !firstName || !phone || !email || !checkIn || !checkOut) {
        showToast('Παρακαλώ συμπληρώστε Όνομα, Επώνυμο, Τηλέφωνο, Email και ημερομηνίες.', 'error');
        return;
    }

    const roomType = document.getElementById('nb-rtype').value;
    const available = document.querySelectorAll('#avail-rooms .room-opt');
    const availableCount = available.length;

    const calc = calculateRoomRequirements(totalGuests, roomType, availableCount);
    if (!calc) return;

    if (!calc.canAccommodate) {
        showToast(`Αδυναμία φιλοξενίας ${totalGuests} ατόμων: απαιτούνται ${calc.roomsNeeded} δωμάτια ${roomType}, αλλά υπάρχουν μόνο ${calc.availableCount} διαθέσιμα.`, 'error');
        return;
    }

    // Auto-select rooms: pick from displayed room-opt elements
    const roomNumbers = [];
    available.forEach(el => {
        if (roomNumbers.length < calc.roomsNeeded) {
            const num = parseInt(el.dataset.room);
            if (!isNaN(num)) roomNumbers.push(num);
        }
    });

    if (roomNumbers.length === 0) {
        showToast('Δεν βρέθηκαν διαθέσιμα δωμάτια.', 'error');
        return;
    }

    if (bookingType === 'phone' && paymentMethod === 'card') {
        const cardResult = validateAllCardFields('nb');
        if (!cardResult.valid) {
            showToast(cardResult.errors[0], 'error');
            return;
        }
    }

    try {
        if (!await window.showConfirm(
            `Καταχώρηση κράτησης για ${totalGuests} άτομα;\n` +
            `Τύπος: ${roomType}\n` +
            `Δωμάτια: ${roomNumbers.join(', ')}\n` +
            `Σύνολο: €${totalCost}`
        )) return;

        const { data: customer, error: custError } = await supabase
            .from('CUSTOMER')
            .insert([{ FirstName: firstName, LastName: lastName, Phone: phone, Email: email, IsGroup: (calc.isGroup || bookingType === 'group') }])
            .select().single();

        if (custError) throw custError;

        // Create reservation with all rooms (atomic)
        const { data: result, error: rpcError } = await supabase
            .rpc('book_room_atomic', {
                p_customer_id: customer.CustomerID,
                p_check_in: checkIn,
                p_check_out: checkOut,
                p_total_cost: totalCost,
                p_status: 'Confirmed',
                p_room_numbers: roomNumbers
            });

        if (rpcError) {
            if (rpcError.message && rpcError.message.includes('ROOM_ALREADY_BOOKED')) {
                showToast('Η κράτηση απέτυχε: Κάποιο δωμάτιο μόλις κρατήθηκε από άλλον χρήστη.', 'error');
            } else {
                throw rpcError;
            }
            return;
        }

        const resId = result?.ReservationID;
        if (!resId) throw new Error('Αποτυχία δημιουργίας κράτησης');

        // Update reservation metadata
        const updates = { RoomType: roomType, PaymentMethod: paymentMethod, BookingType: bookingType, NumberOfGuests: totalGuests, Deposit: 0 };
        await supabase.from('RESERVATION').update(updates).eq('ReservationID', resId);

        // Create history entry
        const user = JSON.parse(localStorage.getItem('hotel_user') || '{}');
        await supabase.from('RESERVATION_HISTORY').insert([{
            ReservationID: resId,
            Action: 'created',
            ChangedBy: user.name || 'Σύστημα',
            ChangedByEmpID: user.id || null
        }]);

        const roomList = roomNumbers.join(', ');
        showToast(`Η κράτηση καταχωρήθηκε! ${calc.isGroup ? calc.roomsNeeded + ' δωμάτια' : 'Δωμάτιο'} ${roomList} — ${totalGuests} άτομα.`, 'success');
        selectedRoom = null;
        fetchTodayReservations();
        fetchRoomsAndRender();
        navTo('dash');

        document.getElementById('nb-first').value = '';
        document.getElementById('nb-last').value = '';
        document.getElementById('nb-guests').value = '1';
        updateRoomSummary();

    } catch (err) {
        showToast("Αποτυχία καταχώρησης: " + err.message, "error");
    }
}

async function fetchAvailableRooms() {
    const checkIn = document.getElementById('nb-in').value;
    const checkOut = document.getElementById('nb-out').value;
    const rtypeEl = document.getElementById('nb-rtype');
    if (!checkIn || !checkOut || !rtypeEl) {
        showToast('Επιλέξτε πρώτα ημερομηνίες άφιξης και αναχώρησης.', 'error');
        return;
    }
    if (new Date(checkIn) >= new Date(checkOut)) {
        showToast('Η ημερομηνία αναχώρησης πρέπει να είναι μετά την άφιξη.', 'error');
        return;
    }

    const roomType = rtypeEl.value;

    try {
        const overlapping = await fetchOverlappingReservations(checkIn, checkOut);
        const ids = overlapping.map(r => r.ReservationID);
        const busyRoomRecords = await fetchBusyRoomNumbers(ids);
        const busyRoomNumbers = busyRoomRecords.map(r => r.RoomNumber);

        const { data: allRooms, error: allErr } = await supabase
            .from('ROOM')
            .select('*')
            .eq('RoomType', roomType);

        if (allErr) throw allErr;

        const isCheckInToday = new Date(checkIn) <= new Date(new Date().toDateString());
        const allowedStatuses = isCheckInToday ? ['free'] : ['free', 'dirty', 'soon'];
        const available = (allRooms || []).filter(r =>
            !busyRoomNumbers.includes(r.RoomNumber) &&
            allowedStatuses.includes(r.Status)
        );

        // Query checkout dates for 'occ' rooms
        let checkoutMap = {};
        const occNums = available.filter(r => r.Status === 'occ').map(r => r.RoomNumber);
        if (occNums.length > 0) {
            const { data: rrData } = await supabase
                .from('RESERVATION_ROOM')
                .select('RoomNumber, ReservationID')
                .in('RoomNumber', occNums);
            if (rrData && rrData.length > 0) {
                const ids = rrData.map(r => r.ReservationID);
                const { data: resData } = await supabase
                    .from('RESERVATION')
                    .select('ReservationID, CheckOutDate')
                    .in('ReservationID', ids)
                    .not('Status', 'in', '("Cancelled","CheckedOut")');
                if (resData) {
                    const map = {};
                    resData.forEach(r => map[r.ReservationID] = r.CheckOutDate);
                    rrData.forEach(rr => { if (map[rr.ReservationID]) checkoutMap[rr.RoomNumber] = map[rr.ReservationID]; });
                }
            }
        }
        const section = document.getElementById('nb-room-section');
        if (section) section.style.display = 'block';
        renderAvailableRooms(available, checkoutMap);
        updateRoomSummary();

        const existing = section?.querySelector('.capacity-note');
        if (existing) existing.remove();
        try {
            const cap = await window.checkRoomTypeCapacity(roomType, checkIn, checkOut);
            if (cap.total > 0 && section) {
                const note = document.createElement('div');
                note.className = 'capacity-note';
                note.style.cssText = 'font-size:12px;margin-top:8px;padding:8px 10px;border-radius:6px;display:flex;align-items:center;gap:6px;';
                if (cap.isFull) {
                    note.style.cssText += 'background:#FEF2F2;color:#991B1B;border:1px solid #FECACA;';
                    note.innerHTML = '<i class="ti ti-alert-triangle"></i> ' + roomType + ': Πλήρως κλεισμένο (' + cap.booked + '/' + cap.total + ')';
                    section.appendChild(note);
                } else if (cap.available <= 5) {
                    note.style.cssText += 'background:#FFF8E6;color:#7A6118;border:1px solid #FDE68A;';
                    note.innerHTML = '<i class="ti ti-info-circle"></i> ' + roomType + ': Μόνο ' + cap.available + ' δωμάτια απομένουν (' + cap.booked + '/' + cap.total + ' κλεισμένα)';
                    section.appendChild(note);
                }
            }
        } catch (e) {
            console.warn('Capacity check failed:', e);
        }

    } catch (err) {
        showToast('Σφάλμα αναζήτησης: ' + err.message, 'error');
    }
}

function renderAvailableRooms(rooms, checkoutMap = {}) {
    const container = document.getElementById('avail-rooms');
    if (!container) return;

    rooms.sort((a, b) => parseInt(a.RoomNumber) - parseInt(b.RoomNumber));

    if (rooms.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;font-size:12px;color:var(--text-muted);padding:8px 0;">Δεν υπάρχουν διαθέσιμα δωμάτια αυτού του τύπου.</div>';
        return;
    }

    container.innerHTML = rooms.map(r => {
        const state = typeof r.Status === 'string'
            ? mapDbStatusToUI(r.Status)
            : (hotelRooms.find(h => h.id == r.RoomNumber)?.state || 'free');
        let label, color;
        if (state === 'free') { label = 'Έτοιμο για νέο πελάτη'; color = '#1D9E75'; }
        else if (state === 'dirty') { label = 'Άδειο (χωρίς καθαριότητα)'; color = '#EAB308'; }
        else if (state === 'soon') { label = 'Προσεχώς άδειο'; color = '#F97316'; }
        else if (state === 'occ') { label = 'Κατειλημμένο'; color = '#DC2626'; }
        else { label = 'Έτοιμο για νέο πελάτη'; color = '#1D9E75'; }
        return `
        <div class="room-opt${selectedRoom === r.RoomNumber ? ' selected' : ''}"
             onclick="selectRoom(${r.RoomNumber}, this)"
             data-room="${r.RoomNumber}">
            <div style="font-weight:600;font-size:14px;">${r.RoomNumber}</div>
            <div style="font-size:10px;color:${color};">${label}</div>
        </div>
    `}).join('');
}

window.selectRoom = function(roomNum, el) {
    if (selectedRoom === roomNum) {
        selectedRoom = null;
        document.querySelectorAll('.room-opt').forEach(opt => {
            opt.classList.remove('selected');
            opt.style.display = '';
        });
        return;
    }
    selectedRoom = roomNum;
    document.querySelectorAll('.room-opt').forEach(opt => {
        const match = opt.dataset.room == roomNum;
        opt.classList.toggle('selected', match);
        opt.style.display = match ? '' : 'none';
    });
};

/* ==============================================================
   PRO CHECK-IN (WITH MODAL) & CHECK-OUT LOGIC
   ============================================================== */
let activeCheckinResId = null;
let activeCheckinRoom = null;

function openCheckinModal(reservationId, customerName, roomType = '', preAssignedRoom = null) {
    activeCheckinResId = reservationId;
    activeCheckinRoom = preAssignedRoom;

    let custEl = document.getElementById('modal-cust-name');
    let roomWrap = document.getElementById('modal-room-wrap');
    let assignedWrap = document.getElementById('modal-assigned-wrap');
    let select = document.getElementById('modal-room-select');
    let typeEl = document.getElementById('modal-room-type');

    if (!custEl || !roomWrap || !assignedWrap || !select) {
        const modal = document.createElement('div');
        modal.id = 'checkin-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
        <div class="pw-modal">
            <div class="pw-head">
                <i class="ti ti-key"></i>
                <span>Εκχώρηση Δωματίου</span>
                <span class="pw-close" onclick="closeModal()">&times;</span>
            </div>
            <div class="pw-body">
                <p style="margin-bottom:16px;font-size:13px;color:#6B7280;">
                    Πελάτης: <strong id="modal-cust-name" style="color:#111827;"></strong><br>
                    <span style="font-size:12px;color:#9CA3AF;">Τύπος Δωματίου: <strong id="modal-room-type" style="color:#111827;">—</strong></span>
                </p>
                <div id="modal-room-wrap" class="pw-field">
                    <label for="modal-room-select">Διαθέσιμο δωμάτιο:</label>
                    <select id="modal-room-select" style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;font-family:inherit;"></select>
                </div>
                <div id="modal-assigned-wrap" style="display:none;padding:10px 12px;border-radius:6px;background:#F3F4F6;font-size:13px;">
                    Θα γίνει check-in στο δωμάτιο <strong id="modal-assigned-val"></strong>
                </div>
            </div>
            <div class="pw-foot">
                <button class="btn" onclick="closeModal()">Ακύρωση</button>
                <button class="btn btn-dark" onclick="confirmCheckin()"><i class="ti ti-check"></i> Επιβεβαίωση</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        custEl = document.getElementById('modal-cust-name');
        roomWrap = document.getElementById('modal-room-wrap');
        assignedWrap = document.getElementById('modal-assigned-wrap');
        select = document.getElementById('modal-room-select');
        typeEl = document.getElementById('modal-room-type');
    }
    custEl.textContent = customerName;
    if (typeEl) typeEl.textContent = roomType || '—';
    
    if (preAssignedRoom) {
        roomWrap.style.display = 'none';
        assignedWrap.style.display = 'block';
        const assignedVal = document.getElementById('modal-assigned-val');
        if (assignedVal) assignedVal.textContent = preAssignedRoom;
    } else {
        roomWrap.style.display = 'block';
        assignedWrap.style.display = 'none';

        if (hotelRooms.length === 0) {
            showToast('Τα δωμάτια δεν έχουν φορτωθεί ακόμα.', 'error');
            return;
        }

        select.innerHTML = '<option value="">-- Επιλέξτε Δωμάτιο --</option>';

        let availableRooms = hotelRooms.filter(r => r.state === 'free');
        if (roomType) {
            availableRooms = availableRooms.filter(r => r.type === roomType);
        }

        if (availableRooms.length === 0) {
            select.innerHTML += '<option value="" disabled>Δεν υπάρχουν διαθέσιμα δωμάτια</option>';
        } else {
            availableRooms.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.textContent = `Δωμάτιο ${r.id} (${r.type})`;
                select.appendChild(opt);
            });
        }
    }

    document.getElementById('checkin-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('checkin-modal').style.display = 'none';
    activeCheckinResId = null;
    activeCheckinRoom = null;
}

async function confirmCheckin() {
    let selectedRoom = activeCheckinRoom;

    if (!selectedRoom) {
        selectedRoom = document.getElementById('modal-room-select').value;
    }

    if (!selectedRoom) {
        showToast('Πρέπει να επιλέξετε ένα δωμάτιο για τον πελάτη!', 'error');
        return;
    }

    try {
        if (!await window.showConfirm('Επιβεβαίωση check-in;')) return;

        await supabase.from('RESERVATION').update({ Status: 'CheckedIn' }).eq('ReservationID', activeCheckinResId);

        if (activeCheckinRoom) {
            await supabase.from('ROOM').update({ Status: 'occ' }).eq('RoomNumber', selectedRoom);
        } else {
            await supabase.from('RESERVATION_ROOM').insert([{ ReservationID: activeCheckinResId, RoomNumber: selectedRoom }]);
            await supabase.from('ROOM').update({ Status: 'occ' }).eq('RoomNumber', selectedRoom);
        }

        showToast(`Το Check-in ολοκληρώθηκε! Εκχωρήθηκε το δωμάτιο ${selectedRoom}.`, 'success');

        closeModal();
        fetchTodayReservations();
        fetchRoomsAndRender();

    } catch (err) {
        showToast("Σφάλμα κατά το Check-in: " + err.message, "error");
    }
}

async function doCheckout(btn, name, reservationId, roomNumber) {
    try {
        // 1. Fetch full reservation with customer data
        const { data: res, error: resErr } = await supabase
            .from('RESERVATION')
            .select('*, CUSTOMER ( FirstName, LastName, Phone, Email )')
            .eq('ReservationID', reservationId)
            .single();

        if (resErr) throw resErr;
        if (!res) throw new Error('Η κράτηση δεν βρέθηκε');

        // 2. Fetch minibar consumption for this reservation
        const { data: mbData, error: mbErr } = await supabase
            .from('MINIBAR_CONSUMPTION')
            .select('*, INVENTORY_ITEM ( Name )')
            .eq('ReservationID', reservationId);

        if (mbErr) throw mbErr;

        // 3. Calculate totals
        const roomCost = parseFloat(res.TotalCost) || 0;
        const mbItems = mbData || [];
        const minibarTotal = mbItems.reduce((s, r) => s + (parseFloat(r.Charge) || 0), 0);
        const total = roomCost + minibarTotal;
        const nights = Math.max(1, Math.round((new Date(res.CheckOutDate) - new Date(res.CheckInDate)) / 86400000));

        // 4. Build receipt data
        const receiptData = {
            customerName: name,
            reservationId,
            roomNumber,
            checkIn: res.CheckInDate,
            checkOut: res.CheckOutDate,
            nights,
            roomCost,
            minibarItems: mbItems,
            minibarTotal,
            total,
            paymentMethod: res.PaymentMethod || 'cash',
        };

        // 5. Show rich receipt confirmation modal
        const confirmed = await showReceiptModal(receiptData);
        if (!confirmed) return;

        // 6. Update reservation to CheckedOut
        await supabase.from('RESERVATION').update({ Status: 'CheckedOut' }).eq('ReservationID', reservationId);

        // 7. Mark room as dirty
        if (roomNumber && roomNumber !== '-') {
            await supabase.from('ROOM').update({ Status: 'dirty' }).eq('RoomNumber', roomNumber);
        }

        // 8. Generate and download receipt PDF (fire-and-forget with error toast)
        generateReceiptPDF(receiptData).catch(e => console.error('Receipt PDF error:', e));

        showToast(`Επιτυχές Check-out! Το δωμάτιο ${roomNumber} στάλθηκε για καθάρισμα.`, 'success');
        fetchTodayReservations();
        fetchRoomsAndRender();

    } catch (err) {
        showToast("Σφάλμα Check-out: " + err.message, "error");
    }
}

/* ==============================================================
   RECEIPT MODAL & PDF GENERATION
   ============================================================== */

function showReceiptModal(data) {
    return new Promise((resolve) => {
        const existing = document.querySelector('.receipt-overlay');
        if (existing) existing.remove();

        let mbRows = '';
        if (data.minibarItems && data.minibarItems.length > 0) {
            data.minibarItems.forEach(item => {
                const name = item.INVENTORY_ITEM?.Name || 'Είδος';
                mbRows += `<tr>
                    <td>${name}</td>
                    <td class="amount">${item.Quantity || 0}</td>
                    <td class="amount">€${(item.Charge || 0).toFixed(2)}</td>
                </tr>`;
            });
        } else {
            mbRows = '<tr><td colspan="3" style="text-align:center;color:#9CA3AF;padding:10px 0;">Δεν υπάρχουν χρεώσεις mini-bar</td></tr>';
        }

        const paymentLabels = { cash: 'Μετρητά (Cash)', card: 'Κάρτα (Card)', bank_transfer: 'Τραπεζικό Έμβασμα' };
        const paymentMethod = paymentLabels[data.paymentMethod] || data.paymentMethod || '—';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay receipt-overlay';
        overlay.innerHTML = `
            <div class="pw-modal receipt-modal">
                <div class="pw-head">
                    <i class="ti ti-receipt"></i>
                    <span>Απόδειξη Εξόδου — ${data.customerName}</span>
                    <span class="pw-close" id="receipt-close">&times;</span>
                </div>
                <div class="receipt-body">
                    <div class="receipt-paper">
                        <div class="receipt-header">
                            <h2>GRAND KAVALA</h2>
                            <div class="sub">Luxury Hotel &amp; Resort</div>
                            <div class="receipt-num">Απόδειξη #RCP-${data.reservationId}</div>
                        </div>
                        <div class="receipt-info">
                            <div><span class="label">Πελάτης:</span> <span class="value">${data.customerName}</span></div>
                            <div><span class="label">Δωμάτιο:</span> <span class="value">${data.roomNumber || '—'}</span></div>
                            <div><span class="label">Άφιξη:</span> <span class="value">${data.checkIn || '—'}</span></div>
                            <div><span class="label">Αναχώρηση:</span> <span class="value">${data.checkOut || '—'}</span></div>
                            <div><span class="label">Διανυκτερεύσεις:</span> <span class="value">${data.nights}</span></div>
                            <div><span class="label">Πληρωμή:</span> <span class="value">${paymentMethod}</span></div>
                        </div>
                        <table class="receipt-table">
                            <thead>
                                <tr><th style="width:55%">Περιγραφή</th><th style="width:15%" class="amount">Ποσ.</th><th style="width:30%" class="amount">Ποσό</th></tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Διαμονή (${data.nights} διαν.)</td>
                                    <td class="amount">${data.nights}</td>
                                    <td class="amount">€${(data.roomCost || 0).toFixed(2)}</td>
                                </tr>
                                ${mbRows}
                            </tbody>
                            <tfoot>
                                <tr class="total-row">
                                    <td colspan="2">Σύνολο</td>
                                    <td class="total-amount">€${(data.total || 0).toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                        <div class="receipt-footer">
                            Ευχαριστούμε για την προτίμησή σας! — Grand Kavala Luxury Hotel &amp; Resort
                        </div>
                    </div>
                </div>
                <div class="pw-foot">
                    <button class="btn" id="receipt-cancel">Ακύρωση</button>
                    <button class="btn btn-dark" id="receipt-confirm"><i class="ti ti-file-download"></i> Επιβεβαίωση &amp; PDF</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const close = () => { overlay.remove(); resolve(false); };
        const confirmAction = () => { overlay.remove(); resolve(true); };

        overlay.querySelector('#receipt-cancel').addEventListener('click', close);
        overlay.querySelector('#receipt-close').addEventListener('click', close);
        overlay.querySelector('#receipt-confirm').addEventListener('click', confirmAction);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'Enter') confirmAction();
        });
        overlay.querySelector('#receipt-confirm').focus();
    });
}

async function generateReceiptPDF(data) {
    const paymentLabels = { cash: 'Μετρητά (Cash)', card: 'Κάρτα (Card)', bank_transfer: 'Τραπεζικό Έμβασμα' };
    const paymentMethod = paymentLabels[data.paymentMethod] || data.paymentMethod || '—';

    let mbRows = '';
    if (data.minibarItems && data.minibarItems.length > 0) {
        data.minibarItems.forEach(item => {
            const name = item.INVENTORY_ITEM?.Name || 'Είδος';
            const charge = item.Charge || 0;
            mbRows += `<tr>
                <td style="padding:5px 4px;border-bottom:1px solid #F3F4F6;">${name}</td>
                <td style="padding:5px 4px;border-bottom:1px solid #F3F4F6;text-align:center;">${item.Quantity || 0}</td>
                <td style="padding:5px 4px;border-bottom:1px solid #F3F4F6;text-align:right;">€${charge.toFixed(2)}</td>
            </tr>`;
        });
    }

    const user = (() => { try { return JSON.parse(localStorage.getItem('hotel_user') || '{}'); } catch { return {}; } })();
    const userName = user.name || 'Χρήστης';
    const now = new Date();
    const dateStr = now.toLocaleDateString('el-GR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const filename = `GrandKavala_Receipt_${data.reservationId}`;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div style="width:190mm;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111827;background:#FFFFFF;">

            <!-- HEADER BAND -->
            <div style="background:linear-gradient(135deg,#1A2B4C 0%,#0F1D33 100%);padding:28px 30px 22px 30px;text-align:center;">
                <div style="color:#A8892A;font-size:10px;letter-spacing:3px;text-transform:uppercase;">Grand Kavala Luxury Hotel &amp; Resort</div>
                <div style="color:#FFFFFF;font-size:24px;font-weight:300;margin-top:6px;letter-spacing:.5px;">ΑΠΟΔΕΙΞΗ ΕΞΟΔΟΥ</div>
                <div style="color:rgba(255,255,255,.55);font-size:11px;margin-top:3px;">Check-out Receipt</div>
            </div>

            <div style="padding:24px 30px 10px 30px;">

                <!-- META -->
                <div style="display:flex;flex-wrap:wrap;gap:16px 28px;padding:0 0 18px 0;margin-bottom:22px;border-bottom:1px solid #E5E7EB;font-size:10px;color:#6B7280;">
                    <span><strong style="color:#374151;">Απόδειξη #:</strong> RCP-${data.reservationId}</span>
                    <span><strong style="color:#374151;">Ημερομηνία:</strong> ${dateStr}</span>
                    <span><strong style="color:#374151;">Υπάλληλος:</strong> ${userName}</span>
                </div>

                <!-- CUSTOMER INFO -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:11px;font-weight:600;color:#1A2B4C;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Στοιχεία Πελάτη</div>
                    <table style="width:100%;font-size:11px;border-collapse:collapse;">
                        <tr>
                            <td style="padding:3px 8px 3px 0;color:#6B7280;width:100px;">Ονοματεπώνυμο</td>
                            <td style="padding:3px 0;font-weight:500;">${data.customerName}</td>
                            <td style="padding:3px 8px 3px 0;color:#6B7280;width:80px;">Δωμάτιο</td>
                            <td style="padding:3px 0;font-weight:500;">${data.roomNumber || '—'}</td>
                        </tr>
                        <tr>
                            <td style="padding:3px 8px 3px 0;color:#6B7280;">Άφιξη</td>
                            <td style="padding:3px 0;font-weight:500;">${data.checkIn || '—'}</td>
                            <td style="padding:3px 8px 3px 0;color:#6B7280;">Αναχώρηση</td>
                            <td style="padding:3px 0;font-weight:500;">${data.checkOut || '—'}</td>
                        </tr>
                        <tr>
                            <td style="padding:3px 8px 3px 0;color:#6B7280;">Διανυκτερεύσεις</td>
                            <td style="padding:3px 0;font-weight:500;">${data.nights}</td>
                            <td style="padding:3px 8px 3px 0;color:#6B7280;">Πληρωμή</td>
                            <td style="padding:3px 0;font-weight:500;">${paymentMethod}</td>
                        </tr>
                    </table>
                </div>

                <!-- CHARGES TABLE -->
                <div style="margin-bottom:16px;">
                    <div style="font-size:11px;font-weight:600;color:#1A2B4C;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Αναλυτική Χρέωση</div>
                    <table style="width:100%;font-size:11px;border-collapse:collapse;">
                        <thead>
                            <tr style="background:#F9FAFB;">
                                <th style="padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#6B7280;font-weight:500;">Περιγραφή</th>
                                <th style="padding:7px 8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#6B7280;font-weight:500;width:60px;">Ποσ.</th>
                                <th style="padding:7px 8px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#6B7280;font-weight:500;width:90px;">Ποσό</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;">Διαμονή — ${data.nights} διανυκτερεύσεις</td>
                                <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;text-align:center;">${data.nights}</td>
                                <td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;text-align:right;">€${(data.roomCost || 0).toFixed(2)}</td>
                            </tr>
                            ${mbRows || '<tr><td style="padding:6px 8px;border-bottom:1px solid #F3F4F6;color:#9CA3AF;" colspan="3">Δεν υπάρχουν χρεώσεις mini-bar</td></tr>'}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td style="padding:8px 8px 4px;font-weight:600;font-size:13px;border-top:2px solid #1A2B4C;" colspan="2">Σύνολο</td>
                                <td style="padding:8px 8px 4px;text-align:right;font-weight:700;font-size:16px;color:#1A2B4C;border-top:2px solid #1A2B4C;">€${(data.total || 0).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

            </div>

            <!-- FOOTER -->
            <div style="padding:14px 30px;background:#F9FAFB;border-top:1px solid #E5E7EB;text-align:center;font-size:9px;color:#9CA3AF;line-height:1.7;">
                Grand Kavala Luxury Hotel &amp; Resort — Απόδειξη #RCP-${data.reservationId} — ${dateStr}
                <br>Ευχαριστούμε για την προτίμησή σας!
                <br>Έγγραφο δημιουργήθηκε από ${userName} — Εμπιστευτικό
            </div>
        </div>
    `;

    try {
        showToast('Η απόδειξη PDF δημιουργείται...', 'success');

        if (typeof html2pdf === 'undefined') {
            throw new Error('Η βιβλιοθήκη html2pdf δεν είναι φορτωμένη');
        }

        const opt = {
            margin: 10,
            filename: `${filename}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(wrap).save();

        showToast(`Η απόδειξη #RCP-${data.reservationId} αποθηκεύτηκε ως ${filename}.pdf`, 'success');

    } catch (err) {
        console.error('PDF generation error:', err);
        showToast('Σφάλμα κατά τη δημιουργία PDF: ' + err.message + '. Γίνεται λήψη εναλλακτικής μορφής...', 'error');

        // Fallback: create a plain text receipt and save as .txt
        try {
            const lines = [
                '========================================',
                '  GRAND KAVALA LUXURY HOTEL & RESORT',
                '  ΑΠΟΔΕΙΞΗ ΕΞΟΔΟΥ / CHECK-OUT RECEIPT',
                '========================================',
                '',
                `Απόδειξη #: RCP-${data.reservationId}`,
                `Ημερομηνία: ${dateStr}`,
                `Υπάλληλος: ${userName}`,
                '',
                '--- ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ ---',
                `Ονοματεπώνυμο: ${data.customerName}`,
                `Δωμάτιο: ${data.roomNumber || '—'}`,
                `Άφιξη: ${data.checkIn || '—'}`,
                `Αναχώρηση: ${data.checkOut || '—'}`,
                `Διανυκτερεύσεις: ${data.nights}`,
                `Πληρωμή: ${paymentMethod}`,
                '',
                '--- ΧΡΕΩΣΕΙΣ ---',
                `Διαμονή (${data.nights} διαν.): €${(data.roomCost || 0).toFixed(2)}`,
            ];
            if (data.minibarItems && data.minibarItems.length > 0) {
                data.minibarItems.forEach(item => {
                    const name = item.INVENTORY_ITEM?.Name || 'Είδος';
                    lines.push(`Mini-bar - ${name}: €${(item.Charge || 0).toFixed(2)}`);
                });
            }
            lines.push(
                '',
                `ΣΥΝΟΛΟ: €${(data.total || 0).toFixed(2)}`,
                '',
                '========================================',
                'Ευχαριστούμε για την προτίμησή σας!',
                'Grand Kavala Luxury Hotel & Resort',
                '========================================'
            );

            const blob = new Blob(["\ufeff" + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename}.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast(`Η απόδειξη αποθηκεύτηκε ως ${filename}.txt (εναλλακτική μορφή)`, 'success');
        } catch (fallbackErr) {
            console.error('Fallback download error:', fallbackErr);
            showToast('Αδυναμία λήψης της απόδειξης. Δοκιμάστε ξανά.', 'error');
        }
    }
}

/* ==============================================================
   ROOM SEARCH & BOOKING (v-room-search)
   ============================================================== */
let rsState = { checkIn: null, checkOut: null, selectedRoom: null, roomPrice: 0, roomType: '' };
let rsSort = { field: null, asc: true };

function sortRooms(field) {
    if (rsSort.field === field) { rsSort.asc = !rsSort.asc; }
    else { rsSort.field = field; rsSort.asc = true; }
    renderSearchResults(rsState.availableRooms);
}

window.searchAvailableRooms = async function () {
    const checkIn = document.getElementById('rs-checkin').value;
    const checkOut = document.getElementById('rs-checkout').value;

    if (!checkIn || !checkOut) {
        showToast('Επιλέξτε ημερομηνίες άφιξης και αναχώρησης.', 'error');
        return;
    }
    if (new Date(checkIn) >= new Date(checkOut)) {
        showToast('Η ημερομηνία αναχώρησης πρέπει να είναι μετά την άφιξη.', 'error');
        return;
    }

    try {
        const overlapping = await fetchOverlappingReservations(checkIn, checkOut);
        const ids = overlapping.map(r => r.ReservationID);
        const busyRoomRecords = await fetchBusyRoomNumbers(ids);
        const busyRoomNumbers = busyRoomRecords.map(r => r.RoomNumber);

        const { data: allRooms, error: allErr } = await supabase
            .from('ROOM')
            .select('*');

        if (allErr) throw allErr;

        const isCheckInToday2 = new Date(checkIn) <= new Date(new Date().toDateString());
        const allowedStatuses2 = isCheckInToday2 ? ['free'] : ['free', 'dirty', 'soon'];
        const available = (allRooms || []).filter(r =>
            !busyRoomNumbers.includes(r.RoomNumber) &&
            allowedStatuses2.includes(r.Status)
        );

        // Query checkout dates for 'occ' rooms
        let checkoutMap = {};
        const occNums = available.filter(r => r.Status === 'occ').map(r => r.RoomNumber);
        if (occNums.length > 0) {
            const { data: rrData } = await supabase
                .from('RESERVATION_ROOM')
                .select('RoomNumber, ReservationID')
                .in('RoomNumber', occNums);
            if (rrData && rrData.length > 0) {
                const ids = rrData.map(r => r.ReservationID);
                const { data: resData } = await supabase
                    .from('RESERVATION')
                    .select('ReservationID, CheckOutDate')
                    .in('ReservationID', ids)
                    .not('Status', 'in', '("Cancelled","CheckedOut")');
                if (resData) {
                    const map = {};
                    resData.forEach(r => map[r.ReservationID] = r.CheckOutDate);
                    rrData.forEach(rr => { if (map[rr.ReservationID]) checkoutMap[rr.RoomNumber] = map[rr.ReservationID]; });
                }
            }
        }
        rsState.checkoutMap = checkoutMap;
        rsState.availableRooms = available;
        rsState.checkIn = checkIn;
        rsState.checkOut = checkOut;
        renderSearchResults(available);

        // Show guest count / room requirement note
        const guestsEl = document.getElementById('rs-guests');
        const totalGuests = parseInt(guestsEl?.value) || 1;
        const noteEl = document.getElementById('rs-guest-note') || (() => {
            const el = document.createElement('div');
            el.id = 'rs-guest-note';
            el.style.cssText = 'margin-top:10px;font-size:11px;';
            document.getElementById('rs-results-card')?.querySelector('.card-hd')?.after(el);
            return el;
        })();

        // Group by room type for the note
        const typeCounts = {};
        available.forEach(r => { typeCounts[r.RoomType] = (typeCounts[r.RoomType] || 0) + 1; });
        let typeLines = Object.entries(typeCounts).map(([t, c]) => {
            const cap = ROOM_CAPACITY[t] || 2;
            const needed = Math.ceil(totalGuests / cap);
            return `${t}: ${c} διαθ. — χωρ. ${cap} άτομα — απαιτ. ${needed} δωμ. για ${totalGuests} άτομα`;
        }).join('<br>');

        noteEl.innerHTML = `
            <div style="background:#F4F6F9;border-radius:6px;padding:8px 10px;color:#374151;">
                <strong>${totalGuests} άτομο${totalGuests > 1 ? 'α' : ''}</strong> —
                ${typeLines}
            </div>
        `;

    } catch (err) {
        showToast('Σφάλμα αναζήτησης: ' + err.message, 'error');
    }
};

function renderSearchResults(rooms) {
    const card = document.getElementById('rs-results-card');
    const tbody = document.querySelector('#rs-results-table tbody');
    const count = document.getElementById('rs-count');
    if (!card || !tbody) return;

    card.style.display = 'block';

    if (!rooms || rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-text-secondary);padding:20px;">Δεν βρέθηκαν διαθέσιμα δωμάτια για τις επιλεγμένες ημερομηνίες.</td></tr>';
        count.textContent = '0 διαθέσιμα';
        return;
    }

    const sorted = [...rooms];
    if (rsSort.field) {
        const f = rsSort.field;
        sorted.sort((a, b) => {
            let va = a[f], vb = b[f];
            if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
            const cmp = va < vb ? -1 : va > vb ? 1 : 0;
            return rsSort.asc ? cmp : -cmp;
        });
    }

    document.querySelectorAll('#rs-results-table th[data-sort]').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (th.dataset.sort === rsSort.field) {
            arrow.textContent = rsSort.asc ? ' ▲' : ' ▼';
        } else {
            arrow.textContent = '';
        }
    });

    count.textContent = sorted.length + ' διαθέσιμα';
    const nights = Math.max(1, Math.round((new Date(rsState.checkOut) - new Date(rsState.checkIn)) / 86400000));
    tbody.innerHTML = sorted.map(r => {
        const st = r.Status;
        const isOcc = st === 'occ';
        const soon = isOcc && isSoonCheckout(rsState.checkoutMap[r.RoomNumber]);
        const label = st === 'free' || st === 'clean' ? 'Έτοιμο για νέο πελάτη' : st === 'dirty' ? 'Άδειο (χωρίς καθαριότητα)' : soon ? 'Προσεχώς άδειο' : 'Κατειλημμένο';
        const cls = st === 'free' || st === 'clean' ? 'p-g' : st === 'dirty' ? 'p-a' : soon ? 'p-a' : 'p-r';
        const { total: dynTotal } = calcDynamicPrice(r.BasePrice, r.RoomType, rsState.checkIn, rsState.checkOut, specialPricing, lowMultiplier);
        const dynPerNight = Math.round(dynTotal / nights);
        return `<tr>
            <td><strong>${r.RoomNumber}</strong></td>
            <td>${r.RoomType}</td>
            <td>€${dynPerNight}</td>
            <td><span class="pill ${cls}">${label}</span></td>
            <td>
                <button class="btn btn-sm btn-dark" onclick="openRsBookingModal('${r.RoomNumber}', '${r.RoomType}', ${r.BasePrice})">
                    <i class="ti ti-calendar-plus"></i> Book Now
                </button>
            </td>
        </tr>`;
    }).join('');
}

window.openRsBookingModal = function (roomNum, roomType, basePrice) {
    rsState.selectedRoom = roomNum;
    rsState.roomType = roomType;
    rsState.roomPrice = basePrice;

    const nights = Math.max(1, Math.round((new Date(rsState.checkOut) - new Date(rsState.checkIn)) / 86400000));

    // Calculate rooms needed from guest count
    const guestsEl = document.getElementById('rs-modal-guests');
    const totalGuests = parseInt(guestsEl?.value) || 1;
    const totalAvailable = rsState.availableRooms ? rsState.availableRooms.filter(r => r.RoomType === roomType).length : 1;
    const calc = calculateRoomRequirements(totalGuests, roomType, totalAvailable);

    const roomsNeeded = calc ? calc.roomsNeeded : 1;
    const { total: dynamicPerRoom } = calcDynamicPrice(basePrice, roomType, rsState.checkIn, rsState.checkOut, specialPricing, lowMultiplier);
    const total = dynamicPerRoom * roomsNeeded;
    const avgPerNight = nights > 0 ? Math.round(dynamicPerRoom / nights) : basePrice;

    rsState.roomsNeeded = roomsNeeded;
    rsState.roomPrice = basePrice;

    document.getElementById('rs-modal-room').textContent = '— Δωμάτιο ' + roomNum + (roomsNeeded > 1 ? ` (+${roomsNeeded - 1} ακόμα)` : '');
    document.getElementById('rs-modal-room-type').textContent = roomType;
    document.getElementById('rs-modal-nights').textContent = nights;
    document.getElementById('rs-modal-rate').textContent = '€' + (avgPerNight !== basePrice ? avgPerNight : basePrice) + ' (δυναμική τιμολόγηση)';
    document.getElementById('rs-modal-rooms').textContent = roomsNeeded;
    document.getElementById('rs-modal-total').textContent = '€' + total;

    // Summary note
    const summaryEl = document.getElementById('rs-modal-summary');
    if (summaryEl && calc) {
        if (calc.roomsNeeded > 1) {
            const distText = calc.distribution.map(g => `${g} άτομα`).join(' + ');
            summaryEl.innerHTML = `
                <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:8px 10px;color:#166534;">
                    <strong>${calc.totalGuests} άτομα</strong> — ${calc.roomsNeeded} δωμάτια (${distText})
                    ${calc.wastedBeds > 0 ? `<br>Κενές κλίνες: ${calc.wastedBeds}` : ''}
                </div>
            `;
        } else {
            summaryEl.innerHTML = '';
        }
    }

    document.getElementById('rs-booking-modal').style.display = 'flex';
};

function closeRsModal() {
    document.getElementById('rs-booking-modal').style.display = 'none';
}

window.confirmRsBooking = async function () {
    const firstName = document.getElementById('rs-modal-first').value.trim();
    const lastName = document.getElementById('rs-modal-last').value.trim();
    const phone = document.getElementById('rs-modal-phone').value.trim();
    const email = document.getElementById('rs-modal-email').value.trim();
    const bookingType = document.getElementById('rs-modal-btype').value;
    const paymentMethod = document.getElementById('rs-modal-payment').value;
    const totalGuests = parseInt(document.getElementById('rs-modal-guests')?.value) || 1;

    if (!firstName || !lastName || !phone || !email) {
        showToast('Παρακαλώ συμπληρώστε Όνομα, Επώνυμο, Τηλέφωνο και Email.', 'error');
        return;
    }

    // Calculate rooms needed
    const totalAvailable = rsState.availableRooms ? rsState.availableRooms.filter(r => r.RoomType === rsState.roomType).length : 1;
    const calc = calculateRoomRequirements(totalGuests, rsState.roomType, totalAvailable);
    const roomsNeeded = calc ? calc.roomsNeeded : 1;

    if (calc && !calc.canAccommodate) {
        showToast(`Αδυναμία φιλοξενίας ${totalGuests} ατόμων: απαιτούνται ${calc.roomsNeeded} δωμάτια, αλλά υπάρχουν μόνο ${calc.availableCount} διαθέσιμα.`, 'error');
        return;
    }

    // Collect room numbers: the selected room + additional ones from available list
    const roomNumbers = [Number(rsState.selectedRoom)];
    if (roomsNeeded > 1 && rsState.availableRooms) {
        const sameType = rsState.availableRooms
            .filter(r => r.RoomType === rsState.roomType && r.RoomNumber !== rsState.selectedRoom)
            .map(r => Number(r.RoomNumber));
        sameType.slice(0, roomsNeeded - 1).forEach(n => roomNumbers.push(n));
    }

    if (bookingType === 'phone' && paymentMethod === 'card') {
        const cardResult = validateAllCardFields('rs-modal');
        if (!cardResult.valid) {
            showToast(cardResult.errors[0], 'error');
            return;
        }
    }

    if (!await window.showConfirm(`Επιβεβαίωση κράτησης για ${totalGuests} άτομα — ${roomNumbers.join(', ')};`)) return;

    try {
        const { data: customer, error: custErr } = await supabase
            .from('CUSTOMER')
            .insert([{
                FirstName: firstName,
                LastName: lastName,
                Phone: phone,
                Email: email,
                IsGroup: (calc?.isGroup || bookingType === 'group')
            }])
            .select()
            .single();

        if (custErr) throw custErr;

        const nights = Math.max(1, Math.round((new Date(rsState.checkOut) - new Date(rsState.checkIn)) / 86400000));
        const { total: dynamicPerRoom } = calcDynamicPrice(rsState.roomPrice, rsState.roomType, rsState.checkIn, rsState.checkOut, specialPricing, lowMultiplier);
        const totalCost = dynamicPerRoom * roomsNeeded;

        // Atomic booking for all rooms
        const { data: result, error: rpcError } = await supabase
            .rpc('book_room_atomic', {
                p_customer_id: customer.CustomerID,
                p_check_in: rsState.checkIn,
                p_check_out: rsState.checkOut,
                p_total_cost: totalCost,
                p_status: 'Confirmed',
                p_room_numbers: roomNumbers
            });

        if (rpcError) {
            if (rpcError.message && rpcError.message.includes('ROOM_ALREADY_BOOKED')) {
                showToast('Η κράτηση απέτυχε: Κάποιο δωμάτιο μόλις κρατήθηκε από άλλον χρήστη.', 'error');
            } else {
                throw rpcError;
            }
            return;
        }

        const resId = result?.ReservationID;
        if (!resId) throw new Error('Αποτυχία δημιουργίας κράτησης');

        // Update reservation metadata
        const updates = { RoomType: rsState.roomType, PaymentMethod: paymentMethod, BookingType: bookingType, NumberOfGuests: totalGuests, Deposit: 0 };
        await supabase.from('RESERVATION').update(updates).eq('ReservationID', resId);

        // Create history entry
        const user = JSON.parse(localStorage.getItem('hotel_user') || '{}');
        await supabase.from('RESERVATION_HISTORY').insert([{
            ReservationID: resId,
            Action: 'created',
            ChangedBy: user.name || 'Σύστημα',
            ChangedByEmpID: user.id || null
        }]);

        const roomList = roomNumbers.join(', ');
        showToast(`Η κράτηση ολοκληρώθηκε! ${roomNumbers.length > 1 ? roomNumbers.length + ' δωμάτια' : 'Δωμάτιο'} ${roomList} — ${totalGuests} άτομα.`, 'success');
        closeRsModal();

        fetchTodayReservations();
        fetchRoomsAndRender();
        searchAvailableRooms();

    } catch (err) {
        showToast('Αποτυχία κράτησης: ' + err.message, 'error');
    }
};

/* ==============================================================
   SEARCH / FILTER FOR ARRIVALS & DEPARTURES
   ============================================================== */
function normalizeGreek(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/ς/g, 'σ');
}

function filterArrivals() {
    const q = normalizeGreek(document.getElementById('arrivals-search').value);
    document.querySelectorAll('#v-arrivals table tbody tr').forEach(row => {
        const name = normalizeGreek(row.cells[0]?.textContent || '');
        const room = normalizeGreek(row.cells[2]?.textContent || '');
        row.style.display = (name.includes(q) || room.includes(q)) ? '' : 'none';
    });
}
function filterDepartures() {
    const q = normalizeGreek(document.getElementById('departures-search').value);
    document.querySelectorAll('#v-departures table tbody tr').forEach(row => {
        const name = normalizeGreek(row.cells[0]?.textContent || '');
        const room = normalizeGreek(row.cells[1]?.textContent || '');
        row.style.display = (name.includes(q) || room.includes(q)) ? '' : 'none';
    });
}

/* ==============================================================
   ALL BOOKINGS VIEW (v-bookings)
   ============================================================== */
let allReservations = [];

async function fetchAllReservations() {
    try {
        const { data, error } = await supabase
            .from('RESERVATION')
            .select(`ReservationID, CheckInDate, CheckOutDate, TotalCost, Status, RoomType, PaymentMethod, Notes, NumberOfGuests, Deposit, BookingType, EditedAt, EditedBy, CUSTOMER ( CustomerID, FirstName, LastName, Phone, Email, IsGroup )`);

        if (error) throw error;

        const ids = (data || []).map(r => r.ReservationID);
        const roomMap = {};
        if (ids.length > 0) {
            const { data: rrData, error: rrErr } = await supabase
                .from('RESERVATION_ROOM')
                .select('ReservationID, RoomNumber')
                .in('ReservationID', ids);
            if (!rrErr && rrData) {
                rrData.forEach(r => { roomMap[r.ReservationID] = r.RoomNumber; });
            }
        }

        data.forEach(r => { r._roomNumber = roomMap[r.ReservationID] || '—'; });
        allReservations = data;
        renderAllBookings(data);
    } catch (err) {
        console.error('fetchAllReservations error:', err.message);
        showToast('Σφάλμα φόρτωσης κρατήσεων: ' + err.message, 'error');
    }
}

function renderAllBookings(reservations) {
    const tbody = document.getElementById('bk-body');
    const countEl = document.getElementById('bk-count');
    if (!tbody) return;

    if (!reservations || reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--color-text-secondary);padding:24px;">Δεν βρέθηκαν κρατήσεις.</td></tr>';
        if (countEl) countEl.textContent = '0 κρατήσεις';
        return;
    }

    if (countEl) countEl.textContent = reservations.length + ' κρατήσεις';

    const statusLabels = {
        'Confirmed': { label: 'Επιβεβαιωμένη', cls: 'p-g' },
        'CheckedIn': { label: 'Check-in', cls: 'p-b' },
        'CheckedOut': { label: 'Check-out', cls: 'p-r' },
        'Cancelled': { label: 'Ακυρωμένη', cls: 'p-a' }
    };

    tbody.innerHTML = reservations.map(r => {
        const c = r.CUSTOMER || {};
        const name = [c.FirstName, c.LastName].filter(Boolean).join(' ') || 'Άγνωστος';
        const type = c.IsGroup ? 'Γκρουπ' : 'Ιδιώτης';
        const st = statusLabels[r.Status] || { label: r.Status, cls: 'p-a' };
        const safeName = name.replace(/'/g, "\\'");
        const canCancel = r.Status === 'Confirmed';
        const canCheckin = r.Status === 'Confirmed';
        const isPast = new Date(r.CheckInDate) < new Date(new Date().toISOString().split('T')[0]);

        return `<tr>
            <td style="font-size:11px;color:var(--color-text-secondary)">${r.ReservationID}</td>
            <td><strong>${name}</strong></td>
            <td>${type}</td>
            <td>${r.CheckInDate}</td>
            <td>${r.CheckOutDate}</td>
            <td>${r._roomNumber}</td>
            <td>€${Number(r.TotalCost).toFixed(2)}</td>
            <td><span class="pill ${st.cls}">${st.label}</span></td>
            <td style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-sm" onclick="viewReservation(${r.ReservationID})" title="Λεπτομέρειες"><i class="ti ti-eye"></i></button>
                <button class="btn btn-sm" onclick="openEditReservationModal(${r.ReservationID})" title="Επεξεργασία"><i class="ti ti-edit"></i></button>
                ${canCheckin ? `<button class="btn btn-sm btn-dark" onclick="navTo('arrivals')" title="Check-in"><i class="ti ti-door-enter"></i></button>` : ''}
                ${canCancel ? `<button class="btn btn-sm" style="color:#E24B4A;" onclick="cancelReservation(${r.ReservationID})" title="Ακύρωση"><i class="ti ti-x"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

/* ==============================================================
   EDIT RESERVATION MODAL
   ============================================================== */
let editState = {};

function closeEditModal() {
    const overlay = document.getElementById('edit-reservation-overlay');
    if (overlay) overlay.remove();
    editState = {};
}

function recalcEditPrice() {
    const checkIn = document.getElementById('edit-checkin')?.value;
    const checkOut = document.getElementById('edit-checkout')?.value;
    const roomSelect = document.getElementById('edit-room');
    if (!roomSelect || !checkIn || !checkOut) return;

    const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
    const basePrice = parseFloat(roomSelect.options[roomSelect.selectedIndex]?.dataset?.price || editState.basePrice || 0);
    const manualTotal = parseFloat(document.getElementById('edit-total-cost')?.value) || 0;
    const deposit = parseFloat(document.getElementById('edit-deposit')?.value) || 0;

    const calcTotal = basePrice * nights;
    const total = manualTotal > 0 ? manualTotal : calcTotal;
    const balance = total - deposit;

    const nightsEl = document.getElementById('edit-nights');
    const totalDisplayEl = document.getElementById('edit-total-display');
    const balanceEl = document.getElementById('edit-balance');
    const depositDisplayEl = document.getElementById('edit-deposit-display');

    if (nightsEl) nightsEl.textContent = nights;
    if (totalDisplayEl) totalDisplayEl.textContent = `€${total.toFixed(2)}`;
    if (depositDisplayEl) depositDisplayEl.textContent = `€${deposit.toFixed(2)}`;
    if (balanceEl) balanceEl.textContent = `€${balance.toFixed(2)}`;
    if (balanceEl) balanceEl.style.color = balance <= 0 ? '#1D9E75' : '#DC2626';
}

window.openEditReservationModal = async function (reservationId) {
    const r = allReservations.find(x => x.ReservationID === reservationId);
    if (!r) { showToast('Η κράτηση δεν βρέθηκε.', 'error'); return; }

    const existing = document.getElementById('edit-reservation-overlay');
    if (existing) existing.remove();

    const c = r.CUSTOMER || {};
    const user = JSON.parse(localStorage.getItem('hotel_user') || '{}');

    editState = {
        reservationId: r.ReservationID,
        originalCustomer: { ...c },
        originalReservation: { ...r },
        basePrice: 0
    };

    const overlay = document.createElement('div');
    overlay.id = 'edit-reservation-overlay';
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `<div class="pw-modal edit-modal"><div class="edit-loading" id="edit-loading"><i class="ti ti-loader"></i>Φόρτωση στοιχείων...</div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEditModal(); });
    document.body.appendChild(overlay);

    try {
        const { data: rooms, error: roomsErr } = await supabase
            .from('ROOM')
            .select('*')
            .order('RoomNumber');
        if (roomsErr) throw roomsErr;

        const { data: rrData } = await supabase
            .from('RESERVATION_ROOM')
            .select('RoomNumber')
            .eq('ReservationID', r.ReservationID)
            .maybeSingle();
        const currentRoomNumber = rrData?.RoomNumber;

        const { data: historyData } = await supabase
            .from('RESERVATION_HISTORY')
            .select('*')
            .eq('ReservationID', r.ReservationID)
            .order('ChangedAt', { ascending: false })
            .limit(20);

        const roomOptionsHtml = rooms.map(room => {
            const isCurrent = room.RoomNumber === currentRoomNumber;
            const isFree = room.Status === 'free';
            const availableLabel = isFree ? '' : ' (κατειλημμένο)';
            const disabled = !isFree && !isCurrent;
            return `<option value="${room.RoomNumber}" 
                data-price="${room.BasePrice}" 
                data-type="${room.RoomType}"
                ${isCurrent ? 'selected' : ''} 
                ${disabled ? 'disabled' : ''}>
                Δωμ. ${room.RoomNumber} — ${room.RoomType} (€${room.BasePrice})${availableLabel}
            </option>`;
        }).join('');

        const roomPrice = rooms.find(rr => rr.RoomNumber === currentRoomNumber)?.BasePrice || 0;
        editState.basePrice = roomPrice;
        editState.currentRoomNumber = currentRoomNumber;
        editState.rooms = rooms;

        const bookingTypeLabels = {
            phone: 'Τηλεφωνική (20% Προκαταβολή)',
            prepaid: 'Προπληρωμένη (50% Προπληρωμή)',
            group: 'Γκρουπ (Ειδική Προκαταβολή)',
            walkin: 'Walk-in (Άμεση Πληρωμή)'
        };
        const statusLabels = {
            Confirmed: 'Επιβεβαιωμένη',
            CheckedIn: 'Check-in',
            CheckedOut: 'Check-out',
            Cancelled: 'Ακυρωμένη'
        };
        const paymentLabels = {
            cash: 'Μετρητά',
            card: 'Κάρτα',
            bank_transfer: 'Τραπεζικό Έμβασμα'
        };

        const btypeOptions = Object.entries(bookingTypeLabels).map(([v, lbl]) =>
            `<option value="${v}"${r.BookingType === v ? ' selected' : ''}>${lbl}</option>`
        ).join('');
        const statusOptions = Object.entries(statusLabels).map(([v, lbl]) =>
            `<option value="${v}"${r.Status === v ? ' selected' : ''}>${lbl}</option>`
        ).join('');
        const paymentOptions = Object.entries(paymentLabels).map(([v, lbl]) =>
            `<option value="${v}"${r.PaymentMethod === v ? ' selected' : ''}>${lbl}</option>`
        ).join('');

        const nights = Math.max(1, Math.round((new Date(r.CheckOutDate) - new Date(r.CheckInDate)) / 86400000));
        const total = parseFloat(r.TotalCost) || 0;
        const deposit = parseFloat(r.Deposit) || 0;
        const balance = total - deposit;

        let historyHtml = '';
        if (historyData && historyData.length > 0) {
            const actionLabels = {
                created: 'Δημιουργήθηκε',
                edited: 'Επεξεργασία',
                extended: 'Παράταση διαμονής',
                early_checkout: 'Πρόωρη αναχώρηση'
            };
            const actionDots = {
                created: 'created',
                edited: 'edited',
                extended: 'extended',
                early_checkout: 'early'
            };
            historyHtml = historyData.map(h => {
                const dot = actionDots[h.Action] || 'other';
                const label = actionLabels[h.Action] || h.Action;
                const date = new Date(h.ChangedAt).toLocaleString('el-GR');
                return `<div class="edit-history-item">
                    <span class="edit-history-dot ${dot}"></span>
                    <span class="edit-history-text"><strong>${label}</strong> από ${h.ChangedBy}</span>
                    <span class="edit-history-date">${date}</span>
                </div>`;
            }).join('');
        } else {
            historyHtml = '<div style="color:#9CA3AF;font-size:11px;">Δεν υπάρχει ιστορικό αλλαγών.</div>';
        }

        const createdHistory = historyData && historyData.find(h => h.Action === 'created');
        const createdDate = createdHistory ? new Date(createdHistory.ChangedAt).toLocaleString('el-GR') : '—';
        const createdBy = createdHistory?.ChangedBy || '—';

        overlay.innerHTML = `
        <div class="pw-modal edit-modal">
            <div class="pw-head">
                <i class="ti ti-edit"></i>
                <span>Επεξεργασία Κράτησης #${r.ReservationID}</span>
                <span class="pw-close" onclick="closeEditModal()">&times;</span>
            </div>
            <div class="pw-body">

                <!-- Guest Info -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-user"></i> Στοιχεία Πελάτη</div>
                    <div class="form-grid">
                        <div class="fg"><label>Όνομα *</label><input type="text" id="edit-first" value="${c.FirstName || ''}"></div>
                        <div class="fg"><label>Επώνυμο *</label><input type="text" id="edit-last" value="${c.LastName || ''}"></div>
                        <div class="fg"><label>Τηλέφωνο *</label><input type="tel" id="edit-phone" value="${c.Phone || ''}"></div>
                        <div class="fg"><label>Email *</label><input type="email" id="edit-email" value="${c.Email || ''}"></div>
                        <div class="fg"><label>Αριθμός Ατόμων</label><input type="number" id="edit-guests" min="1" max="20" value="${r.NumberOfGuests || 1}"></div>
                    </div>
                </div>

                <!-- Stay Details -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-building"></i> Στοιχεία Διαμονής</div>
                    <div class="form-grid">
                        <div class="fg"><label>Check-in *</label><input type="date" id="edit-checkin" value="${r.CheckInDate}" onchange="recalcEditPrice()"></div>
                        <div class="fg"><label>Check-out *</label><input type="date" id="edit-checkout" value="${r.CheckOutDate}" onchange="recalcEditPrice()"></div>
                        <div class="fg" style="grid-column:span 2;">
                            <label>Δωμάτιο</label>
                            <select id="edit-room" onchange="recalcEditPrice()">${roomOptionsHtml}</select>
                        </div>
                        <div class="fg"><label>Τύπος Κράτησης</label>
                            <select id="edit-btype">${btypeOptions}</select>
                        </div>
                        <div class="fg"><label>Κατάσταση</label>
                            <select id="edit-status">${statusOptions}</select>
                        </div>
                    </div>
                    <div id="edit-room-warning" class="edit-warning" style="display:none;margin-top:8px;"></div>
                </div>

                <!-- Payment -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-coin"></i> Στοιχεία Πληρωμής</div>
                    <div class="edit-summary">
                        <div>Τιμή δωματίου: <strong>€${roomPrice.toFixed(2)}</strong> /διαν.</div>
                        <div>Διανυκτερεύσεις: <strong id="edit-nights">${nights}</strong></div>
                        <div>Συνολικό Κόστος: <strong id="edit-total-display">€${total.toFixed(2)}</strong></div>
                        <div>Προκαταβολή: <strong id="edit-deposit-display">€${deposit.toFixed(2)}</strong></div>
                        <div>Υπόλοιπο: <strong id="edit-balance" style="color:${balance <= 0 ? '#1D9E75' : '#DC2626'}">€${balance.toFixed(2)}</strong></div>
                    </div>
                    <div class="form-grid">
                        <div class="fg"><label>Συνολικό Κόστος (€)</label><input type="number" id="edit-total-cost" step="0.01" value="${total.toFixed(2)}" onchange="recalcEditPrice()"></div>
                        <div class="fg"><label>Προκαταβολή (€)</label><input type="number" id="edit-deposit" step="0.01" value="${deposit.toFixed(2)}" onchange="recalcEditPrice()"></div>
                        <div class="fg"><label>Τρόπος Πληρωμής</label>
                            <select id="edit-payment">${paymentOptions}</select>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-notes"></i> Σημειώσεις</div>
                    <textarea id="edit-notes" rows="4" style="width:100%;padding:8px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;font-family:inherit;resize:vertical;">${r.Notes || ''}</textarea>
                </div>

                <!-- History -->
                <div class="edit-section">
                    <div class="edit-section-title"><i class="ti ti-history"></i> Ιστορικό Αλλαγών</div>
                    <div style="font-size:11px;color:#9CA3AF;margin-bottom:6px;">Δημιουργήθηκε: <strong>${createdDate}</strong> από <strong>${createdBy}</strong></div>
                    <div class="edit-history-list">${historyHtml}</div>
                </div>

                <div id="edit-save-warning" class="edit-warning" style="display:none;"></div>
            </div>
            <div class="pw-foot">
                <button class="btn" onclick="closeEditModal()">Ακύρωση</button>
                <button class="btn btn-dark" id="edit-save-btn" onclick="saveEditReservation()">
                    <i class="ti ti-check"></i> Αποθήκευση Αλλαγών
                </button>
            </div>
        </div>`;

    } catch (err) {
        overlay.innerHTML = `<div class="pw-modal edit-modal"><div class="edit-loading" style="color:#E24B4A;"><i class="ti ti-alert-circle"></i>Σφάλμα φόρτωσης: ${err.message}</div></div>`;
        showToast('Σφάλμα φόρτωσης: ' + err.message, 'error');
    }
};

window.saveEditReservation = async function () {
    const overlay = document.getElementById('edit-reservation-overlay');
    if (!overlay) return;

    const saveBtn = overlay.querySelector('#edit-save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Αποθήκευση...';

    try {
        const firstName = overlay.querySelector('#edit-first').value.trim();
        const lastName = overlay.querySelector('#edit-last').value.trim();
        const phone = overlay.querySelector('#edit-phone').value.trim();
        const email = overlay.querySelector('#edit-email').value.trim();
        const guests = parseInt(overlay.querySelector('#edit-guests').value) || 1;
        const checkIn = overlay.querySelector('#edit-checkin').value;
        const checkOut = overlay.querySelector('#edit-checkout').value;
        const roomNumber = parseInt(overlay.querySelector('#edit-room').value);
        const bookingType = overlay.querySelector('#edit-btype').value;
        const status = overlay.querySelector('#edit-status').value;
        const totalCost = parseFloat(overlay.querySelector('#edit-total-cost').value) || 0;
        const deposit = parseFloat(overlay.querySelector('#edit-deposit').value) || 0;
        const paymentMethod = overlay.querySelector('#edit-payment').value;
        const notes = overlay.querySelector('#edit-notes').value.trim();

        if (!firstName || !lastName || !phone || !email || !checkIn || !checkOut) {
            showToast('Συμπληρώστε Όνομα, Επώνυμο, Τηλέφωνο, Email και ημερομηνίες.', 'error');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
            return;
        }
        if (new Date(checkOut) <= new Date(checkIn)) {
            showToast('Η ημερομηνία αναχώρησης πρέπει να είναι μετά την άφιξη.', 'error');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
            return;
        }

        const rid = editState.reservationId;
        const orig = editState.originalReservation;
        const origCust = editState.originalCustomer;

        const changes = {};
        if (firstName !== origCust.FirstName) changes.Πελάτης = `${firstName} ${lastName}`;
        if (phone !== origCust.Phone) changes.Τηλέφωνο = phone;
        if (email !== origCust.Email) changes.Email = email;
        if (guests !== (orig.NumberOfGuests || 1)) changes.Άτομα = guests;
        if (checkIn !== orig.CheckInDate) changes.CheckIn = checkIn;
        if (checkOut !== orig.CheckOutDate) changes.CheckOut = checkOut;
        if (roomNumber !== editState.currentRoomNumber) changes.Δωμάτιο = roomNumber;
        if (bookingType !== (orig.BookingType || 'phone')) changes.Τύπος = bookingType;
        const editStatusLabels = { Confirmed: 'Επιβεβαιωμένη', CheckedIn: 'Check-in', CheckedOut: 'Check-out', Cancelled: 'Ακυρωμένη' };
        if (status !== orig.Status) changes.Κατάσταση = editStatusLabels[status] || status;
        if (Math.abs(totalCost - parseFloat(orig.TotalCost)) > 0.01) changes.Σύνολο = `€${totalCost}`;
        if (Math.abs(deposit - parseFloat(orig.Deposit || 0)) > 0.01) changes.Προκαταβολή = `€${deposit}`;
        if (paymentMethod !== (orig.PaymentMethod || 'cash')) changes.Πληρωμή = paymentMethod;
        if (notes !== (orig.Notes || '')) changes.Σημειώσεις = 'Ενημερώθηκαν';

        if (Object.keys(changes).length === 0) {
            showToast('Δεν υπάρχουν αλλαγές προς αποθήκευση.', 'info');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
            return;
        }

        // Room availability check if dates or room changed
        if (checkIn !== orig.CheckInDate || checkOut !== orig.CheckOutDate || roomNumber !== editState.currentRoomNumber) {
            const { data: overlapping } = await supabase
                .from('RESERVATION')
                .select('ReservationID')
                .lt('CheckInDate', checkOut)
                .gt('CheckOutDate', checkIn)
                .not('Status', 'in', '("Cancelled","CheckedOut")')
                .neq('ReservationID', rid);

            if (overlapping && overlapping.length > 0) {
                const ids = overlapping.map(r => r.ReservationID);
                const { data: busyRooms } = await supabase
                    .from('RESERVATION_ROOM')
                    .select('RoomNumber')
                    .in('ReservationID', ids);
                const busyNums = (busyRooms || []).map(r => r.RoomNumber);
                if (busyNums.includes(roomNumber)) {
                    showToast('Το δωμάτιο είναι ήδη κλεισμένο για αυτές τις ημερομηνίες.', 'error');
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
                    return;
                }
            }
        }

        const summaryLines = Object.entries(changes)
            .map(([k, v]) => `• ${k}: ${v}`).join('\n');

        if (!await window.showConfirm(
            `Αποθήκευση αλλαγών στην κράτηση #${rid};\n\nΑλλαγές:\n${summaryLines}`
        )) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
            return;
        }

        const user = JSON.parse(localStorage.getItem('hotel_user') || '{}');
        const editorName = user.name || 'Άγνωστος';
        const editorId = user.id || null;

        // Update CUSTOMER
        const { error: custErr } = await supabase
            .from('CUSTOMER')
            .update({
                FirstName: firstName,
                LastName: lastName,
                Phone: phone,
                Email: email
            })
            .eq('CustomerID', origCust.CustomerID);
        if (custErr) throw custErr;

        // Update RESERVATION
        const updateData = {
            CheckInDate: checkIn,
            CheckOutDate: checkOut,
            TotalCost: totalCost,
            Status: status,
            BookingType: bookingType,
            PaymentMethod: paymentMethod,
            NumberOfGuests: guests,
            Deposit: deposit,
            Notes: notes,
            EditedAt: new Date().toISOString(),
            EditedBy: editorName
        };

        // If room type changed, update it based on the selected room
        const selectedRoomData = editState.rooms.find(rr => rr.RoomNumber === roomNumber);
        if (selectedRoomData) {
            updateData.RoomType = selectedRoomData.RoomType;
        }

        const { error: resErr } = await supabase
            .from('RESERVATION')
            .update(updateData)
            .eq('ReservationID', rid);
        if (resErr) throw resErr;

        // Update RESERVATION_ROOM if room changed
        if (roomNumber !== editState.currentRoomNumber) {
            await supabase
                .from('RESERVATION_ROOM')
                .delete()
                .eq('ReservationID', rid);
            await supabase
                .from('RESERVATION_ROOM')
                .insert([{ ReservationID: rid, RoomNumber: roomNumber }]);
        }

        // Determine action type
        let action = 'edited';
        if (new Date(checkOut) > new Date(orig.CheckOutDate)) action = 'extended';
        else if (new Date(checkOut) < new Date(orig.CheckOutDate)) action = 'early_checkout';

        // Insert history
        await supabase
            .from('RESERVATION_HISTORY')
            .insert([{
                ReservationID: rid,
                Action: action,
                ChangedBy: editorName,
                ChangedByEmpID: editorId,
                OldValues: {
                    CheckInDate: orig.CheckInDate,
                    CheckOutDate: orig.CheckOutDate,
                    TotalCost: orig.TotalCost,
                    Status: orig.Status,
                    RoomNumber: editState.currentRoomNumber,
                    PaymentMethod: orig.PaymentMethod,
                    BookingType: orig.BookingType,
                    Notes: orig.Notes,
                    NumberOfGuests: orig.NumberOfGuests,
                    Deposit: orig.Deposit
                },
                NewValues: {
                    CheckInDate: checkIn,
                    CheckOutDate: checkOut,
                    TotalCost: totalCost,
                    Status: status,
                    RoomNumber: roomNumber,
                    PaymentMethod: paymentMethod,
                    BookingType: bookingType,
                    Notes: notes,
                    NumberOfGuests: guests,
                    Deposit: deposit
                }
            }]);

        showToast(`Η κράτηση #${rid} ενημερώθηκε επιτυχώς!`, 'success');
        closeEditModal();
        fetchAllReservations();
        fetchTodayReservations();
        fetchRoomsAndRender();

    } catch (err) {
        showToast('Σφάλμα αποθήκευσης: ' + err.message, 'error');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="ti ti-check"></i> Αποθήκευση Αλλαγών';
    }
};

window.filterBookings = function () {
    const q = normalizeGreek(document.getElementById('bk-search')?.value || '');
    const statusFilter = document.getElementById('bk-status-filter')?.value || 'all';

    let filtered = allReservations;

    if (statusFilter !== 'all') {
        filtered = filtered.filter(r => r.Status === statusFilter);
    }

    if (q) {
        filtered = filtered.filter(r => {
            const c = r.CUSTOMER || {};
            const name = normalizeGreek([c.FirstName, c.LastName].filter(Boolean).join(' '));
            const room = normalizeGreek(String(r._roomNumber || ''));
            return name.includes(q) || room.includes(q);
        });
    }

    renderAllBookings(filtered);
};

window.cancelReservation = async function (reservationId) {
    if (!await window.showConfirm('Είστε σίγουροι ότι θέλετε να ακυρώσετε αυτή την κράτηση;')) return;
    try {
        const { error } = await supabase
            .from('RESERVATION')
            .update({ Status: 'Cancelled' })
            .eq('ReservationID', reservationId);

        if (error) throw error;

        showToast('Η κράτηση ακυρώθηκε επιτυχώς.', 'success');
        fetchAllReservations();
        fetchTodayReservations();
    } catch (err) {
        showToast('Σφάλμα ακύρωσης: ' + err.message, 'error');
    }
};

window.viewReservation = function (reservationId) {
    const r = allReservations.find(x => x.ReservationID === reservationId);
    if (!r) return;
    const c = r.CUSTOMER || {};
    const name = [c.FirstName, c.LastName].filter(Boolean).join(' ') || 'Άγνωστος';
    const statusLabels = {
        'Confirmed': 'Επιβεβαιωμένη', 'CheckedIn': 'Check-in',
        'CheckedOut': 'Check-out', 'Cancelled': 'Ακυρωμένη'
    };
    const paymentLabels = { cash: 'Μετρητά', card: 'Κάρτα', bank_transfer: 'Τραπεζικό Έμβασμα' };
    const bookingTypeLabels = { phone: 'Τηλεφωνική', prepaid: 'Προπληρωμένη', group: 'Γκρουπ', walkin: 'Walk-in' };
    const deposit = parseFloat(r.Deposit) || 0;
    const balance = parseFloat(r.TotalCost) - deposit;
    alert(
        `Λεπτομέρειες Κράτησης #${r.ReservationID}\n` +
        `───────────────\n` +
        `Πελάτης: ${name}\n` +
        `Τηλέφωνο: ${c.Phone || '—'}\n` +
        `Email: ${c.Email || '—'}\n` +
        `Άτομα: ${r.NumberOfGuests || 1}\n` +
        `Check-in: ${r.CheckInDate}\n` +
        `Check-out: ${r.CheckOutDate}\n` +
        `Δωμάτιο: ${r._roomNumber}\n` +
        `Τύπος Κράτησης: ${bookingTypeLabels[r.BookingType] || r.BookingType || '—'}\n` +
        `Σύνολο: €${Number(r.TotalCost).toFixed(2)}\n` +
        `Προκαταβολή: €${deposit.toFixed(2)}\n` +
        `Υπόλοιπο: €${balance.toFixed(2)}\n` +
        `Τρόπος Πληρωμής: ${paymentLabels[r.PaymentMethod] || r.PaymentMethod || '—'}\n` +
        `Κατάσταση: ${statusLabels[r.Status] || r.Status}\n` +
        `Σημειώσεις: ${r.Notes || '—'}`
    );
};

/* ── Lightweight departures-only refresh (for auto-update) ── */

async function refreshDeparturesData() {
    const today = new Date().toISOString().split('T')[0];
    try {
        const { data: departures, error: depErr } = await supabase
            .from('RESERVATION')
            .select(`ReservationID, Status, TotalCost, CUSTOMER ( FirstName, LastName, IsGroup )`)
            .eq('CheckOutDate', today);
        if (depErr) throw depErr;

        const depList = departures || [];
        const depIds = depList.map(d => d.ReservationID);

        // Φόρτωση δωματίων
        const roomMap = {};
        if (depIds.length > 0) {
            const { data: rrData } = await supabase
                .from('RESERVATION_ROOM')
                .select('ReservationID, RoomNumber')
                .in('ReservationID', depIds);
            if (rrData) rrData.forEach(r => { roomMap[r.ReservationID] = r.RoomNumber; });
        }

        // Φόρτωση mini-bar
        const mbMap = await fetchMinibarForDepartures(depIds);

        depList.forEach(d => {
            d._roomNumber = roomMap[d.ReservationID] || '-';
            const mb = mbMap[d.ReservationID];
            d._mbTotal = mb ? mb.total : 0;
            d._mbItems = mb ? mb.items : [];
        });

        renderDepartures(depList);
    } catch (err) {
        console.error('Σφάλμα auto-refresh:', err.message);
    }
}

/* ==============================================================
   INITIALIZATION
   ============================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    while (!supabase) await new Promise(r => setTimeout(r, 50));

    const loader = document.getElementById('app-loader');
    if (loader) loader.style.display = 'none';
    document.querySelector('.app').style.display = 'flex';

    fetchRoomsAndRender();
    fetchTodayReservations();
    fetchAllReservations();
    await fetchRoomPrices();

    // Auto-refresh departures every 20 seconds (for mini-bar updates)
    setInterval(refreshDeparturesData, 20000);

    // Set default dates: today & today + 3 days
    const today = new Date();
    const plus3 = new Date(today);
    plus3.setDate(plus3.getDate() + 3);
    const fmt = d => d.toISOString().split('T')[0];
    const nbIn = document.getElementById('nb-in');
    const nbOut = document.getElementById('nb-out');
    if (nbIn) nbIn.value = fmt(today);
    if (nbOut) nbOut.value = fmt(plus3);
    const rsIn = document.getElementById('rs-checkin');
    const rsOut = document.getElementById('rs-checkout');
    if (rsIn) rsIn.value = fmt(today);
    if (rsOut) rsOut.value = fmt(plus3);
    if (document.getElementById('nb-rtype')) updatePrice();

    // Card section toggles
    document.getElementById('nb-btype')?.addEventListener('change', () => toggleCardSection('nb'));
    document.getElementById('nb-payment')?.addEventListener('change', () => toggleCardSection('nb'));
    document.getElementById('rs-modal-btype')?.addEventListener('change', () => toggleCardSection('rs-modal'));
    document.getElementById('rs-modal-payment')?.addEventListener('change', () => toggleCardSection('rs-modal'));

    // Card number auto-format
    ['nb-card-number', 'rs-modal-card-number'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19);
        });
    });

    // Expiry auto-format (MM/YY)
    ['nb-card-exp', 'rs-modal-card-exp'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', function () {
            const v = this.value.replace(/\D/g, '').slice(0, 4);
            this.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v;
        });
    });

    // CVV numeric only
    ['nb-card-cvv', 'rs-modal-card-cvv'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 4);
        });
    });

    // Refresh prices from DB every 60 seconds (picks up admin changes)
    setInterval(fetchRoomPrices, 60000);

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

setInterval(updateLiveTime, 60000);
updateLiveTime();

window.navTo = navTo;
window.logout = logout;
window.filterRooms = filterRooms;
window.updatePrice = updatePrice;
window.fetchAvailableRooms = fetchAvailableRooms;
window.submitBooking = submitBooking;
window.searchAvailableRooms = searchAvailableRooms;
window.sortRooms = sortRooms;
window.filterBookings = filterBookings;
window.fetchAllReservations = fetchAllReservations;
window.filterArrivals = filterArrivals;
window.filterDepartures = filterDepartures;
window.closeModal = closeModal;
window.confirmCheckin = confirmCheckin;
window.closeRsModal = closeRsModal;
window.confirmRsBooking = confirmRsBooking;
window.updatePrepay = updatePrepay;
window.updateRoomSummary = updateRoomSummary;
window.openCheckinModal = openCheckinModal;
window.cancelReservation = cancelReservation;
window.openEditReservationModal = openEditReservationModal;
window.closeEditModal = closeEditModal;
window.recalcEditPrice = recalcEditPrice;
window.viewReservation = viewReservation;
window.saveEditReservation = saveEditReservation;
window.doCheckout = doCheckout;