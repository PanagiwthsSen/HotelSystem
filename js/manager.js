import { supabase } from './supabase-config.js';
import { showToast } from './utils/ui.js';

const vT={overview:'Πίνακας Ελέγχου',fleet:'Στόλος Οχημάτων',schedule:'Πρόγραμμα Οδηγών','new-trip':'Νέα Μεταφορά','trip-logs':'Αρχείο Μεταφορών',payroll:'Κόστη & Πληρωμές Οδηγών',inventory:'Υλικά & Ελλείψεις',gardener:'Ανάθεση σε Κηπουρό',pricing:'Τιμολόγηση Δωματίων',hr:'Κατάσταση Προσωπικού',rents:'Ενοίκια & Νομικά'};
window.navTo = function(id){
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.toggle('active',i.dataset.v===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='v-'+id));
  document.getElementById('tb-title').textContent=vT[id]||id;
};

window.logout = async function() {
  const user = JSON.parse(localStorage.getItem('hotel_user'));
  if (user) await supabase.from('EMPLOYEE').update({ IsLoggedIn: false }).eq('EmpID', user.id);
  localStorage.removeItem('hotel_user');
  window.location.href = '/pages/login.html';
};

window.showToast = showToast;

/* ==============================================================
   OVERVIEW
   ============================================================== */
async function fetchOverview() {
  if (!supabase) return;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(24, 0, 0, 0);

  // External manager (fleet/drivers) — guard with element existence
  const driverEl = document.getElementById('driver-availability');
  if (driverEl) {
    const { data: drivers } = await supabase
      .from('EMPLOYEE')
      .select('EmpID')
      .eq('Role', 'driver')
      .eq('isActive', true);

    const totalDrivers = drivers ? drivers.length : 0;

    const { data: tripsToday } = await supabase
      .from('TRIP')
      .select('TripID, DriverID, Status')
      .gte('Date', dayStart.toISOString())
      .lt('Date', dayEnd.toISOString());

    const activeTrips = (tripsToday || []).filter(t => t.Status !== 'completed');
    const busyDrivers = activeTrips.length > 0 ? new Set(activeTrips.map(t => t.DriverID)).size : 0;
    const available = totalDrivers - busyDrivers;

    driverEl.textContent = available + '/' + totalDrivers;
    const ds = document.getElementById('driver-status');
    if (ds) ds.textContent = busyDrivers + ' σε μεταφορά';

    document.getElementById('trips-today').textContent = tripsToday ? tripsToday.length : '0';
    document.getElementById('trips-details').textContent = 'Πελάτες & Προϊόντα';
  }

  const vehEl = document.getElementById('fleet-status');
  if (vehEl) {
    const { data: vehicles } = await supabase
      .from('VEHICLE')
      .select('Status');

    let free = 0, inUse = 0, maintenance = 0;
    (vehicles || []).forEach(v => {
      if (v.Status === 'available') free++;
      else if (v.Status === 'in_use') inUse++;
      else if (v.Status === 'maintenance') maintenance++;
    });

    vehEl.textContent = free + ' διαθέσιμα';
    document.getElementById('fleet-maintenance').textContent = maintenance + ' οχήματα σε Service';
  }

  const matEl = document.getElementById('material-shortages');
  if (matEl) {
    const { data: items } = await supabase
      .from('INVENTORY_ITEM')
      .select('*');

    const shortages = (items || []).filter(i => i.Quantity < i.MinThreshold);
    matEl.textContent = shortages.length + ' Είδη';
    document.getElementById('material-order').textContent = shortages.length > 0 ? 'Απαιτείται Παραγγελία' : 'Επαρκές απόθεμα';
  }

  // Internal manager (rooms/staff) — guard with element existence
  const occEl = document.getElementById('stat-occupancy');
  if (occEl) {
    const { count: totalRooms } = await supabase
      .from('ROOM')
      .select('*', { count: 'exact', head: true });

    const { count: occupiedRooms } = await supabase
      .from('ROOM')
      .select('*', { count: 'exact', head: true })
      .eq('Status', 'occ');

    const occPct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    occEl.textContent = occPct + '%';
    occEl.style.color = occPct < 60 ? '#D85A30' : '#1D9E75';
    const occSub = document.getElementById('stat-occupancy-sub');
    if (occSub) occSub.textContent = occPct < 60 ? 'Κάτω από το όριο (60%)' : 'Εντός ορίου';

    let zPctOverview = 10;
    const { data: cfgData } = await supabase
      .from('NOTIFICATION')
      .select('Message')
      .eq('Type', 'pricing_config')
      .eq('TargetRole', 'both')
      .order('CreatedAt', { ascending: false })
      .limit(1);
    if (cfgData && cfgData[0]) {
      try { const m = JSON.parse(cfgData[0].Message); if (m.low) zPctOverview = Math.round((1 - parseFloat(m.low)) * 100); } catch (_) {}
    }
    const discountEl = document.getElementById('stat-discount');
    const discountSub = document.getElementById('stat-discount-sub');
    const badge = document.getElementById('discount-badge');
    if (discountEl) {
      if (occPct < 60) {
        discountEl.textContent = 'Ενεργοποιήθηκε';
        discountEl.style.color = '#1D9E75';
        if (discountSub) discountSub.textContent = 'Αυτόματη προσαρμογή -' + zPctOverview + '%';
        if (badge) badge.textContent = 'Ενεργή Έκπτωση -' + zPctOverview + '% (<60%)';
      } else {
        discountEl.textContent = 'Απενεργοποιημένο';
        discountEl.style.color = '#888';
        if (discountSub) discountSub.textContent = 'Πληρότητα > 60%';
        if (badge) badge.textContent = 'Έκπτωση Ανενεργή';
      }
    }

    const availEl = document.getElementById('stat-available');
    if (availEl) {
      const available = totalRooms - occupiedRooms;
      availEl.textContent = available;
      const availSub = document.getElementById('stat-available-sub');
      if (availSub) availSub.textContent = 'Από τα ' + totalRooms + ' συνολικά';
    }

    const { count: loggedInStaff } = await supabase
      .from('EMPLOYEE')
      .select('*', { count: 'exact', head: true })
      .eq('IsLoggedIn', true);

    const staffEl = document.getElementById('stat-staff');
    if (staffEl) {
      staffEl.textContent = loggedInStaff;
      const staffSub = document.getElementById('stat-staff-sub');
      if (staffSub) staffSub.textContent = 'Συνδεδεμένοι τώρα';
    }
  }

  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = new Date().toLocaleDateString('el-GR', opts);
  const metaEl = document.getElementById('tb-meta');
  if (metaEl) {
    if (driverEl) {
      const { count: vCount } = await supabase
        .from('VEHICLE')
        .select('*', { count: 'exact', head: true });
      metaEl.textContent = dateStr + ' · Ενεργά Οχήματα: ' + (vCount || 0);
    } else if (occEl) {
      const { count: totalRooms } = await supabase
        .from('ROOM')
        .select('*', { count: 'exact', head: true });
      metaEl.textContent = dateStr + ' · Πληρότητα: ' + occEl.textContent + ' · Σύνολο Δωματίων: ' + totalRooms;
    }
  }
}

