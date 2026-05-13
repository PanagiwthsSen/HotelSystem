// js/maid.js
const vTitles={overview:'Επισκόπηση Βάρδιας',rooms:'Δωμάτια Βάρδιας',minibar:'Mini-bar',linen:'Ιματισμός — Αποστολή & Παραλαβή',stock:'Αποθεματικό',report:'Αναφορά Βάρδιας'};

function navTo(id){
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.toggle('active',i.dataset.v===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='v-'+id));
  document.getElementById('tb-title').textContent=vTitles[id]||id;
}
document.querySelectorAll('.sb-item').forEach(el=>el.addEventListener('click',()=>navTo(el.dataset.v)));

const roomData=[
  {id:'M205',num:'Μ-205',type:'Μονόκλινο',guest:'Müller B.',status:'urgent',note:'Αναχώρηση 12:00 — έλεγχος mini-bar αμέσως'},
  {id:'S02',num:'S-02',type:'Σουίτα',guest:'Νέος πελάτης 14:00',status:'urgent',note:'Προετοιμασία VIP — λουλούδια και σαμπάνια'},
  {id:'B415',num:'Δ-415',type:'Δίκλινο',guest:'Γεωργίου Α.',status:'urgent',note:'Αναχώρηση — έλεγχος mini-bar'},
  {id:'D312',num:'Δ-312',type:'Δίκλινο',guest:'Κανονικός καθαρισμός',status:'pending',note:''},
  {id:'F208',num:'Φ-208',type:'Φαρδύκλινο',guest:'Ρόσι Μ.',status:'pending',note:''},
  {id:'M114',num:'Μ-114',type:'Μονόκλινο',guest:'Κανονικός καθαρισμός',status:'pending',note:''},
  {id:'D219',num:'Δ-219',type:'Δίκλινο',guest:'Γκαρσία Π.',status:'pending',note:''},
  {id:'F301',num:'Φ-301',type:'Φαρδύκλινο',guest:'Κανονικός καθαρισμός',status:'pending',note:''},
  {id:'M322',num:'Μ-322',type:'Μονόκλινο',guest:'Κανονικός καθαρισμός',status:'pending',note:''},
  {id:'D418',num:'Δ-418',type:'Δίκλινο',guest:'Κανονικός καθαρισμός',status:'pending',note:''},
  {id:'F109',num:'Φ-109',type:'Φαρδύκλινο',guest:'Κανονικός καθαρισμός',status:'pending',note:''},
  {id:'D510',num:'Δ-510',type:'Δίκλινο',guest:'Κανονικός καθαρισμός',status:'pending',note:''},
  {id:'D108',num:'Δ-108',type:'Δίκλινο',guest:'Αναστασίου Κ. — ολοκλ.',status:'done',note:''},
  {id:'F302',num:'Φ-302',type:'Φαρδύκλινο',guest:'Johnson T. — ολοκλ.',status:'done',note:''},
  {id:'M205b',num:'Μ-114b',type:'Μονόκλινο',guest:'Κωνσταντίνου Μ. — ολοκλ.',status:'done',note:''}
];

let roomStates={};
roomData.forEach(r=>roomStates[r.id]=r.status);

function renderRooms(filter){
  const data=filter==='all'?roomData:roomData.filter(r=>r.status===filter);
  const list=document.getElementById('room-list');
  list.innerHTML=data.map(r=>{
    const isDone=roomStates[r.id]==='done';
    const isUrg=roomStates[r.id]==='urgent';
    const pillClass=isDone?'p-g':isUrg?'p-r':'p-b';
    const pillText=isDone?'Ολοκλ.':isUrg?'Επείγον':'Εκκρεμεί';
    return `<div class="room-card ${isUrg&&!isDone?'urgent':''} ${isDone?'done':''}" id="rc-${r.id}">
      <div>
        <div class="room-num">${r.num}</div>
        <div class="room-type">${r.type}</div>
      </div>
      <div class="room-info">
        <div style="font-size:12px;font-weight:500">${r.guest}</div>
        ${r.note?`<div class="room-guest">${r.note}</div>`:''}
      </div>
      <div class="room-actions">
        <span class="pill ${pillClass}">${pillText}</span>
        ${!isDone?`
          <button class="btn btn-sm btn-teal" onclick="setRoomInProgress('${r.id}')"><i class="ti ti-player-play" aria-hidden="true"></i> Έναρξη</button>
          <button class="btn btn-sm btn-dark" onclick="setRoomDone('${r.id}','${r.num}')"><i class="ti ti-check" aria-hidden="true"></i> Έτοιμο</button>
        `:'<span style="font-size:11px;color:var(--color-text-secondary)">Ολοκληρώθηκε</span>'}
      </div>
    </div>`;
  }).join('');
}
renderRooms('all');

