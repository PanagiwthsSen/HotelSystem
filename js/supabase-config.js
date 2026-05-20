import { createClient } from '@supabase/supabase-js';

// Το Vite απαιτεί το πρόθεμα VITE_ για να αναγνωρίσει τις μεταβλητές
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// Έλεγχος αν οι μεταβλητές φορτώθηκαν (θα το δεις στο console αν λείπουν)
if (!supabaseUrl || !supabaseKey) {
    console.error("Σφάλμα: Οι μεταβλητές περιβάλλοντος δεν βρέθηκαν στο .env!");
}

// Δημιουργία του client και ανάθεση στο window για να είναι global
export const supabase = createClient(supabaseUrl, supabaseKey);
window.supabase = supabase;

// Επαναχρησιμοποιούμενο modal επιβεβαίωσης (αντικαθιστά το native confirm())
window.showConfirm = function(message) {
  return new Promise((resolve) => {
    const existing = document.querySelector('.confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal">
        <div class="pw-head">
          <i class="ti ti-alert-triangle"></i>
          <span>${message}</span>
          <span class="pw-close" id="confirm-no">&times;</span>
        </div>
        <div class="pw-foot">
          <button class="btn" id="confirm-no">Ακύρωση</button>
          <button class="btn btn-dark" id="confirm-yes"><i class="ti ti-check"></i> Ναι</button>
        </div>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(false); }
    });
    document.body.appendChild(overlay);

    overlay.querySelector('#confirm-yes').addEventListener('click', () => {
      overlay.remove(); resolve(true);
    });
    overlay.querySelector('#confirm-no').addEventListener('click', () => {
      overlay.remove(); resolve(false);
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { overlay.remove(); resolve(true); }
      if (e.key === 'Escape') { overlay.remove(); resolve(false); }
    });
    overlay.querySelector('#confirm-yes').focus();
  });
};

// Έλεγχος χωρητικότητας ανά τύπο δωματίου για δεδομένες ημερομηνίες
window.checkRoomTypeCapacity = async function(roomType, checkIn, checkOut) {
  try {
    const { data: totalData, error: totalErr } = await window.supabase
      .from('ROOM')
      .select('RoomNumber')
      .eq('RoomType', roomType);
    if (totalErr) throw totalErr;
    const total = totalData ? totalData.length : 0;

    const { data: bookedData, error: bookedErr } = await window.supabase
      .from('RESERVATION')
      .select('ReservationID')
      .eq('RoomType', roomType)
      .not('Status', 'in', '("Cancelled","CheckedOut")')
      .lt('CheckInDate', checkOut)
      .gt('CheckOutDate', checkIn);
    if (bookedErr) throw bookedErr;
    const booked = bookedData ? bookedData.length : 0;

    return { total, booked, available: total - booked, isFull: booked >= total };
  } catch (err) {
    console.error('Capacity check error:', err);
    return { total: 0, booked: 0, available: 0, isFull: false };
  }
};