/* ==============================================================
   INVENTORY
   ============================================================== */
async function fetchInventory() {
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
  if (!supabase) return;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(24, 0, 0, 0);

  const { data: drivers } = await supabase
    .from('EMPLOYEE')
    .select('EmpID, FirstName, LastName')
    .eq('Role', 'driver')
    .eq('isActive', true);

  const { data: trips } = await supabase
    .from('TRIP')
    .select('TripID, DriverID, Destination, Cost, Date, Status')
    .gte('Date', dayStart.toISOString())
    .lt('Date', dayEnd.toISOString());

  const activeTrips = (trips || []).filter(t => t.Status !== 'completed');

  const { data: vehicles } = await supabase
    .from('VEHICLE')
    .select('VehicleID, PlateNumber, Status');

  const container = document.getElementById('driver-schedule-list');
  if (!container) return;

  let html = '';
  (drivers || []).forEach(d => {
    const name = (d.FirstName || '') + ' ' + (d.LastName || '');
    const driverTrips = (activeTrips || []).filter(t => t.DriverID === d.EmpID);
    const isBusy = driverTrips.length > 0;
    const vehicle = (vehicles || []).find(v => v.Status === 'in_use') || { PlateNumber: '—' };

    let tripInfo = 'Καμία προγραμματισμένη αποστολή';
    if (isBusy) {
      tripInfo = 'Τρέχουσα Αποστολή: ' + (driverTrips[0].Destination || 'Μεταφορά');
    }

    const pillClass = isBusy ? 'p-a' : 'p-g';
    const pillText = isBusy ? 'Απασχολημένος' : 'Διαθέσιμος';

    html += '<div class="room-card">'
      + '<div class="room-info">'
      + '<div style="font-weight:600; font-size:14px">Οδηγός: ' + name + '</div>'
      + '<div class="room-type">Όχημα: ' + (vehicle.PlateNumber || '—') + '</div>'
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
      + '<td style="padding:8px; font-weight:500">' + (v.PlateNumber || v.VehicleID) + '</td>'
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

  const totalTripCost = (trips || []).reduce((sum, t) => sum + (t.Cost || 0), 0);
  const avgCost = (trips && trips.length > 0) ? (totalTripCost / trips.length).toFixed(2) : '0.00';

  const costsList = document.getElementById('fleet-costs-list');
  if (costsList) {
    let costHtml = '<div style="display:flex; justify-content:space-between; padding:4px 0"><span>Σύνολο Μεταφορών</span><strong>' + totalTripCost + '€</strong></div>';
    costHtml += '<div style="display:flex; justify-content:space-between; padding:8px 0; border-top:1px solid #ccc; margin-top:5px"><span>Μέσο Κόστος Μεταφοράς/Διαδρομή:</span><strong>' + avgCost + '€</strong></div>';
    costsList.innerHTML = costHtml;
  }

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
   NEW TRIP
   ============================================================== */
async function fetchTripFormData() {
  if (!supabase) return;

  const [driversRes, vehiclesRes, customersRes, maxTripRes] = await Promise.all([
    supabase.from('EMPLOYEE').select('EmpID, FirstName, LastName').eq('Role', 'driver').eq('isActive', true).order('FirstName'),
    supabase.from('VEHICLE').select('VehicleID, PlateNumber, PlateNumber').neq('Status', 'maintenance').order('PlateNumber'),
    supabase.from('CUSTOMER').select('CustomerID, FirstName, LastName').order('FirstName'),
    supabase.from('TRIP').select('TripID', { count: 'exact', head: true }).order('TripID', { ascending: false }).limit(1)
  ]);

  const drivers = driversRes.data || [];
  const vehicles = vehiclesRes.data || [];
  const customers = customersRes.data || [];

  const driverSel = document.getElementById('trip-driver');
  if (driverSel) {
    driverSel.innerHTML = '<option value="">— Επιλέξτε Οδηγό —</option>';
    drivers.forEach(d => {
      driverSel.innerHTML += '<option value="' + d.EmpID + '">' + (d.FirstName || '') + ' ' + (d.LastName || '').trim() + '</option>';
    });
  }

  const vehicleSel = document.getElementById('trip-vehicle');
  if (vehicleSel) {
    vehicleSel.innerHTML = '<option value="">— Επιλέξτε Όχημα —</option>';
    vehicles.forEach(v => {
      vehicleSel.innerHTML += '<option value="' + v.VehicleID + '">' + (v.PlateNumber || v.VehicleID) + '</option>';
    });
  }

  const custSel = document.getElementById('trip-customer');
  if (custSel) {
    customers.forEach(c => {
      custSel.innerHTML += '<option value="' + c.CustomerID + '">' + (c.FirstName || '') + ' ' + (c.LastName || '').trim() + '</option>';
    });
  }

  const dateInput = document.getElementById('trip-date');
  if (dateInput) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    dateInput.value = now.toISOString().slice(0, 16);
  }
}

window.submitTrip = async function() {
  if (!supabase) return;

  const driverId = document.getElementById('trip-driver').value;
  const vehicleId = document.getElementById('trip-vehicle').value;
  const destination = document.getElementById('trip-destination').value.trim();
  const tripDate = document.getElementById('trip-date').value;
  const cost = parseFloat(document.getElementById('trip-cost').value);
  const customerId = document.getElementById('trip-customer').value;

  if (!driverId || !vehicleId || !destination || !tripDate || isNaN(cost) || cost <= 0) {
    showToast('Συμπληρώστε όλα τα υποχρεωτικά πεδία.', 'error');
    return;
  }

  const { data: maxData } = await supabase
    .from('TRIP')
    .select('TripID')
    .order('TripID', { ascending: false })
    .limit(1);

  const nextId = (maxData && maxData.length > 0) ? maxData[0].TripID + 1 : 1;

  const tripPayload = {
    TripID: nextId,
    DriverID: parseInt(driverId),
    VehicleID: parseInt(vehicleId),
    Destination: destination,
    Date: tripDate,
    Cost: cost,
    Status: 'pending'
  };

  if (customerId) {
    tripPayload.CustomerID = parseInt(customerId);
  }

  const { error } = await supabase.from('TRIP').insert(tripPayload);

  if (error) {
    showToast('Σφάλμα κατά την καταχώρηση: ' + error.message, 'error');
    return;
  }

  const { error: vehErr } = await supabase
    .from('VEHICLE')
    .update({ Status: 'in_use' })
    .eq('VehicleID', parseInt(vehicleId));

  if (vehErr) {
    showToast('Η διαδρομή καταχωρήθηκε, αλλά υπήρξε πρόβλημα ενημέρωσης του οχήματος.', 'warning');
  } else {
    showToast('Η μεταφορά καταχωρήθηκε επιτυχώς!', 'success');
  }

  fetchDriverSchedule();
  fetchOverview();

  window.resetTripForm();
};

window.resetTripForm = function() {
  document.getElementById('trip-driver').selectedIndex = 0;
  document.getElementById('trip-vehicle').selectedIndex = 0;
  document.getElementById('trip-customer').selectedIndex = 0;
  document.getElementById('trip-destination').value = '';
  document.getElementById('trip-cost').value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('trip-date').value = now.toISOString().slice(0, 16);
};

/* ==============================================================
   TRIP LOGS
   ============================================================== */
async function fetchTripLogs() {
  if (!supabase) return;

  const { data: trips, error } = await supabase
    .from('TRIP')
    .select('TripID, DriverID, VehicleID, Destination, Date, Cost, Status, CustomerID, EMPLOYEE(FirstName, LastName), VEHICLE(PlateNumber), CUSTOMER(FirstName, LastName)')
    .order('Date', { ascending: false });

  if (error) {
    showToast('Σφάλμα φόρτωσης αρχείου: ' + error.message, 'error');
    return;
  }

  const countEl = document.getElementById('trip-log-count');
  if (countEl) countEl.textContent = 'Σύνολο: ' + (trips ? trips.length : 0);

  const tbody = document.getElementById('trip-log-body');
  if (!tbody) return;

  let html = '';
  (trips || []).forEach(t => {
    const driver = t.EMPLOYEE || {};
    const driverName = ((driver.FirstName || '') + ' ' + (driver.LastName || '')).trim() || '—';
    const vehicle = t.VEHICLE || {};
    const plate = vehicle.PlateNumber || '—';
    const customer = t.CUSTOMER || {};
    const custName = ((customer.FirstName || '') + ' ' + (customer.LastName || '')).trim() || '—';
    const dateStr = t.Date ? new Date(t.Date).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const costStr = t.Cost != null ? t.Cost + '€' : '—';
    const status = t.Status || 'pending';
    const isCompleted = status === 'completed';
    const statusHtml = isCompleted
      ? '<span class="pill p-g"><i class="ti ti-check" style="font-size:10px"></i> Ολοκληρώθηκε</span>'
      : '<span class="pill p-a"><i class="ti ti-clock" style="font-size:10px"></i> Εκκρεμεί</span>';

    html += '<tr style="border-bottom:1px solid var(--color-border-tertiary)">'
      + '<td style="padding:8px;font-weight:500">#' + t.TripID + '</td>'
      + '<td style="padding:8px">' + driverName + '</td>'
      + '<td style="padding:8px">' + plate + '</td>'
      + '<td style="padding:8px">' + (t.Destination || '—') + '</td>'
      + '<td style="padding:8px;white-space:nowrap">' + dateStr + '</td>'
      + '<td style="padding:8px;font-weight:500">' + costStr + '</td>'
      + '<td style="padding:8px">' + custName + '</td>'
      + '<td style="padding:8px">' + statusHtml + '</td>'
      + '<td style="padding:8px"><button class="btn btn-sm" style="color:var(--color-danger,#E53E3E)" onclick="window.deleteTrip(' + t.TripID + ')"><i class="ti ti-trash"></i></button></td>'
      + '</tr>';
    });

  tbody.innerHTML = html || '<tr><td style="padding:16px;color:var(--color-text-secondary);text-align:center" colspan="9">Δεν υπάρχουν καταχωρημένες μεταφορές.</td></tr>';
}

/* ==============================================================
   DELETE TRIPS
   ============================================================== */
window.deleteTrip = async function(tripId) {
  if (!await window.showConfirm('Διαγραφή αυτής της μεταφοράς;')) return;
  try {
    const { error } = await supabase.from('TRIP').delete().eq('TripID', tripId);
    if (error) throw error;
    showToast('Η μεταφορά διαγράφηκε.', 'info');
    fetchTripLogs();
  } catch (err) {
    showToast('Σφάλμα διαγραφής: ' + err.message, 'error');
  }
};

window.deleteAllTrips = async function() {
  const { data: trips } = await supabase.from('TRIP').select('TripID');
  if (!trips || trips.length === 0) { showToast('Δεν υπάρχουν μεταφορές προς διαγραφή.', 'info'); return; }
  if (!await window.showConfirm('Διαγραφή όλων των μεταφορών; Η ενέργεια είναι μη αναστρέψιμη.')) return;
  try {
    const ids = trips.map(t => t.TripID);
    const { error } = await supabase.from('TRIP').delete().in('TripID', ids);
    if (error) throw error;
    showToast('Όλες οι μεταφορές διαγράφηκαν.', 'info');
    fetchTripLogs();
  } catch (err) {
    showToast('Σφάλμα διαγραφής: ' + err.message, 'error');
  }
};

/* ==============================================================
   NOTIFICATIONS (από υπάρχον)
   ============================================================== */
async function fetchRestockNotifs() {
  const container = document.getElementById('manager-notifications');
  if (!container) return;
  if (!supabase) return;

  const user = JSON.parse(localStorage.getItem('hotel_user'));
  const role = user ? user.Role : '';

  let query = supabase
    .from('NOTIFICATION')
    .select('*')
    .eq('IsRead', false)
    .order('CreatedAt', { ascending: false });

  if (role === 'external_manager') {
    query = query.eq('TargetRole', 'external_manager');
  } else {
    query = query.in('TargetRole', ['manager', 'both', 'internal_manager']);
  }

  const { data } = await query;

  let html = '';
  (data || []).forEach(n => {
    const time = n.CreatedAt
      ? new Date(n.CreatedAt).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      : '';

    let icon = 'ti ti-package';
    let label = 'Αίτημα Ανεφοδιασμού:';
    let cls = 'ns ns-w';

    if (n.Type === 'trip_completed') {
      icon = 'ti ti-check-circle';
      label = 'Ολοκλήρωση Διαδρομής:';
      cls = 'ns ns-g';
    } else if (n.Type === 'fuel_expense') {
      icon = 'ti ti-receipt';
      label = 'Δαπάνη Οδηγού:';
      cls = 'ns ns-w';
    } else if (n.Type === 'vehicle_fault') {
      icon = 'ti ti-alert-triangle';
      label = 'Αναφορά Βλάβης:';
      cls = 'ns ns-e';
    } else if (n.Type === 'fault') {
      icon = 'ti ti-tool';
      label = 'Βλάβη Κήπου:';
      cls = 'ns ns-e';
    } else if (n.Type === 'supply_request') {
      icon = 'ti ti-seeding';
      label = 'Αίτημα Προμηθειών Κήπου:';
      cls = 'ns ns-w';
    } else if (n.Type === 'restock_request') {
      const parts = n.Message.split(' || ');
      const displayMsg = parts[0] || n.Message;

      html += '<div class="ns ns-w" style="flex-wrap:wrap;gap:8px">'
        + '<i class="ti ti-shopping-cart"></i>'
        + '<div><strong>Αίτημα Παραγγελίας Αποθέματος:</strong> ' + displayMsg + '</div>'
        + '<div style="display:flex;gap:6px;flex-shrink:0">'
        + '<button class="btn btn-sm btn-dark" onclick="event.stopPropagation(); window.acceptRestockRequest(' + n.NotificationID + ')"><i class="ti ti-check"></i> Αποδοχή</button>'
        + '<button class="btn btn-sm" onclick="event.stopPropagation(); window.denyRestockRequest(' + n.NotificationID + ', this)"><i class="ti ti-x"></i> Απόρριψη</button>'
        + '</div>'
        + '</div>';
      return;
    }

    html += '<div class="' + cls + '" onclick="window.dismissNotif(' + n.NotificationID + ', this)" style="cursor:pointer">'
      + '<i class="' + icon + '"></i>'
      + '<div><strong>' + label + '</strong> ' + n.Message + '</div>'
      + '<span style="margin-left:auto;font-size:11px;color:var(--color-text-secondary)">' + time + '</span>'
      + '</div>';
  });

  container.innerHTML = html || '';
}

window.dismissNotif = async function(id, el) {
  try {
    const { data: notif } = await supabase
      .from('NOTIFICATION')
      .select('Type, Message')
      .eq('NotificationID', id)
      .single();
    if (notif) {
      const msg = notif.Message || '';
      if (notif.Type === 'supply_request') {
        await supabase.from('NOTIFICATION').update({ IsRead: true })
          .eq('Type', 'supply_request')
          .eq('TargetRole', 'admin')
          .eq('Message', msg)
          .eq('IsRead', false);
        const itemMatch = msg.match(/Υλικό:\s*(.+)/);
        const itemName = itemMatch ? itemMatch[1].trim() : 'προμήθεια';
        await supabase.from('NOTIFICATION').insert({
          TargetRole: 'gardener',
          Type: 'supply_acknowledged',
          Message: 'Το αίτημα για ' + itemName + ' ελήφθη υπόψη από τον εξωτερικό διαχειριστή.',
          IsRead: false,
          CreatedAt: new Date().toISOString()
        });
      } else if (notif.Type === 'fault') {
        await supabase.from('NOTIFICATION').update({ IsRead: true })
          .eq('Type', 'fault')
          .eq('TargetRole', 'admin')
          .eq('Message', msg)
          .eq('IsRead', false);
        const zoneMatch = msg.match(/Ζώνη:\s*(.+)/);
        const zoneName = zoneMatch ? zoneMatch[1].trim() : 'βλάβη';
        await supabase.from('NOTIFICATION').insert({
          TargetRole: 'gardener',
          Type: 'fault_acknowledged',
          Message: 'Η αναφορά βλάβης (' + zoneName + ') ελήφθη υπόψη από τον εξωτερικό διαχειριστή.',
          IsRead: false,
          CreatedAt: new Date().toISOString()
        });
      }
    }
    await supabase.from('NOTIFICATION').update({ IsRead: true }).eq('NotificationID', id);
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
    showToast('Η ειδοποίηση απορρίφθηκε.', 'info');
  } catch (err) {
    showToast('Σφάλμα απόρριψης.', 'error');
  }
};

window.acceptRestockRequest = async function (id) {
  try {
    const { data: notif } = await supabase
      .from('NOTIFICATION')
      .select('Message')
      .eq('NotificationID', id)
      .single();

    if (!notif) return;

    const parts = notif.Message.split(' || ');
    const idsStr = parts[1];
    const displayMsg = parts[0] || '';

    if (idsStr) {
      const itemIds = idsStr.split(',').map(Number).filter(Boolean);
      for (const itemId of itemIds) {
        const { data: item } = await supabase
          .from('INVENTORY_ITEM')
          .select('MinThreshold')
          .eq('ItemID', itemId)
          .single();

        if (item) {
          const newQty = Math.max(item.MinThreshold * 2, 10);
          await supabase
            .from('INVENTORY_ITEM')
            .update({ Quantity: newQty })
            .eq('ItemID', itemId);
        }
      }
    }

    const itemNames = displayMsg.replace(/^Αίτημα παραγγελίας αποθέματος από minibar:\s*/, '');

    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'minibar',
      Type: 'restock_accepted',
      Message: 'Επιτυχής ανεφοδιασμός: ' + itemNames + ' — Το απόθεμα ανανεώθηκε.',
      IsRead: false,
      CreatedAt: new Date().toISOString()
    });

    await supabase.from('NOTIFICATION').update({ IsRead: true }).eq('NotificationID', id);

    const el = document.querySelector(`[onclick*="acceptRestockRequest(${id})"]`)?.closest('.ns');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }

    showToast('Το αίτημα έγινε αποδεκτό — το απόθεμα ανανεώθηκε.', 'success');
  } catch (err) {
    showToast('Σφάλμα αποδοχής: ' + (err.message || err), 'error');
  }
};

