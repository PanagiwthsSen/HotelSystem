import { supabase } from './supabase-config.js';

document.addEventListener("DOMContentLoaded", async () => {
    setTimeout(() => {
        const loader = document.getElementById("app-loader");
        const app = document.querySelector(".app");
        if(loader) loader.style.display = "none";
        if(app) app.style.display = "flex";
    }, 800);

    startClock();

    const navItems = document.querySelectorAll('.sb-item');
    const views = document.querySelectorAll('.view');
    const tbTitle = document.getElementById('tb-title');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            views.forEach(view => view.classList.remove('active'));
            item.classList.add('active');
            const targetView = item.getAttribute('data-v');
            document.getElementById(`v-${targetView}`).classList.add('active');
            tbTitle.innerText = item.innerText;
        });
    });

    const taskCard = document.querySelector('#v-schedule-zones .card');
    document.querySelectorAll('#v-events .room-card[data-tasks]').forEach(card => {
        const eventId = card.dataset.eventId;
        const eventDate = card.dataset.eventDate || '';
        let tasks;
        try { tasks = JSON.parse(card.dataset.tasks); } catch (e) { return; }
        tasks.forEach(t => {
            const row = document.createElement('div');
            row.className = 'minibar-row task-row';
            row.dataset.eventId = eventId;
            if (eventDate) row.dataset.eventDate = eventDate;
            row.innerHTML = '<div class="mb-items"><strong>' + t.name + '</strong> (' + t.location + ')</div><span class="pill p-r task-badge" onclick="cycleTask(this)" style="cursor:pointer">Εκκρεμεί</span>';
            taskCard.appendChild(row);
        });
    });
    sortTaskRows();
    await refreshAll();

    // Real-time subscriptions (live updates)
    supabase.channel('gardener-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'NOTIFICATION' }, async (payload) => {
        if (payload.new && ['gardener', 'both'].includes(payload.new.TargetRole)) {
          await refreshAll();
        }
      }).subscribe();

    // Fallback polling every 2 minutes in case WebSocket disconnects
    setInterval(refreshAll, 120000);

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

async function refreshAll() {
    await fetchGardenerTasks();
    sortTaskRows();
    cleanupGardenerPage();
    updateBadgeTasks();
    updateDoneCount();
    updateUrgentTasks();
    const eventCards = document.querySelectorAll('#v-events .room-card');
    const ovCount = document.getElementById('ov-events-count');
    const ovSub = document.getElementById('ov-events-sub');
    if (ovCount) ovCount.textContent = eventCards.length;
    updateBadgeEvents();
    if (ovSub && eventCards.length > 0) {
        const firstLocation = eventCards[0].querySelector('.room-type');
        if (firstLocation) {
            const loc = firstLocation.textContent.replace('Τοποθεσία: ', '').split('|')[0].trim();
            ovSub.textContent = loc;
        }
    }
    updateOverview();
    await fetchGardenerNotifs();
    await fetchSupplyRequests();
    document.querySelectorAll('.room-card[data-event-id]').forEach(card => {
        checkEventComplete(card.dataset.eventId);
    });
}

window.navTo = function(viewId) {
    const targetItem = document.querySelector(`.sb-item[data-v="${viewId}"]`);
    if(targetItem) targetItem.click();
};

window.cycleTask = function(badge) {
    const text = badge.innerText;

    if (text === 'Εκκρεμεί') {
        badge.className = 'pill p-a task-badge';
        badge.innerText = 'Σε εξέλιξη';
    } else if (text === 'Σε εξέλιξη') {
        badge.className = 'pill p-g task-badge';
        badge.innerText = 'Ολοκληρώθηκε';
        badge.style.pointerEvents = 'none';
        badge.style.cursor = 'default';
        showToast('task-toast');
        updateDoneCount();
        updateBadgeTasks();
        updateOverview();

        const row = badge.closest('.task-row');
        const eventId = row ? row.dataset.eventId : null;
        if (eventId) checkEventComplete(eventId);
        const notifId = row ? row.dataset.notifId : null;
        if (notifId) resolveGardenerNotif(notifId);
    }
    updateUrgentTasks();
}

