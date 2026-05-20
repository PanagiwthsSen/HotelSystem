/* booking.js */

function showToast(message, type = 'success') {
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

let currentStep = 1;
let bookingData = {
  room: 'Δωμάτιο Standard',
  price: 0,
  totalCost: 0,
  checkin: '',
  checkout: '',
  first: '',
  last: '',
  email: '',
  phone: '',
  country: 'GR',
  reservationId: null
};

function initApp() {
  const loader = document.getElementById('app-loader');
  if (loader) loader.style.display = 'none';
  document.querySelector('.site').style.display = 'block';

  const params = new URLSearchParams(window.location.search);
  bookingData.room = params.get('room') || (params.get('type') === 'suite' ? 'Σουίτα' : 'Επιλεγμένο Δωμάτιο');
  bookingData.price = parseFloat(params.get('price')) || 140;
  bookingData.totalCost = parseFloat(params.get('totalCost')) || 0;
  
  const today = new Date();
  const defaultCheckin = today.toISOString().split('T')[0];
  const defaultCheckout = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  bookingData.checkin = params.get('checkin') || defaultCheckin;
  bookingData.checkout = params.get('checkout') || defaultCheckout;

  if (bookingData.room !== 'Επιλεγμένο Δωμάτιο' && bookingData.room !== 'Οποιοδήποτε') {
    document.getElementById('form-title').textContent = 'Κράτηση: ' + bookingData.room;
  }

  renderStep();
}

function calcNights() {
  const i = new Date(bookingData.checkin);
  const o = new Date(bookingData.checkout);
  const diff = (o - i) / (1000 * 60 * 60 * 24);
  return diff > 0 ? Math.round(diff) : 1;
}

function calcPrepay(total, checkin) {
  const now = new Date();
  const arr = new Date(checkin);
  const days = Math.round((arr - now) / (1000 * 60 * 60 * 24));
  if (days > 90) return { pct: 50, label: '50% (λόγω κράτησης >90 ημέρες πριν)' };
  return { pct: 20, label: '20% (στάνταρ προκαταβολή)' };
}

function fmtDate(d) {
  if (!d) return '';
  const parts = d.split('-');
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function renderStep() {
  const nights = calcNights();
  const total = bookingData.totalCost > 0 ? bookingData.totalCost : bookingData.price * nights;
  const prepay = calcPrepay(total, bookingData.checkin);
  const prepayAmt = Math.round(total * prepay.pct / 100);

  const dots = [1, 2, 3].map(i => `<div class="step-dot ${i < currentStep ? 'done' : i === currentStep ? 'active' : ''}"></div>`).join('');
  const bodyEl = document.getElementById('form-body');
  const footerEl = document.getElementById('form-footer');

  if (currentStep === 1) {
    bodyEl.innerHTML = `
      <div class="step-indicator">${dots}</div>
      <div class="step-label">Βήμα 1 — Στοιχεία επισκέπτη</div>
      <div class="summary-box">
        <div class="sum-row"><span>Τύπος</span><span>${bookingData.room}</span></div>
        <div class="sum-row"><span>Άφιξη</span><span>${fmtDate(bookingData.checkin)}</span></div>
        <div class="sum-row"><span>Αναχώρηση</span><span>${fmtDate(bookingData.checkout)}</span></div>
        ${bookingData.price > 0 ? `<div class="sum-row total"><span>Εκτιμώμενο σύνολο</span><span>€${total} (${nights} νύχτες)</span></div>` : ''}
      </div>
      <div class="mform-row">
        <div class="mform-group"><label>Επώνυμο *</label><input type="text" id="f-last" value="${bookingData.last}"></div>
        <div class="mform-group"><label>Όνομα *</label><input type="text" id="f-first" value="${bookingData.first}"></div>
      </div>
      <div class="mform-group"><label>Email *</label><input type="email" id="f-email" value="${bookingData.email}"></div>
      <div class="mform-group"><label>Τηλέφωνο *</label><input type="tel" id="f-phone" value="${bookingData.phone}"></div>
      <div class="mform-group"><label>Χώρα προέλευσης</label>
        <select id="f-country">
          <option value="GR" ${bookingData.country === 'GR' ? 'selected' : ''}>Ελλάδα</option>
          <option value="DE" ${bookingData.country === 'DE' ? 'selected' : ''}>Γερμανία</option>
          <option value="GB" ${bookingData.country === 'GB' ? 'selected' : ''}>Ηνωμένο Βασίλειο</option>
          <option value="OTHER" ${bookingData.country === 'OTHER' ? 'selected' : ''}>Άλλη χώρα</option>
        </select>
      </div>`;
    footerEl.innerHTML = `<button class="btn-next" onclick="nextStep()">Επόμενο Βήμα →</button>`;
  } 
  else if (currentStep === 2) {
    bodyEl.innerHTML = `
      <div class="step-indicator">${dots}</div>
      <div class="step-label">Βήμα 2 — Πληρωμή & Επιβεβαίωση</div>
      ${bookingData.price > 0 ? `<div class="prepay-note">Απαιτείται προκαταβολή ${prepay.label}: <strong>€${prepayAmt}</strong>. Το υπόλοιπο ποσό εξοφλείται κατά την άφιξή σας.</div>` : ''}
      <div class="mform-group"><label>Αριθμός κάρτας</label><input type="text" id="f-card" placeholder="•••• •••• •••• ••••" maxlength="19"></div>
      <div class="mform-row">
        <div class="mform-group"><label>Λήξη (ΜΜ/ΧΧ)</label><input type="text" id="f-exp" placeholder="05/28" maxlength="5"></div>
        <div class="mform-group"><label>CVV</label><input type="text" id="f-cvv" placeholder="•••" maxlength="4"></div>
      </div>
      <div class="mform-group"><label>Ειδικές απαιτήσεις / Σχόλια</label><input type="text" id="f-notes" placeholder="π.χ. ψηλός όροφος, παιδικό κρεβάτι..."></div>
      ${bookingData.price > 0 ? `
      <div class="summary-box" style="margin-top:20px">
        <div class="sum-row"><span>Καθαρή Αξία</span><span>€${total}</span></div>
        <div class="sum-row"><span>ΦΠΑ (13%)</span><span>€${Math.round(total * 0.13)}</span></div>
        <div class="sum-row total"><span>Συνολικό Κόστος</span><span>€${Math.round(total * 1.13)}</span></div>
        <div class="sum-row" style="color:#A8892A;font-size:14px;font-weight:500;margin-top:4px;"><span>Χρέωση κάρτας τώρα</span><span>€${Math.round(prepayAmt * 1.13)}</span></div>
      </div>` : ''}`;
    footerEl.innerHTML = `
      <button class="btn-back" onclick="prevStep()">← Πίσω</button>
      <button class="btn-next" onclick="nextStep()">Ολοκλήρωση Κράτησης</button>`;
    
    setTimeout(() => {
      document.getElementById('f-card')?.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19);
      });
    }, 0);
  } 
  else if (currentStep === 3) {
    const code = bookingData.reservationId ? 'GKH-' + bookingData.reservationId : ('GKH-' + Math.floor(10000 + Math.random() * 90000));
    const totalFinal = Math.round((bookingData.totalCost > 0 ? bookingData.totalCost : bookingData.price * calcNights()) * 1.13);
    bodyEl.innerHTML = `
      <div class="step-indicator">${dots}</div>
      <div class="success-msg">
        <div class="success-banner">
          <i class="ti ti-circle-check"></i>
          <span>Η κράτησή σας ολοκληρώθηκε!</span>
        </div>
        <div class="conf-code">${code}</div>
        <div class="summary-box">
          <div class="sum-row"><span>Επώνυμο</span><span>${bookingData.last}</span></div>
          <div class="sum-row"><span>Όνομα</span><span>${bookingData.first}</span></div>
          <div class="sum-row"><span>Τύπος Δωματίου</span><span>${bookingData.room}</span></div>
          <div class="sum-row"><span>Άφιξη</span><span>${fmtDate(bookingData.checkin)}</span></div>
          <div class="sum-row"><span>Αναχώρηση</span><span>${fmtDate(bookingData.checkout)}</span></div>
          <div class="sum-row"><span>Διανυκτερεύσεις</span><span>${nights}</span></div>
          <div class="sum-row total"><span>Συνολικό Κόστος (με ΦΠΑ)</span><span>€${totalFinal}</span></div>
        </div>
        <div class="success-note">
          <i class="ti ti-mail"></i> Email επιβεβαίωσης στάλθηκε στο <strong>${bookingData.email}</strong>
        </div>
      </div>`;
    footerEl.innerHTML = `<button class="btn-home" onclick="window.location.href='../index.html'"><i class="ti ti-check"></i> Επιστροφή στην Αρχική</button>`;
  }
}

