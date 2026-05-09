const rooms = [
    { number: 101, status: "available" },
    { number: 102, status: "occupied" },
    { number: 103, status: "cleaning" }
];

const roomsContainer = document.getElementById("roomsContainer");

rooms.forEach(room => {

    const div = document.createElement("div");

    div.classList.add("room");
    div.classList.add(room.status);

    div.innerText = `Room ${room.number} - ${room.status}`;

    roomsContainer.appendChild(div);

});