function updateDoneCount() {
    const rows = document.querySelectorAll('#v-schedule-zones .task-row');
    const badges = document.querySelectorAll('#v-schedule-zones .task-row .pill.p-g');
    const total = rows.length;
    const done = badges.length;
    const doneEl = document.getElementById('done-count');
    const totalEl = document.getElementById('total-count');
    if (doneEl) doneEl.textContent = done;
    if (totalEl) totalEl.textContent = total;
}

function updateUrgentTasks() {
    const container = document.getElementById('urgent-tasks-container');
    if (!container) return;
    const allRows = [...document.querySelectorAll('#v-schedule-zones .task-row')];
    const nonCompleted = allRows.filter(r => {
        const pill = r.querySelector('.pill');
        return pill && pill.innerText !== 'Ολοκληρώθηκε';
    });

    if (nonCompleted.length === 0) {
        container.innerHTML = '<div style="font-size:12px;color:var(--color-text-tertiary);padding:8px;text-align:center">✓ Όλες οι εργασίες ολοκληρώθηκαν!</div>';
        return;
    }

    const shown = nonCompleted.filter(r => r.dataset.urgentShown === 'true');
    const notShown = nonCompleted.filter(r => r.dataset.urgentShown !== 'true');
    const slotsLeft = 4 - shown.length;

    let toShow;
    if (slotsLeft > 0 && notShown.length > 0) {
        const newOnes = notShown.slice(0, slotsLeft);
        newOnes.forEach(r => r.dataset.urgentShown = 'true');
        toShow = [...shown, ...newOnes];
    } else if (shown.length > 0) {
        toShow = shown;
    } else {
        toShow = notShown.slice(0, 4);
        toShow.forEach(r => r.dataset.urgentShown = 'true');
    }

    container.innerHTML = toShow.map(r => {
        const title = r.querySelector('.mb-items strong');
        const loc = r.querySelector('.mb-items');
        const pill = r.querySelector('.pill');
        const name = title ? title.textContent : '';
        const location = loc ? loc.textContent.replace(name, '').trim().replace(/^\(|\)$/g, '') : '';
        const statusClass = pill ? pill.className.replace('task-badge', '').trim() : 'p-r';
        const statusText = pill ? pill.textContent : 'Εκκρεμεί';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--color-background-secondary);border-radius:var(--border-radius-md)">' +
          '<div><div style="font-weight:500;font-size:12px">' + name + '</div><div style="font-size:11px;color:var(--color-text-secondary)">' + location + '</div></div>' +
          '<span class="' + statusClass + '">' + statusText + '</span></div>';
    }).join('');
}

window.toggleZone = function(element) {
    const state = element.dataset.state;

    if (state === 'pending') {
        element.dataset.state = 'progress';
        element.style.background = '#FAEEDA';
        element.style.borderColor = '#FAC775';
        element.querySelector('.sc-lbl').style.color = '#633806';
        element.querySelector('.sc-val').style.color = '#633806';
        element.querySelector('.sc-sub').style.color = '#633806';
        element.querySelector('.sc-sub').innerText = 'Σε εξέλιξη';
        element.querySelector('i').className = 'ti ti-alert-circle';
        element.querySelector('i').style.color = '#BA7517';
    } else if (state === 'progress') {
        element.dataset.state = 'done';
        element.style.background = '#EAF3DE';
        element.style.borderColor = '#C0DD97';
        element.querySelector('.sc-lbl').style.color = '#27500A';
        element.querySelector('.sc-val').style.color = '#27500A';
        element.querySelector('.sc-sub').style.color = '#27500A';
        element.querySelector('.sc-sub').innerText = 'Ολοκληρώθηκε';
        element.querySelector('i').className = 'ti ti-check';
        element.querySelector('i').style.color = '#1D9E75';
    }
    updateBadgeTasks();
    updateOverview();

    document.querySelectorAll('.room-card[data-event-id]').forEach(c => checkEventComplete(c.dataset.eventId));
}

function updateBadgeTasks() {
    const allTasks = document.querySelectorAll('#v-schedule-zones .task-row').length;
    const doneTasks = document.querySelectorAll('#v-schedule-zones .task-row .pill.p-g').length;
    const incompleteTasks = allTasks - doneTasks;

    const allZones = document.querySelectorAll('#v-schedule-zones .sc').length;
    const doneZones = document.querySelectorAll('#v-schedule-zones .sc[data-state="done"]').length;
    const incompleteZones = allZones - doneZones;

    const count = incompleteTasks + incompleteZones;
    const badge = document.getElementById('badge-tasks');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count === 0 ? 'none' : '';
    }
}

