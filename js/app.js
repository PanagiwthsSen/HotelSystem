let currentStep = 1;

let bookingData = {};

function filterRooms() {

  const type = document.getElementById("s-type").value;

  const cards = document.querySelectorAll(".room-card");

  const names = {
    mono: "Μονόκλινο",
    dik: "Δίκλινο",
    far: "Φαρδύκλινο",
    suite: "Σουίτα"
  };

  cards.forEach(card => {

    const roomName =
      card.querySelector(".room-name").textContent;

    if (!type || roomName.includes(names[type])) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }

  });

}

function openModal(room, price) {

  bookingData.room = room;
  bookingData.price = price;

  document
    .getElementById("modal-overlay")
    .classList.add("open");

  renderStep();

}

function closeModal() {

  document
    .getElementById("modal-overlay")
    .classList.remove("open");

}

function renderStep() {

  const modalBody =
    document.getElementById("modal-body");

  const modalFooter =
    document.getElementById("modal-footer");

  modalBody.innerHTML = `
    <p>
      Επιβεβαίωση κράτησης για:
      <strong>${bookingData.room}</strong>
    </p>

    <br>

    <p>
      Τιμή:
      <strong>€${bookingData.price}</strong>
      / βράδυ
    </p>
  `;

  modalFooter.innerHTML = `
    <button class="btn-next" onclick="completeBooking()">
      Ολοκλήρωση
    </button>
  `;

}

function completeBooking() {

  document.getElementById("modal-body").innerHTML = `
    <h2>Η κράτηση ολοκληρώθηκε ✅</h2>

    <br>

    <p>
      Ευχαριστούμε που επιλέξατε το Grand Kavala Hotel.
    </p>
  `;

  document.getElementById("modal-footer").innerHTML = `
    <button class="btn-next" onclick="closeModal()">
      Κλείσιμο
    </button>
  `;

}