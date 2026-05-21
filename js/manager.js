const vT={overview:'Πίνακας Ελέγχου',fleet:'Στόλος Οχημάτων',routes:'Δρομολόγια',drivers:'Οδηγοί & Διαθεσιμότητα',maintenance:'Συντήρηση Οχημάτων',costs:'Κόστη & Πληρωμές Οδηγών',gardens:'Κήποι & Πρόγραμμα',materials:'Υλικά & Ελλείψεις'};
function navTo(id){
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.toggle('active',i.dataset.v===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='v-'+id));
  document.getElementById('tb-title').textContent=vT[id]||id;
}

function showToast2(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),3200);
}

function showNewRoute(){
  const f=document.getElementById('new-route-form');
  f.style.display=f.style.display==='none'?'block':'none';
}

function submitRoute(){
  showToast2('route-toast');
  document.getElementById('new-route-form').style.display='none';
}

function submitMaint(){showToast2('maint-toast');}

function updateDriver(){
  showToast2('drv-toast');
}

function addGardenTask(){
  showToast2('grd-toast');
}

/* ==============================================================
   ΕΙΔΟΠΟΙΗΣΕΙΣ ΑΝΕΦΟΔΙΑΣΜΟΥ (από mini-bar)
   ============================================================== */
function showToast(msg, type) {
  const container = document.getElementById('toast-container') || (() => {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(c);
    return c;
  })();
  const toast = document.createElement('div');
  let icon = 'ti-circle-check';
  if (type === 'error') icon = 'ti-alert-circle';
  if (type === 'info') icon = 'ti-info-circle';
  if (type === 'warning') icon = 'ti-alert-triangle';
  toast.innerHTML = `<i class="ti ${icon}"></i><span>${msg}</span>`;
  const borderColor = type === 'error' ? '#E24B4A' : type === 'info' ? '#378ADD' : type === 'warning' ? '#F97316' : '#1D9E75';
  toast.style.cssText = `background:#fff;border-left:4px solid ${borderColor};box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:12px 20px;border-radius:6px;display:flex;align-items:center;gap:10px;font-size:13px;color:#111;font-weight:500;min-width:250px;transition:opacity 0.3s;`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
}

async function fetchRestockNotifs() {
  const container = document.getElementById('manager-notifications');
  if (!container) return;
  const supabase = window.supabase;
  if (!supabase) return;

  const { data } = await supabase
    .from('NOTIFICATION')
    .select('*')
    .in('TargetRole', ['manager', 'both'])
    .eq('IsRead', false)
    .order('CreatedAt', { ascending: false });

  let html = '';
  (data || []).forEach(n => {
    const time = n.CreatedAt
      ? new Date(n.CreatedAt).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      : '';
    html += `<div class="ns ns-w" onclick="dismissNotif(${n.NotificationID}, this)" style="cursor:pointer">
      <i class="ti ti-package"></i>
      <div><strong>Αίτημα Ανεφοδιασμού:</strong> ${n.Message}</div>
      <span style="margin-left:auto;font-size:11px;color:var(--color-text-secondary)">${time}</span>
    </div>`;
  });

  if (html) container.innerHTML = html;
  else container.innerHTML = '';
}

window.logout = function() {
  localStorage.removeItem('hotel_user');
  window.location.href = '/pages/login.html';
};

window.dismissNotif = async function(id, el) {
  try {
    await window.supabase.from('NOTIFICATION').update({ IsRead: true }).eq('NotificationID', id);
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
    showToast('Η ειδοποίηση απορρίφθηκε.', 'info');
  } catch (err) {
    showToast('Σφάλμα απόρριψης.', 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const loader = document.getElementById('app-loader');
    if (loader) loader.style.display = 'none';
    const app = document.querySelector('.app');
    if (app) app.style.display = 'flex';
  }, 800);

  document.querySelectorAll('.sb-item').forEach(item => {
    item.addEventListener('click', () => navTo(item.dataset.v));
  });

  fetchRestockNotifs();
  setInterval(fetchRestockNotifs, 30000);
});