function updateBadgeEvents() {
    const incomplete = document.querySelectorAll('.room-card[data-event-id]:not(.done)').length;
    const badge = document.getElementById('badge-events');
    if (badge) {
        badge.textContent = incomplete;
        badge.style.display = incomplete === 0 ? 'none' : '';
    }
}

async function fetchGardenerTasks() {
    if (!supabase) return;
    const taskCard = document.querySelector('#v-schedule-zones .card');
    if (!taskCard) return;
    const { data, error } = await supabase
        .from('NOTIFICATION')
        .select('NotificationID, Message, CreatedAt')
        .eq('TargetRole', 'gardener')
        .eq('IsRead', false)
        .eq('Type', 'gardener_task')
        .order('CreatedAt', { ascending: true });
    if (error || !data) return;
    data.forEach(n => {
        if (document.querySelector(`.task-row[data-notif-id="${n.NotificationID}"]`)) return;
        const msg = n.Message || '';
        if (msg.startsWith('{')) {
            try {
                const ev = JSON.parse(msg);
                if (ev.tasks && Array.isArray(ev.tasks)) {
                    const eventId = 'notif-' + n.NotificationID;
                    const tasksJson = JSON.stringify(ev.tasks);
                    ev.tasks.forEach(t => {
                        const row = document.createElement('div');
                        row.className = 'minibar-row task-row';
                        row.dataset.notifId = n.NotificationID;
                        row.dataset.eventId = eventId;
                        if (ev.eventDate) row.dataset.eventDate = ev.eventDate;
                        row.innerHTML = '<div class="mb-items"><strong>' + (t.name || 'Εργασία') + '</strong>' + (t.location ? ' (' + t.location + ')' : '') + '</div><span class="pill p-r task-badge" onclick="cycleTask(this)" style="cursor:pointer">Εκκρεμεί</span>';
                        taskCard.appendChild(row);
                    });
                    if (ev.eventTitle) {
                        const eventList = document.querySelector('#v-events .room-list');
                        if (eventList) {
                            const dateStr = ev.eventDate ? new Date(ev.eventDate + 'T00:00:00').toLocaleDateString('el-GR') : '—';
                            const card = document.createElement('div');
                            card.className = 'room-card';
                            card.dataset.eventId = eventId;
                            if (ev.eventDate) card.dataset.eventDate = ev.eventDate;
                            card.dataset.tasks = tasksJson;
                            card.innerHTML = '<div class="room-num" style="font-size:24px"><i class="ti ti-calendar-event"></i></div>' +
                                '<div class="room-info"><div style="font-weight:600;font-size:14px">' + ev.eventTitle + '</div>' +
                                '<div class="room-type">Ημερομηνία: ' + dateStr + '</div>' +
                                '<div class="room-guest" style="color:#791F1F;font-weight:500">Απαίτηση: ' + ev.tasks.map(t => t.name).join(', ') + '</div></div>';
                            eventList.appendChild(card);
                        }
                    }
                    return;
                }
            } catch (_) {}
        }
        const parts = msg.split('||');
        const name = parts[0] || 'Εργασία';
        const location = parts[1] || '';
        const row = document.createElement('div');
        row.className = 'minibar-row task-row';
        row.dataset.notifId = n.NotificationID;
        row.innerHTML = '<div class="mb-items"><strong>' + name + '</strong>' + (location ? ' (' + location + ')' : '') + '</div><span class="pill p-r task-badge" onclick="cycleTask(this)" style="cursor:pointer">Εκκρεμεί</span>';
        taskCard.appendChild(row);
    });
}

async function resolveGardenerNotif(notifId) {
    if (!supabase || !notifId) return;
    const siblings = document.querySelectorAll(`.task-row[data-notif-id="${notifId}"]`);
    if (siblings.length > 0) {
        const allDone = [...siblings].every(r => {
            const pill = r.querySelector('.pill');
            return pill && pill.classList.contains('p-g');
        });
        if (!allDone) return;
    }
    try {
        await supabase.from('NOTIFICATION').update({ IsRead: true }).eq('NotificationID', notifId);
    } catch (_) {}
}

