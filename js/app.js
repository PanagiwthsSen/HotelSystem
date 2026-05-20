import { supabase } from './supabase-config.js';

function calculateEaster(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

const SEASONS = {
    summer: {
        label: 'Καλοκαίρι',
        defaultMultiplier: 1.6,
        isActive: (d) => { const m = d.getMonth() + 1; return m >= 6 && m <= 8; }
    },
    xmas: {
        label: 'Χριστούγεννα',
        defaultMultiplier: 1.4,
        isActive: (d) => {
            const m = d.getMonth() + 1, day = d.getDate();
            return (m === 12 && day >= 15) || (m === 1 && day <= 7);
        }
    },
    easter: {
        label: 'Πάσχα',
        defaultMultiplier: 1.3,
        isActive: (d) => {
            const easter = calculateEaster(d.getFullYear());
            const start = new Date(easter); start.setDate(start.getDate() - 7);
            const end = new Date(easter); end.setDate(end.getDate() + 7);
            end.setHours(23, 59, 59, 999);
            return d >= start && d <= end;
        }
    }
};

function getSeasonForDate(date) {
    for (const [key, season] of Object.entries(SEASONS)) {
        if (season.isActive(date)) return key;
    }
    return null;
}

function getMultiplier(date) {
    const key = getSeasonForDate(date);
    return key ? SEASONS[key].defaultMultiplier : 1.0;
}

function getSeasonLabel(date) {
    const key = getSeasonForDate(date);
    return key ? SEASONS[key].label : 'Κανονική';
}

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

function calcPriceBreakdown(basePrice, checkin, checkout, roomType, specialPricing) {
    const start = new Date(checkin + 'T12:00:00');
    const end = new Date(checkout + 'T12:00:00');
    const groups = {};
    let total = 0;

    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        let price = basePrice;
        let label = getSeasonLabel(d);

        if (specialPricing && roomType) {
            const rules = specialPricing[roomType];
            if (rules) {
                const found = rules.find(r => {
                    const f = new Date(r.FromDate + 'T00:00:00');
                    const t = new Date(r.ToDate + 'T23:59:59');
                    return d >= f && d <= t;
                });
                if (found) {
                    price = found.Price;
                    label = 'Ειδική Τιμή';
                }
            }
        }

        if (label !== 'Ειδική Τιμή') {
            const mult = getMultiplier(d);
            price = Math.round(basePrice * mult);
        }

        if (!groups[label]) {
            groups[label] = { label, pricePerNight: price, count: 0, subtotal: 0 };
        }
        groups[label].count++;
        groups[label].subtotal += price;
        total += price;
    }

    return { groups: Object.values(groups), total };
}

async function fetchAndRenderRooms() {
    const checkin = document.getElementById('s-in').value;
    const checkout = document.getElementById('s-out').value;
    const typeFilter = document.getElementById('s-type').value;
    const list = document.getElementById('rooms-list');

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

        let specialPricing = {};
        try {
            const { data: spData } = await supabase.from('SPECIAL_PRICING').select('*');
            if (spData) {
                spData.forEach(r => {
                    if (!specialPricing[r.RoomType]) specialPricing[r.RoomType] = [];
                    specialPricing[r.RoomType].push(r);
                });
            }
        } catch (_) { /* table may not exist */ }

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

            if (!roomsOfType || effectiveCount <= 0) {
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
                            <div class="room-price" style="color:#9CA3AF;">Πλήρως κλεισμένο</div>
                            <button class="btn-book" disabled>Μη διαθέσιμο</button>
                        </div>
                    </div>
                </div>`;
                return;
            }

            const cheapest = roomsOfType.reduce((a, b) => a.BasePrice < b.BasePrice ? a : b);
            const breakdown = calcPriceBreakdown(cheapest.BasePrice, checkin, checkout, type, specialPricing);
            const totalNights = breakdown.groups.reduce((s, g) => s + g.count, 0);

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
                            <div style="border-top:1px solid var(--color-border-secondary);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-size:14px;font-weight:600"><span>Σύνολο</span><span style="color:#A8892A">€${breakdown.total.toLocaleString('el-GR')}</span></div>
                        </div>
                        <div class="room-footer">
                            <div class="room-price"><strong>€${breakdown.total.toLocaleString('el-GR')}</strong> συνολικά (${totalNights} νύχτες)</div>
                            <button class="btn-book" onclick="bookRoomPage('${type}', ${breakdown.total}, '${checkin}', '${checkout}')">Κράτηση</button>
                        </div>
                    </div>
                </div>
            `;
        });

        if (!html) {
            list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary);width:100%;">Δεν βρέθηκαν δωμάτια για αυτόν τον τύπο.</div>';
            return;
        }

        list.innerHTML = html;

    } catch (err) {
        console.error(err);
        list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary);width:100%;">Σφάλμα φόρτωσης δωματίων. Δοκιμάστε ξανά.</div>';
    }
}

window.bookRoomPage = function(roomType, totalCost, checkin, checkout) {
    const queryParams = new URLSearchParams({
        room: roomType,
        totalCost: totalCost,
        checkin: checkin,
        checkout: checkout
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
    if (si) si.value = fmt(tomorrow);
    if (so) so.value = fmt(plus4);

    document.querySelector('.btn-search')?.addEventListener('click', () => fetchAndRenderRooms());
    [si, so].forEach(el => el?.addEventListener('change', () => fetchAndRenderRooms()));

    fetchAndRenderRooms();
});
