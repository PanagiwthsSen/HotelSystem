import { supabase } from './supabase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('app-loader');
    if (loader) loader.style.display = 'none';
    document.querySelector('.login-container').style.display = 'block';

    // Έλεγχος αν ο χρήστης είναι ήδη συνδεδεμένος
    const savedUser = localStorage.getItem('hotel_user');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        redirectToRole(user.Role);
        return;
    }

    const loginForm = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-message');

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const usernameInput = document.getElementById('username').value.trim();
            const passwordInput = document.getElementById('password').value.trim();

            try {
                // Αναζήτηση στον πίνακα EMPLOYEE
                const { data, error } = await supabase
                    .from('EMPLOYEE')
                    .select('EmpID, FirstName, LastName, Role, isActive')
                    .eq('Username', usernameInput)
                    .eq('Password', passwordInput)
                    .maybeSingle()

                if (error) throw error;

                if (data) {
                    if (!data.isActive) {
                        alert("Ο λογαριασμός σας είναι ανενεργός.");
                        return;
                    }

                    const displayName = `${data.FirstName || ''} ${data.LastName || ''}`.trim();

                    // Αποθήκευση συνεδρίας (session)
                    localStorage.setItem('hotel_user', JSON.stringify({
                        id: data.EmpID,
                        name: displayName,
                        Role: data.Role
                    }));

                    alert(`Καλωσήρθες, ${displayName}!`);
                    redirectToRole(data.Role);
                }
            } catch (err) {
                console.error("Σφάλμα:", err.message);
                showError();
            }
        });
    }

    function showError() {
        errorMsg.classList.add('show');
        setTimeout(() => { errorMsg.classList.remove('show'); }, 3000);
    }

    function redirectToRole(role) {
        const r = role.toLowerCase().trim();
        if (r === 'admin' || r === 'manager') window.location.href = "/pages/admin.html";
        else if (r === 'receptionist') window.location.href = "/pages/receptionist.html";
        else if (r === 'maid') window.location.href = "/pages/maid.html";
        else if (r === 'minibar') window.location.href = "/pages/minibar.html";
        else if (r === 'driver') window.location.href = "/pages/driver.html";
        else if (r === 'gardener') window.location.href = "/pages/gardener.html";
        else {
            localStorage.removeItem('hotel_user');
            alert("Άγνωστος ρόλος: " + role + " — η συνεδρία διαγράφηκε, δοκιμάστε ξανά.");
        }
    }
});