function cleanupGardenerPage() {
    document.querySelectorAll('#v-schedule-zones .task-row:not([data-notif-id]) .pill.p-g').forEach(pill => {
        const row = pill.closest('.task-row');
        if (row) row.remove();
    });
    const today = new Date().toISOString().split('T')[0];
    const notifIdsToRead = [];
    document.querySelectorAll('#v-events .room-card[data-event-date]').forEach(card => {
        if (card.dataset.eventDate < today) {
            const eventId = card.dataset.eventId;
            if (eventId) {
                document.querySelectorAll(`.task-row[data-event-id="${eventId}"]`).forEach(r => {
                    if (r.dataset.notifId) notifIdsToRead.push(r.dataset.notifId);
                    r.remove();
                });
            }
            card.remove();
        }
    });
    if (supabase && notifIdsToRead.length > 0) {
        supabase.from('NOTIFICATION').update({ IsRead: true }).in('NotificationID', notifIdsToRead).then();
    }
}

function updateOverview() {
    const taskRows = document.querySelectorAll('#v-schedule-zones .task-row');
    const totalTasks = taskRows.length;
    const doneTasks = document.querySelectorAll('#v-schedule-zones .task-row .pill.p-g').length;
    const allZones = document.querySelectorAll('#v-schedule-zones .sc');
    const totalZones = allZones.length;
    const doneZones = document.querySelectorAll('#v-schedule-zones .sc[data-state="done"]').length;
    const pendingZones = document.querySelectorAll('#v-schedule-zones .sc[data-state="pending"]').length;
    const eventCount = document.querySelectorAll('#v-events .room-card').length;

    const totalAll = totalTasks + totalZones;
    const doneAll = doneTasks + doneZones;
    const pct = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;

    const ovTotal = document.getElementById('ov-total-tasks');
    const ovCompleted = document.getElementById('ov-completed');
    const ovProgressSub = document.getElementById('ov-progress-sub');
    const ovProgFill = document.getElementById('ov-prog-fill');
    const ovPendingZones = document.getElementById('ov-pending-zones');

    if (ovTotal) ovTotal.textContent = totalTasks;
    if (ovCompleted) ovCompleted.textContent = doneAll;
    if (ovProgressSub) ovProgressSub.textContent = 'Πρόοδος ' + pct + '%';
    if (ovProgFill) {
        ovProgFill.style.width = pct + '%';
        ovProgFill.style.background = '#1D9E75';
    }
    if (ovPendingZones) ovPendingZones.textContent = pendingZones;
}

function checkEventComplete(eventId) {
    const allRows = document.querySelectorAll(`.task-row[data-event-id="${eventId}"]`);
    const donePills = document.querySelectorAll(`.task-row[data-event-id="${eventId}"] .pill.p-g`);
    if (allRows.length === 0) return;
    if (allRows.length !== donePills.length) return;

    const card = document.querySelector(`.room-card[data-event-id="${eventId}"]`);
    if (!card) return;

    const requiredZones = (card.dataset.requireZones || '').split(',').filter(Boolean);
    const zonesDone = requiredZones.every(zId => {
        const zone = document.querySelector(`.sc[data-zone-id="${zId}"]`);
        return zone && zone.dataset.state === 'done';
    });
    if (!zonesDone) return;

    card.classList.add('done');
    updateBadgeEvents();
}

window.submitFault = async function() {
    const zone = document.getElementById('fault-zone');
    const type = document.getElementById('fault-type');
    const desc = document.getElementById('fault-desc');
    if (desc.value.trim() === '') {
        alert("Παρακαλώ συμπληρώστε την περιγραφή προβλήματος.");
        return;
    }
    const message = 'Ζώνη: ' + zone.value + '\nΕίδος: ' + type.value + '\nΠεριγραφή: ' + desc.value.trim();
    const payload = { Type: 'fault', Message: message, IsRead: false, CreatedAt: new Date().toISOString() };
    try {
        const { error } = await supabase.from('NOTIFICATION').insert([
            { ...payload, TargetRole: 'admin' },
            { ...payload, TargetRole: 'external_manager' }
        ]);
        if (error) throw error;
        showToast('fault-toast');
        desc.value = '';
    } catch (err) {
        alert('Σφάλμα κατά την αποστολή: ' + err.message);
    }
};

