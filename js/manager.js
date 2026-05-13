const vT={overview:'Πίνακας Ελέγχου',fleet:'Στόλος Οχημάτων',routes:'Δρομολόγια',drivers:'Οδηγοί & Διαθεσιμότητα',maintenance:'Συντήρηση Οχημάτων',costs:'Κόστη & Πληρωμές Οδηγών',gardens:'Κήποι & Πρόγραμμα',materials:'Υλικά & Ελλείψεις'};
function navTo(id){
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.toggle('active',i.dataset.v===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='v-'+id));
  document.getElementById('tb-title').textContent=vT[id]||id;
}
document.querySelectorAll('.sb-item').forEach(el=>el.addEventListener('click',()=>navTo(el.dataset.v)));

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