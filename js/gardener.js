document.addEventListener("DOMContentLoaded", () => {
    // 1. Προσομοίωση Loader (ακριβώς όπως στο σύστημά σας)
    setTimeout(() => {
        const loader = document.getElementById("app-loader");
        const app = document.querySelector(".app");
        if(loader) loader.style.display = "none";
        if(app) app.style.display = "flex";
    }, 800);

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
});

// Εξωτερική κλήση από κουμπιά (π.χ. "Όλα ->")
function navTo(viewId) {
    const targetItem = document.querySelector(`.sb-item[data-v="${viewId}"]`);
    if(targetItem) targetItem.click();
}

// 3. Λειτουργίες εργασιών & φορμών
function completeTask(checkbox) {
    const row = checkbox.closest('.task-row');
    const badge = row.querySelector('.task-badge');
    
    if (checkbox.checked) {
        badge.className = 'pill p-g task-badge';
        badge.innerText = 'Ολοκληρώθηκε';
        showToast('task-toast');
    } else {
        badge.className = 'pill p-a task-badge';
        badge.innerText = 'Σε εξέλιξη';
    }
}

function toggleZone(element) {
    // Απλή εναλλαγή χρωμάτων για τη ζώνη
    if (element.style.background.includes('EAF3DE')) {
        // Αλλαγή σε Εκκρεμές (Κόκκινο/Ροζ)
        element.style.background = '#FFF8F8';
        element.style.borderColor = '#F7C1C1';
        element.querySelector('.sc-lbl').style.color = '#791F1F';
        element.querySelector('.sc-val').style.color = '#791F1F';
        element.querySelector('.sc-sub').style.color = '#791F1F';
        element.querySelector('.sc-sub').innerText = 'Εκκρεμεί';
        element.querySelector('i').className = 'ti ti-clock';
        element.querySelector('i').style.color = '#E24B4A';
    } else {
        // Αλλαγή σε Ολοκληρωμένο (Πράσινο)
        element.style.background = '#EAF3DE';
        element.style.borderColor = '#C0DD97';
        element.querySelector('.sc-lbl').style.color = '#27500A';
        element.querySelector('.sc-val').style.color = '#27500A';
        element.querySelector('.sc-sub').style.color = '#27500A';
        element.querySelector('.sc-sub').innerText = 'Φροντίστηκε';
        element.querySelector('i').className = 'ti ti-check';
        element.querySelector('i').style.color = '#1D9E75';
    }
}

function submitFault() {
    const desc = document.getElementById('fault-desc');
    if(desc.value.trim() === '') {
        alert("Παρακαλώ συμπληρώστε την περιγραφή προβλήματος.");
        return;
    }
    showToast('fault-toast');
    desc.value = '';
}

function submitSupply() {
    const item = document.getElementById('sup-item');
    const qty = document.getElementById('sup-qty');
    
    if(item.value.trim() === '' || qty.value.trim() === '') {
        alert("Παρακαλώ συμπληρώστε Είδος και Ποσότητα.");
        return;
    }
    showToast('supply-toast');
    item.value = '';
    qty.value = '';
    document.getElementById('sup-reason').value = '';
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