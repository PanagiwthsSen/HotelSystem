# Housekeeping Module — Production-Ready Implementation Plan

## Files to modify
| File | Edits |
|---|---|
| `js/maid.js` | 16 edits (all phases) |
| `pages/maid.html` | 1 edit (add 2 IDs to report stats) |
| `js/services/api.js` | 1 edit (add `cleaning` to `getStatusLabel`) |
| `js/receptionist.js` | 1 edit (add `cleaning` to `mapDbStatusToUI`) |
| `js/components/RoomMap.js` | 0 edits (shared, no change needed) |
| `css/receptionist.css` | 1 edit (add `.rc-cleaning` style) |

## Phase 1 — Critical Bug Fixes

### 1.1 Fix `chargeMb()` — persists to DB
**File**: `js/maid.js` — replace function at line 596

Insert `RECEIPT` with the consumption amount, then delete the `MINIBAR_CONSUMPTION` record so it doesn't reappear.

```js
window.chargeMb = async function(rowId, consumptionId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const record = pendingMbRecords.find(r => r.consumptionId === consumptionId);
  if (!record) return;
  try {
    if (record.reservationId && record.reservationId !== 0) {
      const { error: recErr } = await supabase.from('RECEIPT').insert({
        ReservationID: record.reservationId,
        PaymentDate: new Date().toISOString(),
        Amount: record.charge,
        Category: 'minibar'
      });
      if (recErr) throw recErr;
    }
    await supabase.from('MINIBAR_CONSUMPTION').delete().eq('ConsumptionID', consumptionId);
  } catch (err) {
    console.error('Σφάλμα καταχώρησης χρέωσης:', err.message);
    showToast('room-toast', 'Σφάλμα καταχώρησης χρέωσης minibar.');
    return;
  }
  row.querySelector('.pill').className = 'pill p-g';
  row.querySelector('.pill').textContent = 'OK';
  const btn = row.querySelector('.btn-teal');
  if (btn) { btn.disabled = true; btn.style.opacity = '.4'; }
  mbCount = Math.max(0, mbCount - 1);
  pendingMbRecords = pendingMbRecords.filter(r => r.consumptionId !== consumptionId);
  recomputeCounters();
  addLog('Mini-bar χρέωση #' + consumptionId + ' — €' + record.charge.toFixed(2) + ' καταχωρήθηκε');
};
```

### 1.2 Fix `submitLinen()` — decrements inventory
**File**: `js/maid.js` — replace function at line 773

Read each linen quantity input, decrement `INVENTORY_ITEM.Quantity`, notify admin.

```js
window.submitLinen = async function() {
  const linenItems = inventoryItems.filter(i => isLinenCategory(i.Category, i.Name) && i.Name);
  let totalSent = 0;
  let totalItems = 0;
  for (const item of linenItems) {
    const inp = document.getElementById('ls-qty-' + item.ItemID);
    if (!inp) continue;
    const qty = parseInt(inp.value, 10);
    if (!qty || qty <= 0) continue;
    totalItems++;
    totalSent += qty;
    try {
      await supabase.from('INVENTORY_ITEM').update({ Quantity: Math.max(0, item.Quantity - qty) }).eq('ItemID', item.ItemID);
    } catch (err) {
      console.error('Σφάλμα ενημέρωσης αποθέματος:', err.message);
    }
  }
  if (totalItems > 0) {
    try {
      await supabase.from('NOTIFICATION').insert({
        TargetRole: 'admin', Type: 'linen_sent', IsRead: false,
        Message: `Αποστολή ιματισμού: ${totalSent} τεμάχια (${totalItems} είδη) στάλθηκαν στο καθαριστήριο.`
      });
    } catch (err) { console.error(err); }
    addLog(`Ιματισμός: ${totalSent} τεμάχια στάλθηκαν στο καθαριστήριο`);
  }
  await fetchInventory();
  showToast('linen-toast');
};
```

### 1.3 Fix `submitReport()` — saves to DB
**File**: `js/maid.js` — replace function at line 781

Insert `NOTIFICATION` for admin with shift report content.

```js
window.submitReport = async function() {
  const notes = document.getElementById('rep-notes');
  const noteText = notes ? notes.value.trim() : '';
  const doneEl = document.getElementById('rpt-done');
  const doneVal = doneEl ? doneEl.textContent : '0';
  const msg = `Αναφορά βάρδιας — Ολοκληρωμένα δωμάτια: ${doneVal}.${noteText ? ' Σημειώσεις: ' + noteText : ''}`;
  try {
    await supabase.from('NOTIFICATION').insert({
      TargetRole: 'admin', Type: 'shift_report', Message: msg, IsRead: false
    });
    showToast('rep-toast');
    addLog('Αναφορά βάρδιας εστάλη στη διοίκηση' + (noteText ? ': ' + noteText : ''));
  } catch (err) {
    console.error('Σφάλμα αποστολής αναφοράς:', err.message);
    alert('Σφάλμα: ' + err.message);
  }
};
```

### 1.4 Fix overview notifications ID mismatch
**File**: `js/maid.js` line 333

Change `document.getElementById('ov-notif')` → `document.getElementById('ov-notifications')`

