import { supabase } from './supabase-config.js';
import { calcDynamicPrice, fetchSpecialPricing, fetchOccupancyPercentage } from './services/api.js';

const ROOM_TYPE_INFO = {
    'Μονόκλινο': {
        display: 'Μονόκλινο Standard',
        img: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=600&q=80',
        desc: 'Άνετο δωμάτιο με θέα την πόλη, ιδανικό για επαγγελματίες ταξιδιώτες. 22 τ.μ.',
        features: [
            { icon: 'wifi', label: 'WiFi' },
            { icon: 'air-conditioning', label: 'A/C' },
            { icon: 'tv', label: 'Smart TV' },
            { icon: 'fridge', label: 'Mini-bar' }
        ]
    },
    'Δίκλινο': {
        display: 'Δίκλινο Deluxe',
        img: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80',
        desc: 'Μεγάλο δίκλινο με μπαλκόνι και θέα στο Αιγαίο. Ιδανικό για ζευγάρια. 32 τ.μ.',
        features: [
            { icon: 'wifi', label: 'WiFi' },
            { icon: 'air-conditioning', label: 'A/C' },
            { icon: 'building', label: 'Μπαλκόνι' },
            { icon: 'fridge', label: 'Mini-bar' }
        ]
    },
    'Φαρδύκλινο': {
        display: 'Φαρδύκλινο Superior',
        img: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=600&q=80',
        desc: 'Ευρύχωρο δωμάτιο με king-size κρεβάτι, καθιστικό και θέα θάλασσα. 40 τ.μ.',
        features: [
            { icon: 'wifi', label: 'WiFi' },
            { icon: 'bath', label: 'Μπανιέρα' },
            { icon: 'building', label: 'Μπαλκόνι' },
            { icon: 'fridge', label: 'Mini-bar' }
        ]
    },
    'Σουίτα': {
        display: 'Presidential Suite',
        img: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=600&q=80',
        desc: 'Κορυφαίο επίπεδο πολυτέλειας. Ξεχωριστό σαλόνι, jacuzzi, panoramic θέα θάλασσα. 90 τ.μ.',
        features: [
            { icon: 'wifi', label: 'WiFi' },
            { icon: 'bath', label: 'Jacuzzi' },
            { icon: 'sofa', label: 'Σαλόνι' },
            { icon: 'coffee', label: 'Πρωινό' }
        ]
    }
};


