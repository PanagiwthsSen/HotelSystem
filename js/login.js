function login() {
    // 1. Παίρνουμε τις τιμές που έγραψε ο χρήστης
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    
    // 2. Εντοπίζουμε το κουτί του μηνύματος λάθους
    const error = document.getElementById("error-message");

    // 3. Έλεγχος στοιχείων για Admin
    if (username === "admin" && password === "1234") {
        error.classList.remove("show"); // Κρύβουμε τυχόν παλιό σφάλμα
        alert("Επιτυχής σύνδεση ως Admin!");
        
        // Ανακατεύθυνση στη σελίδα του Admin (άλλαξε το path αν χρειάζεται)
        window.location.href = "../pages/admin.html"; 

    // 4. Έλεγχος στοιχείων για Receptionist
    } else if (username === "receptionist" && password === "5678") {
        error.classList.remove("show"); // Κρύβουμε τυχόν παλιό σφάλμα
        alert("Επιτυχής σύνδεση ως Receptionist!");
        
        // Ανακατεύθυνση στη σελίδα του Ρεσεψιονίστ (άλλαξε το path αν χρειάζεται)
        window.location.href = "../pages/receptionist.html"; 

    // 5. Έλεγχος στοιχείων για Maid
    } else if (username === "maid" && password === "1212") {
        error.classList.remove("show"); // Κρύβουμε τυχόν παλιό σφάλμα
        alert("Επιτυχής σύνδεση ως Maid!");
        
        // Ανακατεύθυνση στη σελίδα του Maid (άλλαξε το path αν χρειάζεται)
        window.location.href = "../pages/maid.html"; 
        
    // 6. Έλεγχος στοιχείων για Minibar
    } else if (username === "minibar" && password === "1111") {
        error.classList.remove("show"); // Κρύβουμε τυχόν παλιό σφάλμα
        alert("Επιτυχής σύνδεση ως Mini-bar!");
        
        // Ανακατεύθυνση στη σελίδα του Mini-bar (άλλαξε το path αν χρειάζεται)
         window.location.href = "../pages/minibar.html"; 
    } else {
        // Εμφάνιση του αναδυόμενου μηνύματος λάθους
        error.classList.add("show");
        
        // Κρύβουμε το μήνυμα αυτόματα μετά από 3 δευτερόλεπτα (3000ms)
        setTimeout(() => {
            error.classList.remove("show");
        }, 3000);
    }
}

function logout() {
    // Ελέγχει αν υπάρχει η συνάρτηση showToast στη συγκεκριμένη σελίδα
    if (typeof showToast === "function") {
        showToast("Γίνεται αποσύνδεση... Παρακαλώ περιμένετε.", "info");
    } else {
        // Αν δεν υπάρχει, βγάζει απλό μήνυμα
        alert("Γίνεται αποσύνδεση...");
    }

    // Περιμένει 1.5 δευτερόλεπτο και σε πάει στο login
    setTimeout(() => {
        window.location.href = "login.html"; // Βεβαιώσου ότι αυτό είναι το σωστό path!
    }, 1500);
}