window.submitSupply = async function() {
    const item = document.getElementById('sup-item');
    const qty = document.getElementById('sup-qty');
    const reason = document.getElementById('sup-reason');
    if (item.value.trim() === '' || qty.value.trim() === '') {
        alert("Παρακαλώ συμπληρώστε Είδος και Ποσότητα.");
        return;
    }
    const message = 'Υλικό: ' + item.value.trim() + '\nΠοσότητα: ' + qty.value.trim() + (reason.value.trim() ? '\nΑιτιολογία: ' + reason.value.trim() : '');
    const payload = { Type: 'supply_request', Message: message, IsRead: false, CreatedAt: new Date().toISOString() };
    try {
        const { error } = await supabase.from('NOTIFICATION').insert([
            { ...payload, TargetRole: 'admin' },
            { ...payload, TargetRole: 'external_manager' }
        ]);
        if (error) throw error;
        showToast('supply-toast');
        item.value = '';
        qty.value = '';
        reason.value = '';
        fetchSupplyRequests();
    } catch (err) {
        alert('Σφάλμα κατά την αποστολή: ' + err.message);
    }
};

function showToast(id) {
    const toast = document.getElementById(id);
    if(toast) {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }
}

function startClock() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    const days = ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
    const months = ['Ιανουαρίου','Φεβρουαρίου','Μαρτίου','Απριλίου','Μαΐου','Ιουνίου','Ιουλίου','Αυγούστου','Σεπτεμβρίου','Οκτωβρίου','Νοεμβρίου','Δεκεμβρίου'];
    function tick() {
        const now = new Date();
        const day = days[now.getDay()];
        const date = now.getDate();
        const month = months[now.getMonth()];
        const year = now.getFullYear();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        el.textContent = day + ' ' + date + ' ' + month + ' ' + year + ' · ' + h + ':' + m;
    }
    tick();
    setInterval(tick, 1000);
}

function sortTaskRows() {
    const card = document.querySelector('#v-schedule-zones .card');
    if (!card) return;
    const rows = [...card.querySelectorAll('.task-row')];
    const dated = rows.filter(r => r.dataset.eventDate);
    if (dated.length === 0) return;

    const sortedDates = dated.map(r => r.dataset.eventDate).sort();
    const minDate = sortedDates[0];
    const maxDate = sortedDates[sortedDates.length - 1];

    let midDate;
    if (minDate === maxDate) {
        const next = new Date(new Date(minDate + 'T00:00:00').getTime() + 86400000);
        midDate = next.toISOString().split('T')[0];
    } else {
        const minMs = new Date(minDate + 'T00:00:00').getTime();
        const maxMs = new Date(maxDate + 'T00:00:00').getTime();
        midDate = new Date(minMs + Math.floor((maxMs - minMs) / 2)).toISOString().split('T')[0];
    }

    rows.sort((a, b) => {
        const aDate = a.dataset.eventDate || midDate;
        const bDate = b.dataset.eventDate || midDate;
        return aDate.localeCompare(bDate);
    });

    rows.forEach(row => card.appendChild(row));
}

async function fetchSupplyRequests() {
    if (!supabase) return;
    const list = document.getElementById('supplies-list');
    if (!list) return;
    const { data, error } = await supabase
        .from('NOTIFICATION')
        .select('Message, CreatedAt')
        .eq('Type', 'supply_request')
        .eq('TargetRole', 'admin')
        .eq('IsRead', false)
        .order('CreatedAt', { ascending: false });
    if (error || !data || data.length === 0) {
        list.innerHTML = '<div style="padding:5px 0;color:var(--color-text-tertiary)">Δεν υπάρχουν αιτήματα</div>';
        return;
    }
    const seen = new Set();
    const rows = [];
    data.forEach(n => {
        const msg = n.Message || '';
        const itemMatch = msg.match(/Υλικό:\s*(.+)/);
        const qtyMatch = msg.match(/Ποσότητα:\s*(.+)/);
        const name = itemMatch ? itemMatch[1].trim() : '';
        const qty = qtyMatch ? qtyMatch[1].trim() : '';
        if (name && !seen.has(name)) {
            seen.add(name);
            rows.push({ name, qty, time: n.CreatedAt });
        }
    });
    list.innerHTML = rows.map((r, i) => {
        const border = i < rows.length - 1 ? 'border-bottom:0.5px solid var(--color-border-tertiary)' : '';
        return '<div style="display:flex;justify-content:space-between;padding:5px 0;' + border + '">' +
            '<span style="color:var(--color-text-secondary)">' + r.name + '</span>' +
            '<span style="font-weight:500;color:#EF9F27">' + r.qty + '</span></div>';
    }).join('');
}

