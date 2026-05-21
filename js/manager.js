const vT={overview:'Πίνακας Ελέγχου',fleet:'Στόλος Οχημάτων',schedule:'Πρόγραμμα Οδηγών',payroll:'Κόστη & Πληρωμές Οδηγών',inventory:'Υλικά & Ελλείψεις'};
function navTo(id){
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.toggle('active',i.dataset.v===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='v-'+id));
  document.getElementById('tb-title').textContent=vT[id]||id;
}

window.logout = function() {
  localStorage.removeItem('hotel_user');
  window.location.href = '/pages/login.html';
};

function showToast2(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),3200);
}

function showToast(msg, type) {
  const container = document.getElementById('toast-container') || (() => {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(c);
    return c;
  })();
  const toast = document.createElement('div');
  let icon = 'ti-circle-check';
  if (type === 'error') icon = 'ti-alert-circle';
  if (type === 'info') icon = 'ti-info-circle';
  if (type === 'warning') icon = 'ti-alert-triangle';
  toast.innerHTML = `<i class="ti ${icon}"></i><span>${msg}</span>`;
  const borderColor = type === 'error' ? '#E24B4A' : type === 'info' ? '#378ADD' : type === 'warning' ? '#F97316' : '#1D9E75';
  toast.style.cssText = 'background:#fff;border-left:4px solid ' + borderColor + ';box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:12px 20px;border-radius:6px;display:flex;align-items:center;gap:10px;font-size:13px;color:#111;font-weight:500;min-width:250px;transition:opacity 0.3s;';
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
}

/* ==============================================================
   OVERVIEW
   ============================================================== */
async function fetchOverview() {
  const supabase = window.supabase;
  if (!supabase) return;

  const today = new Date().toISOString().split('T')[0];

  // Drivers
  const { data: drivers } = await supabase
    .from('EMPLOYEE')
    .select('EmpID')
    .eq('Role', 'driver')
    .eq('isActive', true);

  const totalDrivers = drivers ? drivers.length : 0;

  const { data: tripsToday } = await supabase
    .from('TRIP')
    .select('TripID, DriverID')
    .eq('Date', today);

  const busyDrivers = tripsToday ? new Set(tripsToday.map(t => t.DriverID)).size : 0;
  const available = totalDrivers - busyDrivers;

  document.getElementById('driver-availability').textContent = available + '/' + totalDrivers;
  document.getElementById('driver-status').textContent = busyDrivers + ' σε μεταφορά';

  // Fleet status
  const { data: vehicles } = await supabase
    .from('VEHICLE')
    .select('Status');

  let free = 0, inUse = 0, maintenance = 0;
  (vehicles || []).forEach(v => {
    if (v.Status === 'available') free++;
    else if (v.Status === 'in_use') inUse++;
    else if (v.Status === 'maintenance') maintenance++;
  });

  document.getElementById('fleet-status').textContent = free + ' διαθέσιμα';
  document.getElementById('fleet-maintenance').textContent = maintenance + ' οχήματα σε Service';

  // Material shortages
  const { data: items } = await supabase
    .from('INVENTORY_ITEM')
    .select('*');

  const shortages = (items || []).filter(i => i.Quantity < i.MinThreshold);
  document.getElementById('material-shortages').textContent = shortages.length + ' Είδη';
  document.getElementById('material-order').textContent = shortages.length > 0 ? 'Απαιτείται Παραγγελία' : 'Επαρκές απόθεμα';

  // Trips today
  document.getElementById('trips-today').textContent = tripsToday ? tripsToday.length : '0';
  document.getElementById('trips-details').textContent = 'Πελάτες & Προϊόντα';

  // Topbar meta
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = new Date().toLocaleDateString('el-GR', opts);
  document.getElementById('tb-meta').textContent = dateStr + ' · Ενεργά Οχήματα: ' + (vehicles ? vehicles.length : 0);
}

/* ==============================================================
   INVENTORY
   ============================================================== */
async function fetchInventory() {
  const supabase = window.supabase;
  if (!supabase) return;

  const { data: items } = await supabase
    .from('INVENTORY_ITEM')
    .select('*')
    .order('Name');

  const tbody = document.getElementById('inventory-table');
  if (!tbody) return;

  let rows = '';
  (items || []).forEach(item => {
    const shortage = item.Quantity < item.MinThreshold;
    const status = shortage
      ? '<span class="pill p-r">Λείπει (Παραγγελία)</span>'
      : '<span class="pill p-g">Επαρκές</span>';
    rows += '<tr style="border-bottom:1px solid var(--color-border-tertiary)">'
      + '<td style="padding:8px; font-weight:500">' + (item.Name || '') + '</td>'
      + '<td style="padding:8px">' + (item.Category || '') + '</td>'
      + '<td style="padding:8px">' + item.Quantity + '</td>'
      + '<td style="padding:8px">' + status + '</td>'
      + '</tr>';
  });
  tbody.innerHTML += rows;
}

