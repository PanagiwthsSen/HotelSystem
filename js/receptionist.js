const viewTitles={overview:'Επισκόπηση',arrivals:'Αφίξεις Ημέρας',departures:'Αναχωρήσεις Ημέρας',rooms:'Κατάσταση Δωματίων','new-booking':'Νέα Κράτηση',search:'Αναζήτηση Κράτησης',minibar:'Mini-bar',log:'Ημερολόγιο Βάρδιας'};

// Ζωντανή Ημερομηνία/Ώρα
function updateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('live-time').textContent = now.toLocaleDateString('el-GR', options);
}
setInterval(updateTime, 60000);
updateTime();

// Σύστημα ζωντανών ειδοποιήσεων
let notifCount = 3;
function dismissNotif(el) {
    el.style.opacity = '0';
    setTimeout(() => {
        el.remove();
        notifCount--;
        const badge = document.getElementById('notif-badge');
        const countSpan = document.getElementById('notif-count');
        if (notifCount > 0) {
            countSpan.textContent = notifCount;
        } else {
            badge.style.display = 'none';
        }
    }, 300);
}

function navTo(id){
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.toggle('active',i.dataset.view===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+id));
  document.getElementById('view-title').textContent=viewTitles[id]||id;
}
document.querySelectorAll('.sb-item').forEach(item=>{
  item.addEventListener('click',()=>navTo(item.dataset.view));
});

const arrivalData=[
  {name:'Παπαδόπουλος Γ.',room:'—',type:'Δίκλινο',time:'10:00',prepay:'50% Ναι',status:'pending'},
  {name:'Smith A.',room:'—',type:'Σουίτα',time:'11:30',prepay:'50% Ναι',status:'pending'},
  {name:'Γκρουπ Tour Elite',room:'—',type:'Μεικτό ×24',time:'14:00',prepay:'Γκρουπ Χ%',status:'pending'},
  {name:'Müller B.',room:'Μ-205',type:'Μονόκλινο',time:'16:00',prepay:'Χωρίς',status:'done'},
  {name:'Κωνσταντίνου Α.',room:'Δ-312',type:'Δίκλινο',time:'12:00',prepay:'20% Ναι',status:'done'},
  {name:'Rossi M.',room:'Φ-208',type:'Φαρδύκλινο',time:'15:30',prepay:'50% Ναι',status:'done'},
  {name:'García P.',room:'—',type:'Μονόκλινο',time:'17:00',prepay:'20% Ναι',status:'pending'},
  {name:'Νικολάου Σ.',room:'—',type:'Δίκλινο',time:'18:00',prepay:'Χωρίς',status:'pending'},
];

function renderArrivals(filter){
  const data=filter==='all'?arrivalData:arrivalData.filter(r=>r.status===filter);
  const tbody=document.getElementById('arrivals-body');
  tbody.innerHTML=data.map(r=>`<tr${r.status==='done'?' style="opacity:0.6"':''}>
    <td>${r.name}</td><td>${r.room}</td><td>${r.type}</td><td>${r.time}</td>
    <td><span class="pill ${r.prepay.includes('Γκρουπ')?'p-blue':r.prepay==='Χωρίς'?'p-red':'p-green'}">${r.prepay}</span></td>
    <td><span class="pill ${r.status==='done'?'p-green':'p-amber'}">${r.status==='done'?'Ολοκλ.':'Εκκρ.'}</span></td>
    <td>${r.status==='pending'?`<button class="btn btn-sm btn-navy" onclick="doCheckin(this)">C/I</button>`:'<span class="pill p-teal">Εκχωρ.</span>'}</td>
  </tr>`).join('');
}
renderArrivals('all');

function filterArrivals(f,el){
  document.querySelectorAll('#view-arrivals .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderArrivals(f);
}

function doCheckin(btn){
  const row=btn.closest('tr');
  row.cells[5].innerHTML='<span class="pill p-green">Ολοκλ.</span>';
  row.cells[6].innerHTML='<span class="pill p-teal">Εκχωρ.</span>';
  row.style.opacity='0.6';
  const t=document.getElementById('ci-toast');
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);
  addLog('Check-in ολοκληρώθηκε — '+row.cells[0].textContent);
}

function doCheckout(){
  const t=document.getElementById('co-toast');
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);
  const cc=document.getElementById('checkout-card');
  if(cc)cc.style.opacity='0.5';
  addLog('Check-out Müller B. — Μ-205 · €322 · απόδειξη εκδόθηκε [cite: 57]');
}

