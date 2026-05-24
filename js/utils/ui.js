export function showToast(message, type = 'success') {
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

export function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function formatDate(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleDateString('el-GR');
}

export function updateLiveTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    const el = document.getElementById('live-time');
    if (el) el.innerHTML = now.toLocaleDateString('el-GR', options);
}

export function navTo(id) {
    document.querySelectorAll('.sb-item').forEach(i => i.classList.toggle('active', i.dataset.v === id));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
    const titles = {
        dash: 'Πίνακας Ελέγχου', revenue: 'Έσοδα & Αναφορές', pricing: 'Δυναμική Τιμολόγηση',
        rooms: 'Κατάσταση Δωματίων', staff: 'Διαχείριση Προσωπικού', restaurant: 'Minibar & Αποθήκες',
        vehicles: 'Οχήματα & Μεταφορές', trips: 'Δρομολόγια Οχημάτων', reservations: 'Κρατήσεις',
        gardens: 'Κήποι & Εξωτερικοί Χώροι', rentals: 'Ενοικιαζόμενα Καταστήματα',
        payroll: 'Μισθοδοσία', users: 'Χρήστες & Ρόλοι', backup: 'Backup & Ασφάλεια',
        'notif-history': 'Ιστορικό Ειδοποιήσεων'
    };
    const el = document.getElementById('tb-title');
    if (el) el.textContent = titles[id] || id;
}
