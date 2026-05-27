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

            const btn = loginForm.querySelector('.btn-login');
            const originalText = 'Είσοδος';
            btn.disabled = true;
            btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite;display:inline-block"></i> Σύνδεση...';

            const usernameInput = document.getElementById('username').value.trim();
            const passwordInput = document.getElementById('password').value.trim();

            const restoreBtn = () => {
                btn.disabled = false;
                btn.innerHTML = originalText;
            };

            try {
                const { data, error } = await supabase
                    .from('EMPLOYEE')
                    .select('EmpID, FirstName, LastName, Role, isActive')
                    .eq('Username', usernameInput)
                    .eq('Password', passwordInput)
                    .maybeSingle()

                if (error) throw error;

                if (data) {
                    if (!data.isActive) {
                        restoreBtn();
                        alert("Ο λογαριασμός σας είναι ανενεργός.");
                        return;
                    }

                    const displayName = `${data.FirstName || ''} ${data.LastName || ''}`.trim();

                    localStorage.setItem('hotel_user', JSON.stringify({
                        id: data.EmpID,
                        name: displayName,
                        Role: data.Role
                    }));

                    await supabase.from('EMPLOYEE').update({ IsLoggedIn: true }).eq('EmpID', data.EmpID);

                    redirectToRole(data.Role);
                } else {
                    restoreBtn();
                    showError();
                }
            } catch (err) {
                console.error("Σφάλμα:", err.message);
                restoreBtn();
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
        else if (r === 'external_manager') window.location.href = "/pages/external_manager.html";
        else if (r === 'internal_manager') window.location.href = "/pages/internal_manager.html";
        else {
            localStorage.removeItem('hotel_user');
            alert("Άγνωστος ρόλος: " + role + " — η συνεδρία διαγράφηκε, δοκιμάστε ξανά.");
        }
    }
});