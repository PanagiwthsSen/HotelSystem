function login(){

  const username =
    document.getElementById("username").value.trim();

  const password =
    document.getElementById("password").value.trim();

  const error =
    document.getElementById("error-message");

  if(username === "admin" && password === "1234"){

    error.classList.remove("show");

    alert("Επιτυχής σύνδεση!");

    // redirect example
     window.location.href = "dashboard.html";

  } else {

    error.classList.add("show");

  }

}