window.denyRestockRequest = async function (id, btn) {
  try {
    const { data: notif } = await supabase
      .from('NOTIFICATION')
      .select('Message')
      .eq('NotificationID', id)
      .single();

    const parts = notif ? notif.Message.split(' || ') : [];
    const displayMsg = parts[0] || '';

    const itemNames = displayMsg.replace(/^Αίτημα παραγγελίας αποθέματος από minibar:\s*/, '');

    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'minibar',
      Type: 'restock_denied',
      Message: 'Το αίτημα παραγγελίας αποθέματος απορρίφθηκε: ' + itemNames,
      IsRead: false,
      CreatedAt: new Date().toISOString()
    });

    await supabase.from('NOTIFICATION').update({ IsRead: true }).eq('NotificationID', id);

    const el = btn?.closest('.ns');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }

    showToast('Το αίτημα απορρίφθηκε.', 'info');
  } catch (err) {
    showToast('Σφάλμα απόρριψης: ' + (err.message || err), 'error');
  }
};

/* ==============================================================
   INTERNAL MANAGER — ΣΥΝΔΕΣΗ ΜΕ SUPABASE
   ============================================================== */
async function fetchPricing() {
  const tbody = document.getElementById('pricing-table-body');
  if (!tbody) return;
  const { data: rooms } = await supabase
    .from('ROOM')
    .select('RoomType, BasePrice');
  if (!rooms) return;
  let multSummer = 1.5, multLow = 0.85;
  const { data: config } = await supabase
    .from('NOTIFICATION')
    .select('Message')
    .eq('Type', 'pricing_config')
    .eq('TargetRole', 'both')
    .order('CreatedAt', { ascending: false })
    .limit(1);
  if (config && config[0]) {
    try {
      const m = JSON.parse(config[0].Message);
      if (m.summer) multSummer = parseFloat(m.summer);
      if (m.low) multLow = parseFloat(m.low);
    } catch (_) {}
  }
  const grouped = {};
  rooms.forEach(r => {
    const t = r.RoomType || 'Άλλο';
    if (!grouped[t]) grouped[t] = { count: 0, prices: [] };
    grouped[t].count++;
    grouped[t].prices.push(Number(r.BasePrice) || 0);
  });
  const typeNames = ['Δίκλινα', 'Φαρδύκλινα', 'Μονόκλινα', 'Σουίτες'];
  const typeLookup = { 'Δίκλινο': 'Δίκλινα', 'Δίκλινα': 'Δίκλινα', 'Φαρδύκλινο': 'Φαρδύκλινα', 'Φαρδύκλινα': 'Φαρδύκλινα', 'Μονόκλινο': 'Μονόκλινα', 'Μονόκλινα': 'Μονόκλινα', 'Σουίτα': 'Σουίτες', 'Σουίτες': 'Σουίτες' };
  const rows = typeNames.map(grName => {
    const dbType = Object.keys(typeLookup).find(k => typeLookup[k] === grName);
    const g = grouped[dbType];
    if (!g) return '<tr style="border-bottom:1px solid var(--color-border-tertiary)"><td style="padding:8px;font-weight:500">' + grName + '</td><td style="padding:8px">0</td><td style="padding:8px">—</td><td style="padding:8px">—</td><td style="padding:8px;font-weight:bold">—</td></tr>';
    const baseMin = Math.min(...g.prices);
    const baseMax = Math.max(...g.prices);
    const baseStr = baseMin === baseMax ? baseMin + '€' : baseMin + '€ – ' + baseMax + '€';
    const highSeason = Math.round(baseMax * multSummer) + '€';
    const zPct = Math.round((1 - multLow) * 100);
    const zPrice = Math.round(baseMin * multLow) + '€';
    return '<tr style="border-bottom:1px solid var(--color-border-tertiary)">'
      + '<td style="padding:8px;font-weight:500">' + grName + '</td>'
      + '<td style="padding:8px">' + g.count + '</td>'
      + '<td style="padding:8px">' + baseStr + '</td>'
      + '<td style="padding:8px">' + highSeason + '</td>'
      + '<td style="padding:8px;font-weight:bold">' + zPrice + '</td></tr>';
  }).join('');
  tbody.innerHTML = rows;
  const zHeader = document.getElementById('pricing-z-header');
  const zCol = document.getElementById('pricing-z-col');
  const zLabel = '*' + (zPct >= 0 ? 'Μείωση ' + zPct + '%' : 'Αύξηση ' + Math.abs(zPct) + '%') + ' (Πληρότητα < 60%)';
  if (zHeader) zHeader.textContent = zLabel;
  if (zCol) zCol.textContent = 'Τελική με -' + zPct + '%';
}