function chargeMinibar(btn){
  const row=btn.closest('tr');
  row.cells[5].innerHTML='<span class="pill p-green">OK</span>';
  btn.textContent='Χρεώθηκε';btn.disabled=true;btn.style.opacity='0.5';
  const t=document.getElementById('mb-toast');
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);
  addLog('Mini-bar χρεώθηκε — '+row.cells[1].textContent+' · '+row.cells[3].textContent);
}

// Δημιουργία των 510 δωματίων (300 Δίκλινα, 150 Φαρδύκλινα, 50 Μονόκλινα, 10 Σουίτες) [cite: 5, 42]
const roomConfig = [
  { prefix: 'Δ', count: 300 },
  { prefix: 'Φ', count: 150 },
  { prefix: 'Μ', count: 50 },
  { prefix: 'Σ', count: 10 }
];

const roomData = [];
roomConfig.forEach(conf => {
  for(let i=1; i<=conf.count; i++) {
    const r = Math.random();
    let state = 'free';
    if(r < 0.65) state = 'occ'; // Προσομοίωση 65% κατειλημμένα
    else if(r < 0.75) state = 'dirty';
    else if(r < 0.85) state = 'clean';
    
    roomData.push({
      id: `${conf.prefix}-${i}`,
      state: state
    });
  }
});

let currentOcc = 0, currentFree = 0, currentDirty = 0, currentClean = 0;

function calcLiveStats() {
  currentOcc = 0; currentFree = 0; currentDirty = 0; currentClean = 0;
  roomData.forEach(r => {
    if(r.state === 'occ') currentOcc++;
    else if(r.state === 'free') currentFree++;
    else if(r.state === 'dirty') currentDirty++;
    else if(r.state === 'clean') currentClean++;
  });
  
  // Υπολογισμός ποσοστού πληρότητας [cite: 4, 45]
  const occRate = Math.round((currentOcc / 510) * 100);
  const occBadge = document.getElementById('live-occupancy');
  occBadge.textContent = `Πληρ. ${occRate}%`;
  
  // Έλεγχος Ζ% έκπτωσης αν πληρότητα < 60% [cite: 4, 45, 139]
  const dynNotice = document.getElementById('dyn-price-notice');
  if(dynNotice) {
      if(occRate < 60) {
          dynNotice.textContent = ' (Εφαρμόζεται μείωση Ζ% λόγω χαμηλής πληρότητας <60%)';
          occBadge.style.background = '#FCEBEB';
          occBadge.style.color = '#791F1F';
      } else {
          dynNotice.textContent = '';
          occBadge.style.background = '#E1F5EE';
          occBadge.style.color = '#085041';
      }
  }

  // Ενημέρωση των UI stats
  if(document.getElementById('stat-occ')) document.getElementById('stat-occ').textContent = currentOcc;
  if(document.getElementById('stat-free')) document.getElementById('stat-free').textContent = currentFree;
  if(document.getElementById('stat-free-overview')) document.getElementById('stat-free-overview').textContent = currentFree;
  if(document.getElementById('stat-dirty')) document.getElementById('stat-dirty').textContent = currentDirty;
  if(document.getElementById('stat-clean')) document.getElementById('stat-clean').textContent = currentClean;
}

function renderRooms(filter){
  const grid = document.getElementById('room-grid');
  if(!grid) return;
  grid.innerHTML = '';
  
  roomData.forEach(r => {
    if(filter !== 'all' && r.state !== filter) return;
    const d = document.createElement('div');
    d.className = 'rc rc-' + r.state;
    d.title = 'Δωμάτιο ' + r.id + (r.state === 'free' ? ' (Άδειο χωρίς καθαριότητα)' : '');
    d.textContent = r.id; 
    grid.appendChild(d);
  });
  calcLiveStats();
}
renderRooms('all');

function filterRooms(f, el){
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active-filter'));
  el.classList.add('active-filter');
  renderRooms(f);
}

const allBookings=[
  {name:'Παπαδόπουλος Γ.',code:'GKH-48291',room:'—',in:'16/05',out:'19/05',status:'Επιβεβ.'},
  {name:'Smith A.',code:'GKH-31580',room:'Σ-01',in:'09/05',out:'12/05',status:'Ενεργή'},
  {name:'Müller B.',code:'GKH-29441',room:'Μ-205',in:'06/05',out:'09/05',status:'C/O σήμερα'},
  {name:'Johnson T.',code:'GKH-27830',room:'Φ-302',in:'06/05',out:'09/05',status:'Ολοκλ.'},
  {name:'Γκρουπ Tour Elite',code:'GKH-50012',room:'—',in:'09/05',out:'12/05',status:'Επιβεβ.'},
  {name:'García P.',code:'GKH-48810',room:'—',in:'09/05',out:'11/05',status:'Εκκρ.'},
  {name:'Αναστασίου Κ.',code:'GKH-44091',room:'Δ-108',in:'06/05',out:'09/05',status:'Ολοκλ.'},
];