### 1.5 Fix stock view ID mismatch
**File**: `js/maid.js` line 683

Change `document.getElementById('stock-list')` → `document.getElementById('stock-body')`

### 1.6 Fix linen receive table ID mismatch
**File**: `js/maid.js` line 751

Change `document.getElementById('linen-receive-table')` → `document.getElementById('linen-receive-body')`

## Phase 2 — Essential Features

### 2.7 Persist `inprogress` to ROOM table
**File**: `js/maid.js` — 4 sub-edits

**a) Add `cleaning` status mapping + `origStatus` to `fetchMaidRooms()`**
In the room mapper, add:
```js
} else if (r.Status === 'cleaning') {
  status = 'inprogress';
  note = 'Καθαρισμός σε εξέλιξη';
}
```
And add `origStatus: r.Status` to the returned object.

**b) Update `setRoomInProgress()` — set ROOM.Status='cleaning' when DB status was 'dirty'**
After notification insert, add:
```js
if (room.origStatus === 'dirty') {
  await supabase.from('ROOM').update({ Status: 'cleaning' }).eq('RoomNumber', id);
}
```

**c) Update `setRoomDone()` — restore 'occ' rooms, set 'clean' for dirty/cleaning rooms**
Replace the DB update from `{ Status: 'clean' }` to:
```js
const targetStatus = room.origStatus === 'occ' ? 'occ' : 'clean';
await supabase.from('ROOM').update({ Status: targetStatus }).eq('RoomNumber', id);
```

**d) Update `undoRoomDone()` — use origStatus-aware revert**
Replace the DB update from `{ Status: 'dirty' }` to:
```js
const revertStatus = room.origStatus === 'occ' ? 'occ' : 'dirty';
await supabase.from('ROOM').update({ Status: revertStatus }).eq('RoomNumber', id);
```

**e) Cleanup stale `inprogress` roomStates on refresh**
After existing roomStates cleanup loop, add:
```js
for (const id of Object.keys(roomStates)) {
  if (roomStates[id] === 'inprogress') {
    const room = maidRooms.find(r => r.id === id);
    if (room && room.origStatus !== 'dirty' && room.origStatus !== 'cleaning') {
      delete roomStates[id];
    }
  }
}
```

### 2.8 Wire `mb-status-sel` in `submitNewMb()`
**File**: `js/maid.js` — after the MINIBAR_CONSUMPTION insert

Add:
```js
const statusSel = document.getElementById('mb-status-sel');
if (statusSel && statusSel.value === 'Προς καθαρισμό') {
  await supabase.from('ROOM').update({ Status: 'dirty' }).eq('RoomNumber', roomNum);
}
```

### 2.9 Auto-refresh notifications
**File**: `js/maid.js` — 30s interval (line 40-51)

Add `await fetchMaidNotifications();` after `await fetchPendingMb();`

### 2.10 Receptionist cleaning awareness
**File**: `js/receptionist.js` — `mapDbStatusToUI()` function (line 41)

Add: `case 'cleaning': return 'cleaning';`

**File**: `css/receptionist.css` — after `.rc-dirty` style (line 141)

Add: `.rc-cleaning { background: #378ADD; } /* Σε καθαρισμό - Μπλε */`

**File**: `js/services/api.js` — `getStatusLabel()` (line 148)

Add: `if (state === 'cleaning') return 'Σε καθαρισμό';`

## Phase 3 — Production Polish

### 3.11 Report view real stats
**File**: `pages/maid.html` — report stat cards (lines 171-173)

Add IDs:
```html
<div class="sc"><div class="sc-lbl">Mini-bar χρεώσεις</div><div class="sc-val" id="rpt-mb-charges">0</div></div>
<div class="sc"><div class="sc-lbl">Ιματισμός στάλθηκε</div><div class="sc-val" id="rpt-linen-sent">0</div></div>
```

**File**: `js/maid.js` — in `loadAllData()` or a new function

Query today's minibar RECEIPT entries and linen NOTIFICATION entries for report stats. Update `rpt-mb-charges` and `rpt-linen-sent` DOM elements.

### 3.12 Remove dead code
**File**: `js/maid.js` — remove unused CUSTOMER fetch (lines 213-216)

Delete the block:
```js
const { data: customers, error: custErr } = await supabase
  .from('CUSTOMER')
  .select('CustomerID, FirstName, LastName');
if (custErr) throw custErr;
```

### 3.13 Linen receive — actually increment inventory
**File**: `js/maid.js` — `renderLinenReceiveTable()` (line 750)

Replace the inline onclick `window.addLog(...)` with an async function `window.receiveLinen(itemId, itemName)` that increments `INVENTORY_ITEM.Quantity` and inserts a notification.

### 3.14 Add `reservationId` to `pendingMbRecords`
**File**: `js/maid.js` — `fetchPendingMb()` mapper

Add `reservationId: d.ReservationID` to the mapped object. Required for chargeMb to create RECEIPT.

---

## Execution Order
1. All `maid.js` edits (the bulk of the work)
2. `pages/maid.html` — add IDs to report stats
3. `js/services/api.js` — add cleaning label
4. `js/receptionist.js` — add cleaning to status mapper
5. `css/receptionist.css` — add cleaning color
6. `npm run build` — verify