async function nextStep() {
  if (currentStep === 1) {
    const last = document.getElementById('f-last').value.trim();
    const first = document.getElementById('f-first').value.trim();
    const email = document.getElementById('f-email').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    if (!last || !first || !email || !phone) {
      showToast('Παρακαλώ συμπληρώστε τα υποχρεωτικά πεδία (Όνομα, Επώνυμο, Email, Τηλέφωνο).', 'error');
      return;
    }
    bookingData.last = last;
    bookingData.first = first;
    bookingData.email = email;
    bookingData.phone = document.getElementById('f-phone').value;
    bookingData.country = document.getElementById('f-country').value;
  }
  
  if (currentStep === 2) {
    const card = document.getElementById('f-card').value.replace(/\s/g, '');
    if (card.length < 16) {
      showToast('Παρακαλώ εισάγετε έναν έγκυρο αριθμό κάρτας 16 ψηφίων.', 'error');
      return;
    }
    try {
      const cap = await window.checkRoomTypeCapacity(bookingData.room, bookingData.checkin, bookingData.checkout);
      if (cap.isFull) {
        showToast('Λυπούμαστε, όλα τα δωμάτια τύπου ' + bookingData.room + ' είναι κλεισμένα για αυτές τις ημερομηνίες.', 'error');
        return;
      }
    } catch (e) {
      console.warn('Capacity check failed, proceeding anyway:', e);
    }
    try {
      await processBookingSubmission(bookingData);
    } catch (err) {
      return;
    }
  }
  
  if (currentStep < 3) {
    currentStep++;
    renderStep();
  }
}

