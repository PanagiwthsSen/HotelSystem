document.addEventListener("DOMContentLoaded", () => {
    // 1. Προσομοίωση Loader (ακριβώς όπως στο σύστημά σας)
    setTimeout(() => {
        const loader = document.getElementById("app-loader");
        const app = document.querySelector(".app");
        if(loader) loader.style.display = "none";
        if(app) app.style.display = "flex";
    }, 800);

    // 1b. Real-time ρολόι
    startClock();

    // 2. Λειτουργία Μενού (Sidebar Navigation)
    const navItems = document.querySelectorAll('.sb-item');
    const views = document.querySelectorAll('.view');
    const tbTitle = document.getElementById('tb-title');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Αφαίρεση του active class από όλα
            navItems.forEach(nav => nav.classList.remove('active'));
            views.forEach(view => view.classList.remove('active'));
            
            // Προσθήκη του active class στο επιλεγμένο
            item.classList.add('active');
            const targetView = item.getAttribute('data-v');
            document.getElementById(`v-${targetView}`).classList.add('active');
            
            // Αλλαγή Τίτλου Topbar
            tbTitle.innerText = item.innerText;
        });
    });

    // 2b. Δημιουργία εργασιών από εκδηλώσεις
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

    // 3. Δυναμική ενημέρωση badge στο Πρόγραμμα
    updateBadgeTasks();

    // 4. Αρχική ενημέρωση Ολοκλ. & Εκκρεμών Ζωνών
    updateDoneCount();
    updatePendCount();

    // 5. Δυναμική ενημέρωση Εκδηλώσεων & Επισκόπησης
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

    // 6. Αρχικός έλεγχος για ήδη ολοκληρωμένες εκδηλώσεις
    document.querySelectorAll('.room-card[data-event-id]').forEach(card => {
        checkEventComplete(card.dataset.eventId);
    });
});

// Εξωτερική κλήση από κουμπιά (π.χ. "Όλα ->")
function navTo(viewId) {
    const targetItem = document.querySelector(`.sb-item[data-v="${viewId}"]`);
    if(targetItem) targetItem.click();
}

// 3. Λειτουργίες εργασιών & φορμών
function cycleTask(badge) {
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
    }
}

function updateDoneCount() {
    const rows = document.querySelectorAll('#v-schedule-zones .task-row');
    const badges = document.querySelectorAll('#v-schedule-zones .task-row .pill.p-g');
    const total = rows.length;
    const done = badges.length;
    const doneEl = document.getElementById('done-count');
    if (doneEl) doneEl.textContent = done + '/' + total;
}

function toggleZone(element) {
    const state = element.dataset.state;

    if (state === 'pending') {
        // Εκκρεμεί → Σε εξέλιξη
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
        // Σε εξέλιξη → Ολοκληρωμένη
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
    // 'done' → locked, καμία αλλαγή
    updatePendCount();
    updateBadgeTasks();
    updateOverview();

    // Έλεγχος αν κάποια εκδήλωση μπορεί τώρα να πρασινίσει λόγω ζώνης
    document.querySelectorAll('.room-card[data-event-id]').forEach(c => checkEventComplete(c.dataset.eventId));
}

function updatePendCount() {
    const pendingZones = document.querySelectorAll('#v-schedule-zones .sc[data-state="pending"]').length;
    const pendCountEl = document.getElementById('pend-count');
    if (pendCountEl) pendCountEl.textContent = pendingZones;
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

    // Έλεγχος ότι όλες οι απαιτούμενες ζώνες είναι ολοκληρωμένες
    const requiredZones = (card.dataset.requireZones || '').split(',').filter(Boolean);
    const zonesDone = requiredZones.every(zId => {
        const zone = document.querySelector(`.sc[data-zone-id="${zId}"]`);
        return zone && zone.dataset.state === 'done';
    });
    if (!zonesDone) return;

    card.classList.add('done');
    updateBadgeEvents();
}

async function submitFault() {
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
        const { error } = await window.supabase.from('NOTIFICATION').insert([
            { ...payload, TargetRole: 'admin' },
            { ...payload, TargetRole: 'external_manager' }
        ]);
        if (error) throw error;
        showToast('fault-toast');
        desc.value = '';
    } catch (err) {
        alert('Σφάλμα κατά την αποστολή: ' + err.message);
    }
}

async function submitSupply() {
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
        const { error } = await window.supabase.from('NOTIFICATION').insert([
            { ...payload, TargetRole: 'admin' },
            { ...payload, TargetRole: 'external_manager' }
        ]);
        if (error) throw error;
        showToast('supply-toast');
        item.value = '';
        qty.value = '';
        reason.value = '';
    } catch (err) {
        alert('Σφάλμα κατά την αποστολή: ' + err.message);
    }
}

// Λειτουργία εμφάνισης ειδοποιήσεων (Toast Notification)
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
        // Μία μόνο ημερομηνία — no-date μετά από αυτήν
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