async function fetchHR() {
  const tbody = document.getElementById('hr-table-body');
  if (!tbody) return;
  const { data: employees } = await supabase
    .from('EMPLOYEE')
    .select('FirstName, LastName, Role, Leaves, LastPaymentDate, isActive, EmpID')
    .order('LastName');
  if (!employees) return;
  const { data: shifts } = await supabase
    .from('SHIFT')
    .select('EmpID, Hours, Date');
  const shiftMap = {};
  (shifts || []).forEach(s => {
    if (!shiftMap[s.EmpID]) shiftMap[s.EmpID] = [];
    shiftMap[s.EmpID].push(s);
  });
  const rows = employees.map(e => {
    const name = (e.FirstName || '') + ' ' + (e.LastName || '');
    const empShifts = shiftMap[e.EmpID] || [];
    const latestShift = empShifts.sort((a, b) => new Date(b.Date) - new Date(a.Date))[0];
    const shiftStr = latestShift ? latestShift.Hours + ' ώρες' : (e.isActive ? '—' : '<span class="pill p-a">Σε Άδεια</span>');
    const leaves = e.Leaves != null ? e.Leaves + ' ημ. Υπόλοιπο' : '—';
    const paid = e.LastPaymentDate ? '<span style="font-weight:bold;color:#1D9E75">Εκκαθαρίστηκε</span>' : '<span style="font-weight:bold;color:#D85A30">Εκκρεμεί</span>';
    return '<tr style="border-bottom:1px solid var(--color-border-tertiary)">'
      + '<td style="padding:8px;font-weight:500">' + (name.trim() || e.EmpID) + '</td>'
      + '<td style="padding:8px">' + (e.Role || '—') + '</td>'
      + '<td style="padding:8px">' + shiftStr + '</td>'
      + '<td style="padding:8px">' + leaves + '</td>'
      + '<td style="padding:8px">' + paid + '</td></tr>';
  }).join('');
  tbody.innerHTML = rows || '<tr><td style="padding:8px;color:var(--color-text-tertiary)" colspan="5">Δεν υπάρχουν υπάλληλοι</td></tr>';
}