/* ==============================================================
   DRIVER SCHEDULE
   ============================================================== */
async function fetchDriverSchedule() {
  const supabase = window.supabase;
  if (!supabase) return;

  const today = new Date().toISOString().split('T')[0];

  const { data: drivers } = await supabase
    .from('EMPLOYEE')
    .select('EmpID, FirstName, LastName')
    .eq('Role', 'driver')
    .eq('isActive', true);

  const { data: trips } = await supabase
    .from('TRIP')
    .select('TripID, DriverID, Destination, Cost, Date')
    .eq('Date', today);

  const { data: vehicles } = await supabase
    .from('VEHICLE')
    .select('VehicleID, LicensePlate, Status');

  const container = document.getElementById('driver-schedule-list');
  if (!container) return;

  let html = '';
  (drivers || []).forEach(d => {
    const name = (d.FirstName || '') + ' ' + (d.LastName || '');
    const driverTrips = (trips || []).filter(t => t.DriverID === d.EmpID);
    const isBusy = driverTrips.length > 0;
    const vehicle = (vehicles || []).find(v => v.Status === 'in_use') || { LicensePlate: '—' };

    let tripInfo = 'Καμία προγραμματισμένη αποστολή';
    if (isBusy) {
      tripInfo = 'Τρέχουσα Αποστολή: ' + driverTrips[0].Destination || 'Μεταφορά';
    }

    const pillClass = isBusy ? 'p-a' : 'p-g';
    const pillText = isBusy ? 'Απασχολημένος' : 'Διαθέσιμος';

    html += '<div class="room-card">'
      + '<div class="room-info">'
      + '<div style="font-weight:600; font-size:14px">Οδηγός: ' + name + '</div>'
      + '<div class="room-type">Όχημα: ' + (vehicle.LicensePlate || '—') + '</div>'
      + '<div class="room-guest" style="color:' + (isBusy ? '#0EA5E9' : 'inherit') + '; font-weight:' + (isBusy ? 'bold' : 'normal') + '">' + tripInfo + '</div>'
      + '</div>'
      + '<span class="pill ' + pillClass + '">' + pillText + '</span>'
      + '</div>';
  });

  container.innerHTML = html || '<div style="padding:16px;color:var(--color-text-secondary)">Δεν υπάρχουν εγγεγραμμένοι οδηγοί.</div>';
}

/* ==============================================================
   FLEET MAINTENANCE
   ============================================================== */
async function fetchFleetMaintenance() {
  const supabase = window.supabase;
  if (!supabase) return;

  const { data: vehicles } = await supabase
    .from('VEHICLE')
    .select('*');

  const { data: services } = await supabase
    .from('VEHICLE_SERVICE')
    .select('*')
    .order('ServiceDate', { ascending: false });

  const tbody = document.getElementById('fleet-maintenance-table');
  if (!tbody) return;

  let rows = '';
  (vehicles || []).forEach(v => {
    const lastService = (services || []).filter(s => s.VehicleID === v.VehicleID)[0];
    const lastDate = lastService ? new Date(lastService.ServiceDate).toLocaleDateString('el-GR') : '—';
    const nextDate = lastService && lastService.NextServiceDate
      ? new Date(lastService.NextServiceDate).toLocaleDateString('el-GR')
      : '—';

    const needsMaintenance = v.Status === 'maintenance';
    const statusHtml = needsMaintenance
      ? '<span style="color:#D85A30; font-weight:bold">Απαιτείται Service</span>'
      : '<span style="color:#1D9E75">OK</span>';

    rows += '<tr style="border-bottom:1px solid var(--color-border-tertiary)">'
      + '<td style="padding:8px; font-weight:500">' + (v.LicensePlate || v.VehicleID) + '</td>'
      + '<td style="padding:8px">—</td>'
      + '<td style="padding:8px">' + lastDate + '</td>'
      + '<td style="padding:8px">' + statusHtml + '</td>'
      + '</tr>';
  });

  tbody.innerHTML += rows || '<tr><td style="padding:16px;color:var(--color-text-secondary)" colspan="4">Δεν υπάρχουν καταχωρημένα οχήματα.</td></tr>';
}

/* ==============================================================
   PAYROLL
   ============================================================== */