window.logout = async function() {
    const user = JSON.parse(localStorage.getItem('hotel_user'));
    if (user) await supabase.from('EMPLOYEE').update({ IsLoggedIn: false }).eq('EmpID', user.id);
    localStorage.removeItem('hotel_user');
    window.location.href = "/pages/login.html";
};

/* ==============================================================
   NOTIFICATIONS (από admin/manager)
   ============================================================== */
async function fetchGardenerNotifs() {
    if (!supabase) return;
    const card = document.getElementById('gardener-notif-card');
    const list = document.getElementById('gardener-notif-list');
    if (!card || !list) return;
    const { data, error } = await supabase
        .from('NOTIFICATION')
        .select('NotificationID, Type, Message, CreatedAt')
        .eq('TargetRole', 'gardener')
        .eq('IsRead', false)
        .order('CreatedAt', { ascending: false });
    if (error || !data || data.length === 0) { card.style.display = 'none'; return; }
    card.style.display = '';
    list.innerHTML = data.map(n => {
        const msg = n.Message || '';
        let text = msg;
        let icon = 'ti ti-bell';
        if (n.Type === 'supply_acknowledged') {
            icon = 'ti ti-circle-check';
            text = msg;
        } else if (n.Type === 'fault_acknowledged') {
            icon = 'ti ti-tool';
            text = msg;
        } else if (msg.startsWith('{')) {
            try {
                const ev = JSON.parse(msg);
                if (ev.eventTitle) {
                    const taskList = ev.tasks ? ev.tasks.map(t => t.name).join(', ') : '';
                    text = '<strong>' + ev.eventTitle + '</strong> (' + (ev.eventDate || '—') + ')<br><span style="font-size:11px;color:var(--color-text-secondary)">' + taskList + '</span>';
                    icon = 'ti ti-calendar-event';
                } else if (ev.tasks) {
                    text = '<strong>Εργασίες:</strong> ' + ev.tasks.map(t => t.name + (t.location ? ' (' + t.location + ')' : '')).join(', ');
                    icon = 'ti ti-calendar-event';
                }
            } catch (_) {}
        } else {
            const parts = msg.split('||');
            if (parts[0]) text = '<strong>' + parts[0] + '</strong>' + (parts[1] ? ' — ' + parts[1] : '');
        }
        const time = n.CreatedAt
            ? new Date(n.CreatedAt).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
            : '';
        return '<div class="ns ns-w" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:default">' +
            '<i class="' + icon + '" style="flex-shrink:0"></i>' +
            '<div style="flex:1;font-size:12px;line-height:1.4">' + text + '</div>' +
            '<span style="font-size:10px;color:var(--color-text-tertiary);flex-shrink:0">' + time + '</span>' +
            '<i class="ti ti-circle-check" style="cursor:pointer;color:#1D9E75;flex-shrink:0;font-size:18px" onclick="dismissGardenerNotif(' + n.NotificationID + ', this)" title="Ολοκλήρωση"></i></div>';
    }).join('');
}

window.dismissGardenerNotif = async function(id, el) {
    if (!supabase) return;
    try {
        await supabase.from('NOTIFICATION').update({ IsRead: true }).eq('NotificationID', id);
        const row = el.closest('.ns');
        if (row) row.remove();
        const list = document.getElementById('gardener-notif-list');
        const card = document.getElementById('gardener-notif-card');
        if (list && card && list.children.length === 0) card.style.display = 'none';
    } catch (_) {}
};
