import { getStatusLabel } from '../services/api.js';
import { formatDate } from '../utils/ui.js';
import { supabase } from '../supabase-config.js';

function showRoomModal(r, prefix, stateGr) {
    const existing = document.querySelector('.room-info-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay room-info-overlay';

    const statusColors = {
        'Έτοιμο για νέο πελάτη': '#1D9E75',
        'Άδειο (χωρίς καθαριότητα)': '#EAB308',
        'Προσεχώς άδειο': '#F97316',
        'Κατειλημμένο': '#DC2626'
    };
    const dotColor = statusColors[stateGr] || '#1D9E75';

    overlay.innerHTML = `
        <div class="inv-modal room-info-modal">
            <div class="room-info-colorbar" style="background:${dotColor}"></div>
            <div class="room-info-header">
                <h3>Δωμάτιο ${prefix}${r.id}</h3>
                <span class="room-info-close" id="room-info-close">&times;</span>
            </div>
            <div class="room-info-body">
                <div class="room-info-row">
                    <span class="ri-label">Τύπος:</span>
                    <span class="ri-value">${r.type || 'Άγνωστος'}</span>
                </div>
                <div class="room-info-row">
                    <span class="ri-label">Κατάσταση:</span>
                    <span class="ri-value">
                        <span style="width:10px;height:10px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0"></span>
                        ${stateGr}
                    </span>
                </div>
                ${r.checkOutDate ? `
                <div class="room-info-row">
                    <span class="ri-label">Αναχώρηση:</span>
                    <span class="ri-value">${formatDate(r.checkOutDate)}</span>
                </div>` : ''}
                <div class="room-info-row">
                    <span class="ri-label" id="ri-guest-label">${r.state === 'occ' ? 'Φιλοξενούμενος:' : 'Τελευταίος:'}</span>
                    <span class="ri-value" id="ri-guest-name"><i class="ti ti-loader"></i> Φόρτωση...</span>
                </div>
            </div>
            <div class="room-info-footer" style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="room-info-btn" id="room-info-close-btn">Κλείσιμο</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    (async () => {
        try {
            const roomNum = Number(r.id);
            const today = new Date().toISOString().slice(0, 10);

            const { data: rrData } = await supabase
                .from('RESERVATION_ROOM')
                .select('ReservationID')
                .eq('RoomNumber', roomNum);
            const resIds = (rrData || []).map(x => x.ReservationID);
            if (resIds.length === 0) {
                const el = overlay.querySelector('#ri-guest-name');
                if (el) el.textContent = '—';
                return;
            }

            const targetStatus = r.state === 'occ' ? 'occ' : 'past';
            let data;
            if (targetStatus === 'occ') {
                const res = await supabase
                    .from('RESERVATION')
                    .select('CustomerID')
                    .in('ReservationID', resIds)
                    .lte('CheckInDate', today)
                    .gte('CheckOutDate', today)
                    .not('Status', 'in', '("Cancelled","CheckedOut","Deleted")')
                    .limit(1)
                    .maybeSingle();
                data = res.data;
            } else {
                const res = await supabase
                    .from('RESERVATION')
                    .select('CustomerID')
                    .in('ReservationID', resIds)
                    .or('Status.eq.CheckedOut,CheckOutDate.lt.' + today)
                    .order('CheckOutDate', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                data = res.data;
            }

            if (data?.CustomerID) {
                const { data: cust } = await supabase
                    .from('CUSTOMER')
                    .select('FirstName, LastName')
                    .eq('CustomerID', data.CustomerID)
                    .maybeSingle();
                const el = overlay.querySelector('#ri-guest-name');
                if (el) el.textContent = cust ? `${cust.FirstName || ''} ${cust.LastName || ''}`.trim() : '—';
            } else {
                const el = overlay.querySelector('#ri-guest-name');
                if (el) el.textContent = '—';
            }
        } catch (_) {
            const el = overlay.querySelector('#ri-guest-name');
            if (el) el.textContent = '—';
        }
    })();

    const closeRmInfo = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeRmInfo(); });
    overlay.querySelector('#room-info-close').addEventListener('click', closeRmInfo);
    overlay.querySelector('#room-info-close-btn').addEventListener('click', closeRmInfo);
    const onKey = (e) => { if (e.key === 'Escape') closeRmInfo(); };
    document.addEventListener('keydown', onKey);
}

function renderCards(container, rooms, filter, options) {
    const { departures = [] } = options;

    const data = filter === 'all'
        ? rooms
        : rooms.filter(r => r.state === filter);

    if (data.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-secondary)">Δεν υπάρχουν δωμάτια για αυτό το φίλτρο.</div>';
        return;
    }

    const depRoomNums = new Set(departures.map(d => d.room));

    data.sort((a, b) => {
        const orderMap = { dirty: 0, occ: 1, cleaning: 2 };
        const oa = depRoomNums.has(a.num) && a.state === 'dirty' ? 0 : orderMap[a.state] || 2;
        const ob = depRoomNums.has(b.num) && b.state === 'dirty' ? 0 : orderMap[b.state] || 2;
        return oa - ob;
    });

    container.innerHTML = data.map(r => {
        const isUrgent = r.state === 'dirty';
        const isPriority = r.state === 'occ';
        const isInProgress = r.state === 'cleaning';
        const isFree = r.state === 'free';
        const isDep = depRoomNums.has(r.num);

        if (isDep && r.state === 'dirty') {
            const d = departures.find(x => x.room == r.num);
            if (d) {
                const mbHtml = d.mbTotal > 0
                    ? `<span class="pill p-b">€${d.mbTotal.toFixed(2)}</span>`
                    : '<span class="pill p-g" style="font-size:10px">—</span>';
                return `<div class="room-card" id="rc-${r.id}">
                    <div>
                        <div class="room-num">${r.num}</div>
                        <div class="room-type">${r.type}</div>
                    </div>
                    <div class="room-info">
                        <div style="font-size:12px;font-weight:500">${d.customerName}</div>
                        <div class="room-guest">Αναχώρηση σήμερα</div>
                    </div>
                    <div class="room-actions">
                        ${mbHtml}
                        <span class="pill p-r">Εκκρεμεί</span>
                        <button class="btn btn-sm btn-teal" onclick="window.markDepartureCleaned('${d.room}')"><i class="ti ti-check" aria-hidden="true"></i> Καθαρίστηκε</button>
                    </div>
                </div>`;
            }
        }

        if (isFree) {
            return `<div class="room-card" id="rc-${r.id}" style="opacity:.7">
                <div>
                    <div class="room-num">${r.num}</div>
                    <div class="room-type">${r.type}</div>
                </div>
                <div class="room-info">
                    <div style="font-size:12px;font-weight:500">Διαθέσιμο</div>
                    ${r.note ? `<div class="room-guest">${r.note}</div>` : ''}
                </div>
                <div class="room-actions">
                    <span class="pill p-g">Διαθέσιμο</span>
                    <button class="btn btn-sm" onclick="window.reportRoomIssue('${r.id}')"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Αναφορά</button>
                </div>
            </div>`;
        }

        if (r.state === 'done') {
            const ts = r.completedAt ? new Date(r.completedAt).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : '';
            return `<div class="room-card done" id="rc-${r.id}">
                <div>
                    <div class="room-num">${r.num}</div>
                    <div class="room-type">${r.type}</div>
                </div>
                <div class="room-info">
                    <div style="font-size:12px;font-weight:500">Ολοκληρώθηκε</div>
                    ${ts ? `<div class="room-guest">${ts}</div>` : ''}
                </div>
                <div class="room-actions">
                    <span class="pill p-g">Ολοκληρώθηκε</span>
                </div>
            </div>`;
        }

        const pillClass = isUrgent ? 'p-r' : isPriority ? 'p-a' : isInProgress ? 'p-t' : 'p-b';
        const pillText = isUrgent ? 'Επείγον' : isPriority ? 'Προτεραιότητα' : isInProgress ? 'Σε εξέλιξη' : 'Εκκρεμεί';
        const guestText = r.guest || (isUrgent ? 'Αναχώρηση' : '');
        return `<div class="room-card ${isUrgent ? 'urgent' : ''}" id="rc-${r.id}">
            <div>
                <div class="room-num">${r.num}</div>
                <div class="room-type">${r.type}</div>
            </div>
            <div class="room-info">
                <div style="font-size:12px;font-weight:500">${guestText || 'Κανονικός καθαρισμός'}</div>
                ${r.note ? `<div class="room-guest">${r.note}</div>` : ''}
            </div>
            <div class="room-actions">
                <span class="pill ${pillClass}">${pillText}</span>
                ${isInProgress
                    ? `<button class="btn btn-sm btn-dark" onclick="window.setRoomDone('${r.id}')"><i class="ti ti-check" aria-hidden="true"></i> Ολοκλήρωση</button>`
                    : `<button class="btn btn-sm btn-teal" onclick="window.setRoomInProgress('${r.id}')"><i class="ti ti-player-play" aria-hidden="true"></i> ${isUrgent ? 'Καθαρισμός' : 'Έναρξη'}</button>`
                }
                <button class="btn btn-sm" onclick="window.reportRoomIssue('${r.id}')"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Αναφορά</button>
            </div>
        </div>`;
    }).join('');
}

export function renderRoomMap(containerId, rooms, options = {}) {
    const { filter = 'all', onRoomClick = null, mode = 'grid' } = options;
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">Δεν βρέθηκαν δωμάτια στη βάση.</p>';
        return;
    }

    if (mode === 'cards') {
        renderCards(container, rooms, filter, options);
        return;
    }

    rooms.forEach(r => {
        if (filter !== 'all' && r.state !== filter) return;

        const d = document.createElement('div');
        d.className = 'rc rc-' + r.state;

        const prefix = r.type ? r.type.charAt(0).toUpperCase() + '-' : '';
        d.textContent = prefix + r.id;

        const stateGr = getStatusLabel(r.state);
        d.title = `${r.type || 'Άγνωστος Τύπος'} ${r.id} | ${stateGr}`;
        d.style.cursor = 'pointer';

        const handler = onRoomClick || showRoomModal;
        d.addEventListener('click', () => handler(r, prefix, stateGr));

        container.appendChild(d);
    });
    import { renderRoomMap } from './components/RoomMap.js';
}