async function fetchRents() {
  const list = document.getElementById('rents-list');
  if (!list) return;
  const { data: shops } = await supabase
    .from('RENTED_SHOP')
    .select('ShopID, ShopName, TenantName, MonthlyRent');
  if (!shops || shops.length === 0) {
    list.innerHTML = '<div style="padding:12px;color:var(--color-text-tertiary);font-size:13px">Δεν υπάρχουν καταστήματα</div>';
    return;
  }
  const { data: payments } = await supabase
    .from('LEASE_PAYMENT')
    .select('ShopID, Amount, IsDelayed, PaymentID');
  const paymentMap = {};
  (payments || []).forEach(p => {
    if (!paymentMap[p.ShopID]) paymentMap[p.ShopID] = [];
    paymentMap[p.ShopID].push(p);
  });
  let hasDelayed = false;
  const cards = shops.map(s => {
    const shopPayments = paymentMap[s.ShopID] || [];
    const hasDelayedPayment = shopPayments.some(p => p.IsDelayed);
    if (hasDelayedPayment) hasDelayed = true;
    const lastPay = shopPayments.sort((a, b) => b.PaymentID - a.PaymentID)[0];
    const status = hasDelayedPayment ? 'Καθυστέρηση πληρωμής' : (lastPay ? 'Πληρώθηκε' : 'Αναμονή');
    const urgency = hasDelayedPayment ? 'urgent' : '';
    const pilClass = hasDelayedPayment ? 'p-r' : 'p-g';
    const name = (s.ShopName || 'Κατάστημα ' + s.ShopID) + (s.TenantName ? ' (' + s.TenantName + ')' : '');
    return '<div class="room-card' + (urgency ? ' ' + urgency : '') + '">'
      + '<div class="room-info"><div style="font-weight:600;font-size:14px">' + name + '</div>'
      + '<div class="room-type">Ενοίκιο: ' + status + (lastPay ? ' (' + (lastPay.Amount || '—') + '€)' : '') + '</div>'
      + (hasDelayedPayment ? '<div class="room-guest" style="color:#791F1F">Καθυστέρηση πληρωμής ενοικίου</div>' : '')
      + '</div>'
      + '<span class="pill ' + pilClass + '">' + (hasDelayedPayment ? 'Καθυστέρηση' : 'ΟΚ') + '</span>'
      + (hasDelayedPayment ? '<button class="btn btn-dark" onclick="resolveDelayedPayment(' + s.ShopID + ')">Ειδοποίηση Δικηγόρου</button>' : '')
      + '</div>';
  }).join('');
  list.innerHTML = cards;
  const delCountEl = document.querySelector('.sb-item[data-v="rents"] .sb-badge');
  if (delCountEl) {
    delCountEl.textContent = hasDelayed ? '1' : '0';
    delCountEl.style.display = hasDelayed ? '' : 'none';
  }
  const legalNotice = document.getElementById('legal-notice');
  const legalText = document.getElementById('legal-notice-text');
  if (legalNotice && legalText) {
    if (hasDelayed) {
      legalNotice.style.display = '';
      legalText.textContent = 'Καθυστέρηση πληρωμής από Μισθωτή Καταστήματος. Απαιτείται ειδοποίηση δικηγόρου.';
    } else {
      legalNotice.style.display = 'none';
    }
  }
}