function filterRooms(f,el){
  document.querySelectorAll('#v-rooms .btn-sm').forEach(b=>b.style.background='');
  el.style.background='var(--color-background-secondary)';
  renderRooms(f);
}

function setRoomInProgress(id){
  roomStates[id]='inprogress';
  showToast('room-toast','Δωμάτιο σε εξέλιξη...');
  renderRooms('all');
}

let doneCount=3;
function setRoomDone(id,num){
  roomStates[id]='done';
  doneCount++;
  const pend=document.getElementById('pend-count');
  const done=document.getElementById('done-count');
  if(pend)pend.textContent=Math.max(0,parseInt(pend.textContent)-1);
  if(done)done.textContent=doneCount;
  document.getElementById('badge-rooms').textContent=Math.max(0,parseInt(document.getElementById('badge-rooms').textContent)-1);
  document.getElementById('rpt-done').textContent=doneCount;
  const prog=document.querySelector('.prog-fill');
  if(prog)prog.style.width=Math.round(doneCount/15*100)+'%';
  showToast('room-toast',num+' — Ειδοποίηση "Έτοιμο" εστάλη στην υποδοχή αυτόματα');
  addLog(num+' καθαρίστηκε — κατάσταση ενημερώθηκε στην υποδοχή');
  renderRooms('all');
}

let mbCount=4;
function chargeMb(rowId,room,amount){
  const row=document.getElementById(rowId);
  if(row){row.querySelector('.pill').className='pill p-g';row.querySelector('.pill').textContent='OK';row.querySelector('.btn-teal').disabled=true;row.querySelector('.btn-teal').style.opacity='.4';}
  mbCount--;
  document.getElementById('mb-count').textContent=mbCount;
  document.getElementById('badge-mb').textContent=mbCount;
  showToast('mb-toast');
  addLog('Mini-bar '+room+' — '+amount+' χρεώθηκε στον λογαριασμό πελάτη');
}

function submitNewMb(){
  const r=document.getElementById('mb-room-inp').value;
  const t=document.getElementById('mb-total-inp').value;
  if(!r){alert('Εισάγετε αριθμό δωματίου.');return;}
  showToast('mb-toast');
  document.getElementById('mb-room-inp').value='';
  document.getElementById('mb-items-inp').value='';
  document.getElementById('mb-total-inp').value='';
  addLog('Νέα χρέωση mini-bar '+r+' — €'+(t||'?'));
}

function submitLinen(){
  showToast('linen-toast');
  addLog('Αποστολή ιματισμού στο καθαριστήριο καταχωρήθηκε');
}

function submitReport(){
  showToast('rep-toast');
  addLog('Αναφορά βάρδιας εστάλη στη διοίκηση');
}

function showToast(id,msg){
  const el=document.getElementById(id);
  if(!el)return;
  if(msg){const sp=el.querySelector('span');if(sp)sp.textContent=msg;}
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),3200);
}

const logList=document.getElementById('log-list');
function addLog(msg){
  if(!logList)return;
  const now=new Date();
  const t=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  const d=document.createElement('div');
  d.style.cssText='display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-bottom:0.5px solid var(--color-border-tertiary)';
  d.innerHTML=`<span style="font-size:11px;color:var(--color-text-secondary);min-width:36px;flex-shrink:0">${t}</span><span style="width:7px;height:7px;border-radius:50%;background:#1D9E75;flex-shrink:0;margin-top:3px"></span><span>${msg}</span>`;
  logList.insertBefore(d,logList.firstChild);
}

addLog('Έναρξη βάρδιας — Μαρία Κ. · 09:00');
addLog('Δ-108 καθαρίστηκε — κατάσταση ενημερώθηκε στην υποδοχή');
addLog('Φ-302 καθαρίστηκε — κατάσταση ενημερώθηκε στην υποδοχή');
addLog('Mini-bar Φ-302 — €14 χρεώθηκε');