async function fetchAndRenderRooms() {
    const checkin = document.getElementById('s-in').value;
    const checkout = document.getElementById('s-out').value;
    const typeFilter = document.getElementById('s-type').value;
    const pax = document.getElementById('s-pax').value;
    const roomsRequested = parseInt(document.getElementById('s-rooms').value) || 1;
    const list = document.getElementById('rooms-list');

    if (pax === 'group') {
        list.innerHTML = `
            <div style="text-align:center;padding:2rem;color:#856404;background-color:#fff3cd;border:1px solid #ffeeba;border-radius:8px;width:100%;margin-bottom:20px;">
                <i class="ti ti-phone" style="font-size:2rem;display:block;margin-bottom:10px;"></i>
                <strong>Κράτηση για Γκρουπ</strong><br>
                Για κρατήσεις γκρουπ παρακαλούμε επικοινωνήστε μαζί μας τηλεφωνικά στο +30 2510 123456.
            </div>`;
        return;
    }

    if (!checkin || !checkout || checkin >= checkout) {
        list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary);width:100%;">Επιλέξτε έγκυρες ημερομηνίες.</div>';
        return;
    }

    list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary);width:100%;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;font-size:2rem;display:block;margin-bottom:1rem;"></i>Φόρτωση διαθέσιμων δωματίων...</div>';

    try {
        const { data: rooms, error: roomsErr } = await supabase
            .from('ROOM')
            .select('*')
            .in('Status', ['free', 'clean']);
        if (roomsErr) throw roomsErr;

        const { data: reservations, error: resErr } = await supabase
            .from('RESERVATION')
            .select('ReservationID, RoomType, RESERVATION_ROOM (RoomNumber)')
            .neq('Status', 'Cancelled')
            .lte('CheckInDate', checkout)
            .gte('CheckOutDate', checkin);
        if (resErr) throw resErr;

        const specialPricing = await fetchSpecialPricing();

        const occPct = await fetchOccupancyPercentage();
        const lowMultiplier = occPct < 60 ? 0.85 : 1.0;

        const bookedRooms = new Set();
        const typeBookedCount = {};
        (reservations || []).forEach(r => {
            const rr = r.RESERVATION_ROOM;
            const rooms = Array.isArray(rr) ? rr : (rr ? [rr] : []);
            if (rooms.length > 0) {
                rooms.forEach(rm => { if (rm.RoomNumber) bookedRooms.add(rm.RoomNumber); });
            } else if (r.RoomType) {
                typeBookedCount[r.RoomType] = (typeBookedCount[r.RoomType] || 0) + 1;
            }
        });

        const available = rooms.filter(r => !bookedRooms.has(r.RoomNumber));
        const availableCounts = {};
        available.forEach(r => {
            availableCounts[r.RoomType] = (availableCounts[r.RoomType] || 0) + 1;
        });

        let lowBannerHtml = '';
        if (lowMultiplier < 1) {
            lowBannerHtml = '<div style="background:#FFF3CD;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#856404;display:flex;align-items:center;gap:8px"><i class="ti ti-alert-triangle" style="font-size:1.2rem"></i><div><strong>Έκπτωση Χαμηλής Πληρότητας:</strong> Ισχύει αυτόματη έκπτωση 15% σε όλες τις τιμές λόγω χαμηλής πληρότητας (&lt;60%).</div></div>';
        }

        if (available.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary);width:100%;">Δεν βρέθηκαν διαθέσιμα δωμάτια για τις επιλεγμένες ημερομηνίες.</div>';
            return;
        }

        const byType = {};
        const typeMap = { mono: 'Μονόκλινο', dik: 'Δίκλινο', far: 'Φαρδύκλινο', suite: 'Σουίτα' };
        available.forEach(r => {
            if (typeFilter !== 'all' && r.RoomType !== typeMap[typeFilter]) return;
            if (!byType[r.RoomType]) byType[r.RoomType] = [];
            byType[r.RoomType].push(r);
        });

        const roomTypes = ['Μονόκλινο', 'Δίκλινο', 'Φαρδύκλινο', 'Σουίτα'];
        let html = '';

        roomTypes.forEach(type => {
            if (typeFilter !== 'all' && type !== typeMap[typeFilter]) return;

            const roomsOfType = byType[type];
            const info = ROOM_TYPE_INFO[type];
            if (!info) return;

            const effectiveCount = (availableCounts[type] || 0) - (typeBookedCount[type] || 0);

            if (!roomsOfType || effectiveCount < roomsRequested) {
                html += `
                <div class="room-card sold-out">
                    <div class="room-img">
                        <img src="${info.img}" alt="${type}" loading="lazy">
                        <span class="room-tag">Μη διαθέσιμο</span>
                    </div>
                    <div class="room-body">
                        <div class="room-name">${info.display}</div>
                        <div class="room-desc">${info.desc}</div>
                        <div class="room-features">
                            ${info.features.map(f => `<div class="feat"><i class="ti ti-${f.icon}" aria-hidden="true"></i> ${f.label}</div>`).join('')}
                        </div>
                        <div class="room-footer">
                            <div class="room-price" style="color:#9CA3AF;">Δεν επαρκούν τα δωμάτια</div>
                            <button class="btn-book" disabled>Μη διαθέσιμο</button>
                        </div>
                    </div>
                </div>`;
                return;
            }

            const cheapest = roomsOfType.reduce((a, b) => a.BasePrice < b.BasePrice ? a : b);
            const breakdown = calcDynamicPrice(cheapest.BasePrice, type, checkin, checkout, specialPricing, lowMultiplier);
            const totalNights = breakdown.groups.reduce((s, g) => s + g.count, 0);

            const finalTotal = breakdown.total * roomsRequested;

            const groupsHtml = breakdown.groups.map(g =>
                `<div style="font-size:13px;color:var(--color-text-secondary);margin:3px 0;display:flex;justify-content:space-between"><span>${g.count} νύχτες</span><span><strong>€${g.pricePerNight}</strong> <span style="display:inline-block;background:var(--color-background-secondary);padding:1px 8px;border-radius:4px;font-size:11px;margin-left:4px">${g.label}</span></span></div>`
            ).join('');

            const hasMixed = breakdown.groups.length > 1;

            html += `
                <div class="room-card">
                    <div class="room-img">
                        <img src="${info.img}" alt="${type}" loading="lazy">
                        <span class="room-tag tag-avail">Από €${cheapest.BasePrice}/βράδυ</span>
                    </div>
                    <div class="room-body">
                        <div class="room-name">${info.display}</div>
                        <div class="room-desc">${info.desc}</div>
                        <div class="room-features">
                            ${info.features.map(f => `<div class="feat"><i class="ti ti-${f.icon}" aria-hidden="true"></i> ${f.label}</div>`).join('')}
                        </div>
                        ${hasMixed ? `<div style="background:#FFF3CD;border-radius:6px;padding:8px 10px;margin:10px 0;font-size:12px;color:#856404;display:flex;align-items:center;gap:6px"><i class="ti ti-info-circle"></i> Οι τιμές διαφέρουν ανάλογα με την εποχή του χρόνου</div>` : ''}
                        <div style="margin:10px 0;padding:10px;background:var(--color-background-secondary);border-radius:8px">
                            ${groupsHtml}
                            <div style="border-top:1px solid var(--color-border-secondary);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-size:14px;font-weight:600"><span>Σύνολο (ανά δωμάτιο)</span><span style="color:#A8892A">€${breakdown.total.toLocaleString('el-GR')}</span></div>
                        </div>
                        <div class="room-footer">
                            <div class="room-price"><strong>€${finalTotal.toLocaleString('el-GR')}</strong> συνολικά (${roomsRequested} δωμάτια)</div>
                            <button class="btn-book" onclick="bookRoomPage('${type}', ${finalTotal}, '${checkin}', '${checkout}')">Κράτηση</button>
                        </div>
                    </div>
                </div>
            `;
        });

        if (!html) {
            list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary);width:100%;">Δεν βρέθηκαν δωμάτια για αυτόν τον τύπο.</div>';
            return;
        }

        list.innerHTML = lowBannerHtml + html;

    } catch (err) {
        console.error(err);
        list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary);width:100%;">Σφάλμα φόρτωσης δωματίων. Δοκιμάστε ξανά.</div>';
    }
}

window.bookRoomPage = function(roomType, totalCost, checkin, checkout) {
    const roomsRequested = document.getElementById('s-rooms').value;
    const pax = document.getElementById('s-pax').value;
    const queryParams = new URLSearchParams({
        room: roomType,
        totalCost: totalCost,
        checkin: checkin,
        checkout: checkout,
        rooms: roomsRequested,
        pax: pax
    }).toString();
    window.location.href = `../pages/booking.html?${queryParams}`;
};

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const plus4 = new Date(tomorrow);
    plus4.setDate(plus4.getDate() + 3);
    const fmt = d => d.toISOString().split('T')[0];

    const si = document.getElementById('s-in');
    const so = document.getElementById('s-out');
    const sp = document.getElementById('s-pax');
    const sr = document.getElementById('s-rooms');

    if (si) si.value = fmt(tomorrow);
    if (so) so.value = fmt(plus4);

    document.querySelector('.btn-search')?.addEventListener('click', () => fetchAndRenderRooms());
    [si, so, sp, sr].forEach(el => el?.addEventListener('change', () => fetchAndRenderRooms()));

    fetchAndRenderRooms();
});