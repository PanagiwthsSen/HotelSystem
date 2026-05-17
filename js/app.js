/* script.js */

// Άνοιγμα αναζήτησης στο ίδιο tab
function searchRoomsPage() {
  const checkin = document.getElementById('s-in').value;
  const checkout = document.getElementById('s-out').value;
  const type = document.getElementById('s-type').value;
  const pax = document.getElementById('s-pax').value;

  // Δημιουργία παραμέτρων URL
  const queryParams = new URLSearchParams({
    checkin: checkin,
    checkout: checkout,
    type: type,
    pax: pax
  }).toString();

  // Αλλαγή σελίδας στο ίδιο παράθυρο/tab
  window.location.href = `../pages/booking.html?${queryParams}`;
}

// Άνοιγμα φόρμας κράτησης συγκεκριμένου δωματίου στο ίδιο tab
function bookRoomPage(roomName, price) {
  const checkin = document.getElementById('s-in').value;
  const checkout = document.getElementById('s-out').value;
  
  const queryParams = new URLSearchParams({
    room: roomName,
    price: price || 0,
    checkin: checkin,
    checkout: checkout
  }).toString();

  // Αλλαγή σελίδας στο ίδιο παράθυρο/tab
  window.location.href = `../pages/booking.html?${queryParams}`;
}

/* * ----------------------------------------------------------------------
 * ΥΠΟΘΕΤΙΚΗ ΛΟΓΙΚΗ ΒΑΣΗΣ ΔΕΔΟΜΕΝΩΝ & ΕΙΔΟΠΟΙΗΣΕΩΝ (ΓΙΑ ΤΟ ΝΕΟ ΑΡΧΕΙΟ booking.html)
 * ----------------------------------------------------------------------
 */
async function processBookingSubmission(bookingData) {
  try {
    // 1. Εγγραφή στη βάση δεδομένων (API Endpoint)
    const dbResponse = await fetch('/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData)
    });

    if (dbResponse.ok) {
      // 2. Ενημέρωση / Ειδοποίηση προσωπικού (Webhook ή API)
      await fetch('/api/notifications/notify-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Νέα κράτηση: ${bookingData.roomName} από ${bookingData.guestName}`,
          urgent: true
        })
      });

      console.log("Η κράτηση αποθηκεύτηκε επιτυχώς και στάλθηκαν οι ειδοποιήσεις.");
    } else {
      console.error("Πρόβλημα κατά την αποθήκευση της κράτησης.");
    }
  } catch (error) {
    console.error("Σφάλμα δικτύου:", error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const plus3 = new Date(today);
  plus3.setDate(plus3.getDate() + 3);
  const fmt = d => d.toISOString().split('T')[0];
  const si = document.getElementById('s-in');
  const so = document.getElementById('s-out');
  if (si) si.value = fmt(today);
  if (so) so.value = fmt(plus3);
});