function renderSearch(q){
  const filtered=q?allBookings.filter(b=>b.name.toLowerCase().includes(q.toLowerCase())||b.code.toLowerCase().includes(q.toLowerCase())||b.room.toLowerCase().includes(q.toLowerCase())):allBookings;
  document.getElementById('search-body').innerHTML=filtered.map(b=>`<tr>
    <td>${b.name}</td><td style="font-family:var(--font-mono,monospace);font-size:11px">${b.code}</td><td>${b.room}</td><td>${b.in}</td><td>${b.out}</td>
    <td><span class="pill ${b.status==='Ολοκλ.'?'p-gray':b.status.includes('C/O')?'p-amber':b.status==='Εκκρ.'?'p-red':'p-green'}">${b.status}</span></td>
    <td><button class="btn btn-sm"><i class="ti ti-external-link" aria-hidden="true"></i></button></td>
  </tr>`).join('');
}
function doSearch(q){renderSearch(q);}
renderSearch('');

const prepayMap={prepaid:'50% (>90 ημ.) [cite: 46] — ',phone:'20% [cite: 14, 47] — ',group:'Ειδικό Χ% [cite: 49] — ',walkin:'Πλήρης κατά άφιξη'};
function updatePrepay(){
  const t=document.getElementById('nb-btype')?.value;
  const amt=document.getElementById('prepay-amt');
  if(!t||!amt)return;
  const price=parseInt(document.getElementById('nb-rtype')?.value||140);
  const nights=calcNights();
  
  // Έλεγχος χαμηλής πληρότητας
  const occRate = Math.round((currentOcc / 510) * 100);
  let finalPrice = price;
  if(occRate < 60) {
      finalPrice = price * 0.85; // Έστω Ζ% = 15% 
  }
  
  const total=finalPrice*nights;
  const pct=t==='prepaid'?50:t==='phone'?20:t==='group'?15:0;
  const box=document.getElementById('prepay-box');
  if(t==='walkin'){box.textContent='Walk-in: πλήρης πληρωμή κατά άφιξη.';}
  else{box.innerHTML='<i class="ti ti-info-circle"></i> '+prepayMap[t]+'<strong id="prepay-amt">€'+Math.round(total*pct/100)+'</strong>';}
}
function calcNights(){
  const i=document.getElementById('nb-in')?.value;
  const o=document.getElementById('nb-out')?.value;
  if(!i||!o)return 3;
  return Math.max(1,Math.round((new Date(o)-new Date(i))/86400000));
}
function updatePrice(){
  const price=parseInt(document.getElementById('nb-rtype')?.value||140);
  const nights=calcNights();
  
  const occRate = Math.round((currentOcc / 510) * 100);
  let finalPrice = price;
  if(occRate < 60) {
      finalPrice = Math.round(price * 0.85); // Μείωση Ζ%
  }
  
  const total=finalPrice*nights;
  const typeText=document.getElementById('nb-rtype')?.options[document.getElementById('nb-rtype').selectedIndex]?.text.split('—')[0].trim()||'';
  document.getElementById('sp-room').textContent=typeText;
  document.getElementById('sp-nights').textContent=nights+' νύχτες';
  document.getElementById('sp-sub').textContent='€'+finalPrice+' × '+nights;
  document.getElementById('sp-total').textContent='€'+total;
  updatePrepay();
}

function submitBooking(){
  const last=document.getElementById('nb-last')?.value;
  if(!last){alert('Συμπληρώστε τουλάχιστον το επώνυμο.');return;}
  const code='GKH-'+Math.floor(10000+Math.random()*90000);
  document.getElementById('nb-code').textContent=code;
  const t=document.getElementById('nb-toast');
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),4000);
  addLog('Νέα κράτηση '+code+' — '+last);
}

function addLog(msg){
  const list=document.getElementById('log-list');
  if(!list)return;
  const now=new Date();
  const time=now.getHours().toString().padStart(2,'0')+':' + now.getMinutes().toString().padStart(2,'0');
  const div=document.createElement('div');
  div.className='log-item';
  div.innerHTML='<div class="log-time">'+time+'</div><div class="log-dot ld-blue"></div><div>'+msg+'</div>';
  list.insertBefore(div,list.firstChild);
}

calcLiveStats();
updatePrice();