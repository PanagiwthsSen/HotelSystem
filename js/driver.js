document.addEventListener("DOMContentLoaded", () => {
    // Loader
    setTimeout(() => {
        document.getElementById("app-loader").style.display = "none";
        document.querySelector(".app").style.display = "flex";
    }, 800);

    // Sidebar Nav
    const navItems = document.querySelectorAll('.sb-item');
    const views = document.querySelectorAll('.view');
    const tbTitle = document.getElementById('tb-title');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            views.forEach(view => view.classList.remove('active'));
            
            item.classList.add('active');
            const targetView = item.getAttribute('data-v');
            document.getElementById(`v-${targetView}`).classList.add('active');
            
            tbTitle.innerText = item.innerText;
        });
    });
});

function navTo(viewId) {
    const targetItem = document.querySelector(`.sb-item[data-v="${viewId}"]`);
    if(targetItem) targetItem.click();
}

function showToast(id) {
    const toast = document.getElementById(id);
    if(toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}