function prevStep() {
  if (currentStep > 1) {
    currentStep--;
    renderStep();
  }
}

async function processBookingSubmission(data) {
  const baseTotal = data.totalCost > 0 ? data.totalCost : data.price * calcNights();
  const totalCost = Math.round(baseTotal * 1.13);

  try {
    if (!await window.showConfirm('Ολοκλήρωση κράτησης;')) return;
    const { data: customer, error: custError } = await window.supabase
      .from('CUSTOMER')
      .insert([{
        FirstName: data.first,
        LastName: data.last,
        Email: data.email,
        Phone: data.phone,
        Country: data.country,
        IsGroup: false
      }])
      .select()
      .single();

    if (custError) throw custError;

    const { data: maxRow } = await window.supabase
      .from('RESERVATION')
      .select('ReservationID')
      .order('ReservationID', { ascending: false })
      .limit(1);
    const nextId = (maxRow?.[0]?.ReservationID || 0) + 1;

    const { data: reservation, error: resError } = await window.supabase
      .from('RESERVATION')
      .insert([{
        ReservationID: nextId,
        CustomerID: customer.CustomerID,
        CheckInDate: data.checkin,
        CheckOutDate: data.checkout,
        TotalCost: totalCost,
        RoomType: data.room,
        Status: 'Confirmed'
      }])
      .select()
      .single();

    if (resError) throw resError;

    data.reservationId = reservation.ReservationID;
    showToast('Η κράτηση καταχωρήθηκε επιτυχώς!', 'success');

  } catch (err) {
    showToast('Αποτυχία κράτησης: ' + err.message, 'error');
    throw err;
  }
}

document.addEventListener('DOMContentLoaded', initApp);