async function fetchPayroll() {
  const supabase = window.supabase;
  if (!supabase) return;

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const { data: drivers } = await supabase
    .from('EMPLOYEE')
    .select('EmpID, FirstName, LastName, Salary')
    .eq('Role', 'driver')
    .eq('isActive', true);

  const { data: trips } = await supabase
    .from('TRIP')
    .select('DriverID, Cost')
    .gte('Date', monthStart)
    .lte('Date', monthEnd);

  const { data: shifts } = await supabase
    .from('SHIFT')
    .select('EmpID, Hours')
    .gte('Date', monthStart)
    .lte('Date', monthEnd);

  // Fleet costs
  const totalTripCost = (trips || []).reduce((sum, t) => sum + (t.Cost || 0), 0);
  const avgCost = (trips && trips.length > 0) ? (totalTripCost / trips.length).toFixed(2) : '0.00';

  const costsList = document.getElementById('fleet-costs-list');
  if (costsList) {
    let costHtml = '<div style="display:flex; justify-content:space-between; padding:4px 0"><span>Σύνολο Μεταφορών</span><strong>' + totalTripCost + '€</strong></div>';
    costHtml += '<div style="display:flex; justify-content:space-between; padding:8px 0; border-top:1px solid #ccc; margin-top:5px"><span>Μέσο Κόστος Μεταφοράς/Διαδρομή:</span><strong>' + avgCost + '€</strong></div>';
    costsList.innerHTML = costHtml;
  }

  // Driver payroll
  const tbody = document.getElementById('driver-payroll-table');
  if (!tbody) return;

  let payRows = '';
  (drivers || []).forEach(d => {
    const name = (d.FirstName || '') + ' ' + (d.LastName || '');
    const driverTrips = (trips || []).filter(t => t.DriverID === d.EmpID);
    const driverShifts = (shifts || []).filter(s => s.EmpID === d.EmpID);
    const totalHours = driverShifts.reduce((sum, s) => sum + (s.Hours || 0), 0);
    const tripCount = driverTrips.length;

    let payable = d.Salary || 0;
    if (tripCount > 0) {
      payable += driverTrips.reduce((sum, t) => sum + (t.Cost || 0), 0) * 0.1;
    }

    payRows += '<tr style="border-bottom:1px solid var(--color-border-tertiary)">'
      + '<td style="padding:6px; font-weight:500">' + name + '</td>'
      + '<td style="padding:6px">' + totalHours + 'h + ' + tripCount + ' Μεταφορές</td>'
      + '<td style="padding:6px; font-weight:bold; color:#1D9E75">' + payable.toFixed(2) + '€</td>'
      + '</tr>';
  });

  tbody.innerHTML += payRows || '<tr><td style="padding:16px;color:var(--color-text-secondary)" colspan="3">Δεν υπάρχουν εγγεγραμμένοι οδηγοί.</td></tr>';
}

/* ==============================================================
   NOTIFICATIONS (από υπάρχον)
   ============================================================== */
async function fetchRestockNotifs() {
  const container = document.getElementById('manager-notifications');
  if (!container) return;
  const supabase = window.supabase;
  if (!supabase) return;

  const { data } = await supabase
    .from('NOTIFICATION')
    .select('*')
    .in('TargetRole', ['manager', 'both'])
    .eq('IsRead', false)
    .order('CreatedAt', { ascending: false });

  let html = '';
  (data || []).forEach(n => {
    const time = n.CreatedAt
      ? new Date(n.CreatedAt).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      : '';
    html += '<div class="ns ns-w" onclick="dismissNotif(' + n.NotificationID + ', this)" style="cursor:pointer">'
      + '<i class="ti ti-package"></i>'
      + '<div><strong>Αίτημα Ανεφοδιασμού:</strong> ' + n.Message + '</div>'
      + '<span style="margin-left:auto;font-size:11px;color:var(--color-text-secondary)">' + time + '</span>'
      + '</div>';
  });

  container.innerHTML = html || '';
}

window.dismissNotif = async function(id, el) {
  try {
    await window.supabase.from('NOTIFICATION').update({ IsRead: true }).eq('NotificationID', id);
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
    showToast('Η ειδοποίηση απορρίφθηκε.', 'info');
  } catch (err) {
    showToast('Σφάλμα απόρριψης.', 'error');
  }
};

/* ==============================================================
   INIT
   ============================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const user = JSON.parse(localStorage.getItem('hotel_user'));
  if (!user) {
    window.location.href = '/pages/login.html';
    return;
  }

  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-role').textContent = user.Role === 'external_manager' ? 'Διαχειριστής Εξωτ.' : user.Role;

  setTimeout(() => {
    const loader = document.getElementById('app-loader');
    if (loader) loader.style.display = 'none';
    const app = document.querySelector('.app');
    if (app) app.style.display = 'flex';
  }, 800);

  document.querySelectorAll('.sb-item').forEach(item => {
    item.addEventListener('click', () => navTo(item.dataset.v));
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', window.logout);

  fetchOverview();
  fetchInventory();
  fetchDriverSchedule();
  fetchFleetMaintenance();
  fetchPayroll();
  fetchRestockNotifs();
  setInterval(fetchRestockNotifs, 30000);
});