window.resolveDelayedPayment = async function(shopId) {
  if (!supabase) return;
  try {
    await supabase
      .from('LEASE_PAYMENT')
      .update({ IsDelayed: false })
      .eq('ShopID', shopId)
      .eq('IsDelayed', true);
    showToast('legal-toast');
    fetchRents();
  } catch (err) {
    showToast('Σφάλμα ενημέρωσης: ' + err.message, 'error');
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
    item.addEventListener('click', () => window.navTo(item.dataset.v));
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', window.logout);

  fetchOverview();
  fetchInventory();
  fetchDriverSchedule();
  fetchFleetMaintenance();
  fetchPayroll();
  fetchTripFormData();
  fetchTripLogs();
  fetchPricing();
  fetchHR();
  fetchRents();
  fetchRestockNotifs();
  setInterval(fetchRestockNotifs, 30000);
  setInterval(fetchPricing, 30000);

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

/* ==============================================================
   ΑΝΑΘΕΣΗ ΕΡΓΑΣΙΑΣ ΣΕ ΚΗΠΟΥΡΟ
   ============================================================== */
window.selectGardenerPreset = function(value) {
    const input = document.getElementById('gardener-task-name');
    if (input) {
        input.value = value;
        document.getElementById('gardener-task-presets')?.classList.remove('show');
        input.focus();
    }
};

window.toggleGardenerEvent = function() {
    const section = document.getElementById('gardener-event-section');
    const cb = document.getElementById('gardener-event-toggle');
    if (!section || !cb) return;
    section.style.display = cb.checked ? 'block' : 'none';
    if (cb.checked) {
        document.getElementById('gardener-event-title')?.focus();
        if (document.querySelectorAll('#gardener-event-rows .gardener-event-row').length === 0) addGardenerEventRow();
    }
};

const GEV_TASK_PRESETS = ['Κλάδεμα', 'Πότισμα', 'Καθαρισμός', 'Κούρεμα γκαζόν', 'Έλεγχος'];
const GEV_LOC_PRESETS = ['Κεντρική Είσοδος', 'Χώρος Πισίνας', 'Νότιος Κήπος', 'Parking', 'Πίσω αυλή'];

function showGevPopup(input, type) {
    const popup = document.getElementById('gardener-row-popup');
    if (!popup) return;
    const options = type === 'location' ? GEV_LOC_PRESETS : GEV_TASK_PRESETS;
    popup.innerHTML = options.map(o => '<div class="gardener-dropdown-item">' + o + '</div>').join('');
    const rect = input.getBoundingClientRect();
    popup.style.top = (rect.bottom + 2) + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.width = Math.max(rect.width, 120) + 'px';
    popup.style.display = 'block';
    popup.querySelectorAll('.gardener-dropdown-item').forEach(item => {
        item.onclick = function() {
            input.value = this.textContent;
            popup.style.display = 'none';
            input.focus();
        };
    });
}

function hideGevPopup() {
    const popup = document.getElementById('gardener-row-popup');
    if (popup) popup.style.display = 'none';
}

document.addEventListener('click', function(e) {
    const popup = document.getElementById('gardener-row-popup');
    if (popup && popup.style.display === 'block' && !popup.contains(e.target) && !e.target.closest('.gev-name, .gev-location')) {
        popup.style.display = 'none';
    }
});

window.addGardenerEventRow = function() {
    const container = document.getElementById('gardener-event-rows');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'gardener-event-row';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px';
    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.className = 'gev-name';
    nameInp.placeholder = 'π.χ. Κλάδεμα';
    nameInp.style.cssText = 'flex:1;padding:6px 8px;border:1px solid var(--color-border-tertiary);border-radius:var(--border-radius-md);font-size:12px;background:var(--color-background-primary);color:var(--color-text-primary);outline:none';
    nameInp.autocomplete = 'off';
    const locInp = document.createElement('input');
    locInp.type = 'text';
    locInp.className = 'gev-location';
    locInp.placeholder = 'Τοποθεσία';
    locInp.style.cssText = 'flex:1;padding:6px 8px;border:1px solid var(--color-border-tertiary);border-radius:var(--border-radius-md);font-size:12px;background:var(--color-background-primary);color:var(--color-text-primary);outline:none';
    locInp.autocomplete = 'off';
    nameInp.addEventListener('focus', function() { showGevPopup(this, 'task'); });
    nameInp.addEventListener('blur', function() { setTimeout(hideGevPopup, 200); });
    locInp.addEventListener('focus', function() { showGevPopup(this, 'location'); });
    locInp.addEventListener('blur', function() { setTimeout(hideGevPopup, 200); });
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm';
    delBtn.style.cssText = 'color:#E53E3E;flex-shrink:0;padding:4px 8px';
    delBtn.innerHTML = '<i class="ti ti-trash"></i>';
    delBtn.onclick = function() { row.remove(); };
    row.appendChild(nameInp);
    row.appendChild(locInp);
    row.appendChild(delBtn);
    container.appendChild(row);
    nameInp.focus();
};

window.submitGardenerTask = async function() {
    const isEvent = document.getElementById('gardener-event-toggle')?.checked || false;
    const name = document.getElementById('gardener-task-name');
    const loc = document.getElementById('gardener-task-location');
    let message;
    if (isEvent) {
        const title = document.getElementById('gardener-event-title');
        const date = document.getElementById('gardener-event-date');
        const tasks = [];
        document.querySelectorAll('#gardener-event-rows .gardener-event-row').forEach(row => {
            const n = row.querySelector('.gev-name');
            const l = row.querySelector('.gev-location');
            if (n && n.value.trim()) tasks.push({ name: n.value.trim(), location: l ? l.value.trim() : '' });
        });
        if (!title || !title.value.trim()) { showToast('Συμπληρώστε το όνομα εκδήλωσης.', 'warning'); return; }
        if (!date || !date.value) { showToast('Συμπληρώστε την ημερομηνία εκδήλωσης.', 'warning'); return; }
        if (tasks.length === 0) { showToast('Προσθέστε τουλάχιστον μία εργασία εκδήλωσης.', 'warning'); return; }
        message = JSON.stringify({ eventTitle: title.value.trim(), eventDate: date.value, tasks });
    } else {
        if (!name || name.value.trim() === '') { showToast('Συμπληρώστε την περιγραφή εργασίας.', 'warning'); return; }
        message = name.value.trim() + (loc && loc.value.trim() ? '||' + loc.value.trim() : '||');
    }
    try {
        const { error } = await supabase.from('NOTIFICATION').insert({
            TargetRole: 'gardener',
            Type: 'gardener_task',
            Message: message,
            IsRead: false,
            CreatedAt: new Date().toISOString()
        });
        if (error) throw error;
        if (name) name.value = '';
        if (loc) loc.value = '';
        if (isEvent) {
            document.getElementById('gardener-event-toggle').checked = false;
            document.getElementById('gardener-event-section').style.display = 'none';
            document.getElementById('gardener-event-title').value = '';
            document.getElementById('gardener-event-date').value = '';
            document.getElementById('gardener-event-rows').innerHTML = '';
        }
        showToast('Η εργασία ανατέθηκε στον κηπουρό!', 'success');
    } catch (err) {
        showToast('Αποτυχία: ' + err.message, 'error');
    }
};

// Dropdown presets for gardener task
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('gardener-task-name');
    const dropdown = document.getElementById('gardener-task-presets');
    if (!input || !dropdown) return;

    input.addEventListener('focus', () => dropdown.classList.add('show'));
    input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('show'), 150));
    const locInput = document.getElementById('gardener-task-location');
    const locDropdown = document.getElementById('gardener-location-presets');
    if (locInput && locDropdown) {
        locInput.addEventListener('focus', () => locDropdown.classList.add('show'));
        locInput.addEventListener('blur', () => setTimeout(() => locDropdown.classList.remove('show'), 150));
    }
});

window.selectGardenerLocation = function(value) {
    const input = document.getElementById('gardener-task-location');
    if (input) {
        input.value = value;
        document.getElementById('gardener-location-presets')?.classList.remove('show');
        input.focus();
    }
};
