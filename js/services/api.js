import { supabase } from '../supabase-config.js';

// ─── Season / Pricing helpers ───────────────────────────────

export function calculateEaster(year) {
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

export const SEASONS = {
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

export function getSeasonForDate(date) {
    for (const [key, season] of Object.entries(SEASONS)) {
        if (season.isActive(date)) return key;
    }
    return null;
}

export function getMultiplier(date, overrides = {}) {
    const key = getSeasonForDate(date);
    if (key && overrides[key] != null) return parseFloat(overrides[key]);
    return key ? SEASONS[key].defaultMultiplier : 1.0;
}

export async function fetchSeasonMultipliers() {
    try {
        const { data } = await supabase
            .from('NOTIFICATION')
            .select('Message')
            .eq('Type', 'pricing_config')
            .eq('TargetRole', 'both')
            .order('CreatedAt', { ascending: false })
            .limit(1);
        if (data && data[0]) {
            const m = JSON.parse(data[0].Message);
            return { summer: m.summer, xmas: m.xmas, easter: m.easter, low: m.low };
        }
    } catch (_) {}
    return {};
}

export function getSeasonLabel(date) {
    const key = getSeasonForDate(date);
    return key ? SEASONS[key].label : 'Κανονική';
}

export async function fetchSpecialPricing() {
    try {
        const { data: spData } = await supabase.from('SPECIAL_PRICING').select('*');
        if (!spData) return {};
        const grouped = {};
        spData.forEach(r => {
            if (!grouped[r.RoomType]) grouped[r.RoomType] = [];
            grouped[r.RoomType].push(r);
        });
        return grouped;
    } catch (_) { return {}; }
}

export async function fetchOccupancyPercentage() {
    try {
        const { count: occCount } = await supabase
            .from('ROOM')
            .select('*', { count: 'exact', head: true })
            .eq('Status', 'occ');
        const { count: totalCount } = await supabase
            .from('ROOM')
            .select('*', { count: 'exact', head: true });
        if (totalCount > 0) return Math.round((occCount / totalCount) * 100);
        return 0;
    } catch (_) { return 0; }
}

export function calcDynamicPrice(basePrice, roomType, checkIn, checkOut, specialPricing, lowMultiplier, seasonMultipliers = {}) {
    if (!checkIn || !checkOut) return { groups: [], total: 0 };
    const start = new Date(checkIn + 'T12:00:00');
    const end = new Date(checkOut + 'T12:00:00');
    const roomRules = specialPricing && roomType ? specialPricing[roomType] : null;
    const groups = {};
    let total = 0;

    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        let price = basePrice;
        let label = getSeasonLabel(d);

        if (roomRules) {
            const found = roomRules.find(r => {
                const f = new Date(r.FromDate + 'T00:00:00');
                const t = new Date(r.ToDate + 'T23:59:59');
                return d >= f && d <= t;
            });
            if (found) {
                price = found.Price;
                label = 'Ειδική Τιμή';
            }
        }

        if (label !== 'Ειδική Τιμή') {
            price = Math.round(basePrice * getMultiplier(d, seasonMultipliers));
        }
        if (lowMultiplier && lowMultiplier < 1) {
            price = Math.round(price * lowMultiplier);
            label = `${label} (Χ. Πληρ. -15%)`;
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

// ─── Existing helpers ───────────────────────────────────────

export function isSoonCheckout(checkOutDate) {
    if (!checkOutDate) return false;
    const d = new Date(checkOutDate);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    return d <= tomorrow;
}

export function getStatusLabel(state) {
    if (state === 'free') return 'Έτοιμο για νέο πελάτη';
    if (state === 'clean') return 'Καθαρίστηκε — Εκκρεμεί έλεγχος mini-bar';
    if (state === 'dirty') return 'Άδειο (χωρίς καθαριότητα)';
    if (state === 'cleaning') return 'Σε καθαρισμό';
    if (state === 'soon') return 'Προσεχώς άδειο';
    if (state === 'occ') return 'Κατειλημμένο';
    return 'Ελεύθερο';
}

export function mapDbStatusToUI(dbStatus) {
    switch (dbStatus) {
        case 'occ': return 'occ';
        case 'free': return 'free';
        case 'dirty': return 'dirty';
        case 'cleaning': return 'cleaning';
        case 'clean': return 'clean';
        default: return 'free';
    }
}

export async function buildCheckoutMap() {
    const map = {};
    try {
        const { data: rrData } = await supabase
            .from('RESERVATION_ROOM')
            .select('RoomNumber, ReservationID');
        if (!rrData || rrData.length === 0) return map;
        const ids = rrData.map(r => r.ReservationID);
        const { data: resData } = await supabase
            .from('RESERVATION')
            .select('ReservationID, CheckOutDate')
            .in('ReservationID', ids)
            .neq('Status', 'CheckedOut');
        if (resData) {
            const dateMap = {};
            resData.forEach(r => dateMap[r.ReservationID] = r.CheckOutDate);
            rrData.forEach(rr => { if (dateMap[rr.ReservationID]) map[rr.RoomNumber] = dateMap[rr.ReservationID]; });
        }
    } catch (err) {
        console.warn('buildCheckoutMap error:', err);
    }
    return map;
}

// ─── Room availability helpers (shared, DRY) ─────────────────

export async function fetchOverlappingReservations(checkIn, checkOut) {
    const { data, error } = await supabase
        .from('RESERVATION')
        .select('ReservationID, RoomType')
        .lt('CheckInDate', checkOut)
        .gt('CheckOutDate', checkIn)
        .not('Status', 'in', '("Cancelled","CheckedOut")');
    if (error) throw error;
    return data || [];
}

export async function fetchBusyRoomNumbers(reservationIds) {
    if (!reservationIds || reservationIds.length === 0) return [];
    const { data, error } = await supabase
        .from('RESERVATION_ROOM')
        .select('ReservationID, RoomNumber')
        .in('ReservationID', reservationIds);
    if (error) throw error;
    return data || [];
}

export async function fetchRoomTypeAvailability(roomType, checkIn, checkOut) {
    const [totalRes, overlapping] = await Promise.all([
        supabase.from('ROOM').select('RoomNumber').eq('RoomType', roomType),
        fetchOverlappingReservations(checkIn, checkOut)
    ]);
    if (totalRes.error) throw totalRes.error;
    const allRooms = totalRes.data || [];
    const total = allRooms.length;

    const ids = overlapping.map(r => r.ReservationID);
    const busyRooms = await fetchBusyRoomNumbers(ids);
    const busyRoomNums = new Set(busyRooms.map(r => r.RoomNumber));
    const assignedResIds = new Set(busyRooms.map(r => r.ReservationID));

    const occupiedRoomsOfType = allRooms.filter(r => busyRoomNums.has(r.RoomNumber)).length;
    const unassignedCount = overlapping.filter(r =>
        r.RoomType === roomType && !assignedResIds.has(r.ReservationID)
    ).length;

    const booked = occupiedRoomsOfType + unassignedCount;
    const available = Math.max(0, total - booked);

    return { total, booked, available, isFull: available <= 0 };
}

export async function fetchRooms() {
    const { data, error } = await supabase
        .from('ROOM')
        .select('RoomNumber, RoomType, Status')
        .order('RoomNumber', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function fetchArrivals(today) {
    const { data, error } = await supabase
        .from('RESERVATION')
        .select(`
            ReservationID, Status,
            CUSTOMER (FirstName, LastName),
            RESERVATION_ROOM (RoomNumber)
        `)
        .eq('CheckInDate', today)
        .not('Status', 'in', '("Cancelled","Deleted")');
    if (error) throw error;
    return data || [];
}

export async function fetchDepartures(today) {
    const { data, error } = await supabase
        .from('RESERVATION')
        .select(`
            ReservationID, Status,
            CUSTOMER (FirstName, LastName),
            RESERVATION_ROOM (RoomNumber)
        `)
        .eq('CheckOutDate', today)
        .not('Status', 'in', '("Cancelled","Deleted","CheckedIn","CheckedOut")');
    if (error) throw error;
    return data || [];
}
