# Grand Kavala Hotel System

> Σύστημα Διαχείρισης Ξενοδοχείου — Πτυχιακή Εργασία  
> **Τεχνολογία:** Vanilla JavaScript · Vite · Supabase (PostgreSQL)  
> **Αποθετήριο:** https://github.com/PanagiwthsSen/HotelSystem

---

## Περιεχόμενα

1. [Περιγραφή Έργου](#1-περιγραφή-έργου)
2. [Τεχνολογίες & Εξαρτήσεις](#2-τεχνολογίες--εξαρτήσεις)
3. [Αρχιτεκτονική Συστήματος](#3-αρχιτεκτονική-συστήματος)
4. [Δομή Φακέλων](#4-δομή-φακέλων)
5. [Σχήμα Βάσης Δεδομένων](#5-σχήμα-βάσης-δεδομένων)
6. [Ρόλοι Χρηστών](#6-ρόλοι-χρηστών)
7. [Εγκατάσταση & Εκκίνηση](#7-εγκατάσταση--εκκίνηση)
8. [Μεταβλητές Περιβάλλοντος](#8-μεταβλητές-περιβάλλοντος)
9. [Αυτοματοποιημένες Δοκιμές](#9-αυτοματοποιημένες-δοκιμές)
10. [Λειτουργίες Ανά Ρόλο](#10-λειτουργίες-ανά-ρόλο)
11. [Δυναμική Τιμολόγηση](#11-δυναμική-τιμολόγηση)
12. [Real-time Ενημερώσεις](#12-real-time-ενημερώσεις)
13. [CI/CD](#13-cicd)
14. [Γνωστοί Περιορισμοί](#14-γνωστοί-περιορισμοί)

---

## 1. Περιγραφή Έργου

Το **Grand Kavala Hotel System** είναι μια πλήρης web εφαρμογή διαχείρισης ξενοδοχείου που αναπτύχθηκε ως πτυχιακή εργασία. Καλύπτει τον πλήρη κύκλο λειτουργίας ενός ξενοδοχείου: από την online κράτηση δωματίου από έναν επισκέπτη έως την αποχώρησή του, καθώς και όλες τις εσωτερικές διαδικασίες του προσωπικού (housekeeping, minibar, μεταφορές, κηπουρική, μισθοδοσία, αναφορές εσόδων).

Η εφαρμογή απευθύνεται σε **8 διαφορετικούς ρόλους** χρηστών, ο καθένας με αυτόνομο dashboard και σύνολο λειτουργιών. Η επικοινωνία μεταξύ ρόλων γίνεται μέσω ενός κεντρικού πίνακα ειδοποιήσεων (`NOTIFICATION`) στη βάση δεδομένων, επιτρέποντας real-time αλληλεπίδραση (π.χ. αίτημα ανεφοδιασμού minibar → έγκριση από διαχειριστή).

---

## 2. Τεχνολογίες & Εξαρτήσεις

| Κατηγορία | Τεχνολογία | Έκδοση |
|---|---|---|
| Frontend | Vanilla JavaScript (ES Modules) | ES2022 |
| Build Tool | Vite | ^8.0 |
| Backend / BaaS | Supabase (PostgreSQL + Realtime) | ^2.105 |
| UI Icons | Tabler Icons (CDN) | — |
| Charts | Chart.js (CDN) | — |
| Testing | Playwright | ^1.60 |
| CI/CD | GitHub Actions | — |

Δεν χρησιμοποιείται κανένα JavaScript framework (React, Vue, Angular). Όλη η λογική UI υλοποιείται σε καθαρό ES6+ JavaScript με ES Module imports/exports.

---

## 3. Αρχιτεκτονική Συστήματος

```
┌─────────────────────────────────────────────────────┐
│                   Browser (Client)                  │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  Page Module │  │  Components  │  │  UI Utils │ │
│  │  (per role)  │  │  RoomMap.js  │  │  ui.js    │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                 │                │        │
│         └─────────────────┴────────────────┘        │
│                           │                         │
│                  ┌────────▼────────┐                │
│                  │  services/api.js │                │
│                  │  (Query Layer)  │                │
│                  └────────┬────────┘                │
│                           │                         │
│                  ┌────────▼────────┐                │
│                  │ supabase-config │                │
│                  │  (JS Client)    │                │
└──────────────────────────┬──────────────────────────┘
                           │  HTTPS / WebSocket
                  ┌────────▼────────┐
                  │    Supabase     │
                  │  PostgreSQL DB  │
                  │  Realtime API   │
                  └─────────────────┘
```

### Επίπεδα εφαρμογής

| Επίπεδο | Αρχείο | Κανόνας |
|---|---|---|
| **API Services** | `js/services/api.js` | Όλα τα Supabase queries. Επιστρέφει μόνο δεδομένα — καμία αλληλεπίδραση με DOM. |
| **UI Utilities** | `js/utils/ui.js` | Κοινόχρηστοι βοηθοί (toast, μορφοποίηση ημερομηνίας, πλοήγηση). Καθαρές συναρτήσεις. |
| **Components** | `js/components/` | Επαναχρησιμοποιήσιμα UI blocks (π.χ. χάρτης δωματίων). Λαμβάνουν δεδομένα + config, αποδίδουν DOM. |
| **Page Modules** | `js/*.js` | Ένα αρχείο ανά ρόλο. Συνδέει API + Components + UI για τις ανάγκες κάθε dashboard. |

---

## 4. Δομή Φακέλων

```
HotelSystem/
├── index.html                    # Δημόσια σελίδα επισκεπτών
├── pages/
│   ├── login.html                # Σύνδεση προσωπικού
│   ├── booking.html              # Οδηγός κράτησης 3 βημάτων
│   ├── admin.html                # Dashboard διαχειριστή
│   ├── receptionist.html         # Dashboard ρεσεψιονίστα
│   ├── maid.html                 # Dashboard καθαρίστριας
│   ├── minibar.html              # Dashboard minibar
│   ├── driver.html               # Dashboard οδηγού
│   ├── gardener.html             # Dashboard κηπουρού
│   ├── internal_manager.html     # Dashboard εσωτερικού διαχειριστή
│   └── external_manager.html     # Dashboard εξωτερικού διαχειριστή
├── js/
│   ├── supabase-config.js        # Αρχικοποίηση client, window.showConfirm()
│   ├── login.js                  # Έλεγχος ταυτότητας & ανακατεύθυνση
│   ├── booking.js                # Λογική οδηγού κράτησης
│   ├── app.js                    # Λογική σελίδας επισκεπτών
│   ├── receptionist.js           # Λογική ρεσεψιόν (2 571 γραμμές)
│   ├── maid.js                   # Λογική καθαριότητας (1 214 γραμμές)
│   ├── minibar.js                # Λογική minibar
│   ├── driver.js                 # Λογική οδηγού
│   ├── gardener.js               # Λογική κηπουρού
│   ├── manager.js                # Λογική εσωτ. διαχειριστή (1 542 γραμμές)
│   ├── admin.js                  # Λογική admin (3 827 γραμμές)
│   ├── export.js                 # Εξαγωγή CSV / PDF
│   ├── scheduler.js              # Βοηθητικές λειτουργίες χρονοπρογραμματισμού
│   ├── services/
│   │   └── api.js                # Κεντρική στρώση Supabase queries
│   ├── utils/
│   │   └── ui.js                 # Κοινόχρηστα UI utilities
│   └── components/
│       └── RoomMap.js            # Επαναχρησιμοποιήσιμος renderer χάρτη δωματίων
├── css/                          # Ένα CSS αρχείο ανά ρόλο
├── schema/                       # SQL migration scripts
├── tests/                        # Playwright E2E δοκιμές
│   ├── login.spec.js
│   ├── booking-wizard.spec.js
│   ├── receptionist-checkin.spec.js
│   ├── receptionist-checkout.spec.js
│   ├── room-availability.spec.js
│   ├── room-map.spec.js
│   ├── admin/                    # 8 spec αρχεία για admin
│   ├── maid/                     # 4 spec αρχεία
│   ├── driver/                   # 3 spec αρχεία
│   ├── gardener/                 # 2 spec αρχεία
│   ├── manager/                  # 4 spec αρχεία
│   └── minibar/                  # 1 spec αρχείο
├── docs/                         # Τεκμηρίωση χρήστη (Mintlify)
├── .github/workflows/            # GitHub Actions CI pipeline
├── package.json
├── playwright.config.js
└── .env                          # VITE_SUPABASE_URL, VITE_SUPABASE_KEY
```

---

## 5. Σχήμα Βάσης Δεδομένων

Η βάση δεδομένων αποτελείται από **17 πίνακες** σε PostgreSQL μέσω Supabase. Τα ονόματα πινάκων και στηλών είναι σε PascalCase/CamelCase.

```
EMPLOYEE ──────────────────────────────────────────────────────────┐
    │                                                               │
    ├──[EmpID]──▶ SHIFT                                            │
    ├──[EmpID]──▶ TRIP (DriverID)                                  │
    ├──[EmpID]──▶ COMPLAINT (EmpID)                                │
    └──[EmpID]──▶ (auth μέσω localStorage)                        │
                                                                    │
CUSTOMER ──────────────────────────────────────────────────────────┤
    ├──[CustomerID]──▶ RESERVATION                                 │
    └──[CustomerID]──▶ COMPLAINT                                   │
                                                                    │
RESERVATION ───────────────────────────────────────────────────────┤
    ├──[ReservationID]──▶ RESERVATION_ROOM ──▶ ROOM               │
    ├──[ReservationID]──▶ MINIBAR_CONSUMPTION ──▶ INVENTORY_ITEM  │
    └──[ReservationID]──▶ RECEIPT                                  │
                                                                    │
VEHICLE ────────────────────────────────────────────────────────────┤
    ├──[VehicleID]──▶ TRIP                                         │
    └──[VehicleID]──▶ VEHICLE_SERVICE                              │
                                                                    │
RENTED_SHOP ────────────────────────────────────────────────────────┤
    └──[ShopID]──▶ LEASE_PAYMENT                                   │
                                                                    │
NOTIFICATION ──────────────────────────────── (κεντρικό inbox) ───┘
    └──[ItemID]──▶ INVENTORY_ITEM (προαιρετικά)
```

### Κύριοι Πίνακες

| Πίνακας | Περιγραφή | Βασικές Στήλες |
|---|---|---|
| `EMPLOYEE` | Προσωπικό ξενοδοχείου | EmpID, Role, Salary, isActive, Username, Password |
| `CUSTOMER` | Πελάτες (φυσικά πρόσωπα ή γκρουπ) | CustomerID, FirstName, LastName, Email, Phone, IsGroup |
| `ROOM` | Δωμάτια (510 σύνολο) | RoomNumber, RoomType, BasePrice, Status |
| `RESERVATION` | Κρατήσεις | ReservationID, CustomerID, CheckInDate, CheckOutDate, TotalCost, Status |
| `RESERVATION_ROOM` | Ανάθεση δωματίου σε κράτηση | ReservationID ↔ RoomNumber |
| `INVENTORY_ITEM` | Απόθεμα (minibar + κήπος) | ItemID, Category, Name, Quantity, MinThreshold |
| `MINIBAR_CONSUMPTION` | Χρεώσεις minibar ανά κράτηση | ConsumptionID, ReservationID, ItemID, Quantity, Charge |
| `NOTIFICATION` | Κεντρικό inbox ειδοποιήσεων | NotificationID, TargetRole, Type, Message, IsRead |
| `TRIP` | Δρομολόγια οχημάτων | TripID, VehicleID, DriverID, Date, Destination, Cost |
| `VEHICLE` | Στόλος οχημάτων | VehicleID, LicensePlate, Status, Type |
| `SHIFT` | Βάρδιες προσωπικού | ShiftID, EmpID, Date, Hours |
| `RENTED_SHOP` | Ενοικιαζόμενα καταστήματα | ShopID, TenantName, MonthlyRent |

---

## 6. Ρόλοι Χρηστών

| Ρόλος | Σελίδα | Κύριες Αρμοδιότητες |
|---|---|---|
| `admin` / `manager` | `/pages/admin.html` | Πλήρης πρόσβαση: κρατήσεις, τιμολόγηση, προσωπικό, έσοδα, backup |
| `receptionist` | `/pages/receptionist.html` | Check-in/out, χάρτης δωματίων, νέες κρατήσεις, χρεώσεις minibar |
| `maid` | `/pages/maid.html` | Καθαριότητα δωματίων, ιματισμός, αναφορά βάρδιας |
| `minibar` | `/pages/minibar.html` | Καταγραφή κατανάλωσης, αίτημα ανεφοδιασμού |
| `driver` | `/pages/driver.html` | Δρομολόγια, αναφορά βλαβών, δαπάνες καυσίμων |
| `gardener` | `/pages/gardener.html` | Εργασίες κήπου, αίτημα υλικών, events |
| `internal_manager` | `/pages/internal_manager.html` | Στόλος οχημάτων, έγκριση ανεφοδιασμού, μισθοδοσία, τιμολόγηση |
| `external_manager` | `/pages/external_manager.html` | Ενοίκια καταστημάτων, έσοδα |

---

## 7. Εγκατάσταση & Εκκίνηση

### Προαπαιτούμενα

- Node.js ≥ 18
- npm ≥ 9
- Λογαριασμός Supabase με ενεργοποιημένο Realtime

### Βήματα

```bash
# 1. Κλωνοποίηση αποθετηρίου
git clone https://github.com/PanagiwthsSen/HotelSystem.git
cd HotelSystem

# 2. Εγκατάσταση εξαρτήσεων
npm install

# 3. Δημιουργία αρχείου περιβάλλοντος
cp .env.example .env
# Συμπλήρωσε VITE_SUPABASE_URL και VITE_SUPABASE_KEY

# 4. Εκκίνηση development server
npm run dev
# → http://localhost:5173

# 5. Production build
npm run build
npm run preview
```

---

## 8. Μεταβλητές Περιβάλλοντος

Δημιούργησε αρχείο `.env` στον κύριο φάκελο:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-public-key
```

> **Σημείωση:** Το `.env` περιλαμβάνεται στο version control αυτού του project λόγω ακαδημαϊκής χρήσης. Σε παραγωγικό περιβάλλον θα έπρεπε να εξαιρείται μέσω `.gitignore`.

---

## 9. Αυτοματοποιημένες Δοκιμές

Το project διαθέτει **πλήρη σουίτα E2E δοκιμών** με Playwright που καλύπτει όλους τους κρίσιμους ρόλους και ροές:

```bash
# Εκτέλεση όλων των δοκιμών (headless)
npm run test:e2e

# Διαδραστική λειτουργία (με browser UI)
npm run test:e2e:ui
```

### Κατανομή δοκιμών

| Αρχείο / Κατηγορία | Δοκιμές |
|---|---|
| `login.spec.js` | Έλεγχος ταυτότητας όλων των ρόλων, λανθασμένα στοιχεία |
| `booking-wizard.spec.js` | Οδηγός κράτησης 3 βημάτων, έλεγχος χωρητικότητας |
| `receptionist-checkin.spec.js` | Διαδικασία check-in, ανάθεση δωματίου |
| `receptionist-checkout.spec.js` | Διαδικασία check-out, χρεώσεις minibar |
| `room-availability.spec.js` | Αναζήτηση διαθεσιμότητας δωματίων |
| `room-map.spec.js` | Φίλτρα χάρτη, κατάσταση δωματίων |
| `admin/` (8 specs) | Backup, παράπονα, απόθεμα, τιμολόγηση, ενοίκια, έσοδα, χρήστες, οχήματα |
| `maid/` (4 specs) | Καθαριότητα, αποχώρηση, ιματισμός, αναφορά |
| `driver/` (3 specs) | Βλάβη, καύσιμα, δρομολόγιο |
| `gardener/` (2 specs) | Αιτήματα, εργασίες |
| `manager/` (4 specs) | Άδειες, μισθοδοσία, ενοίκια, δρομολόγια |
| `minibar/` (1 spec) | Κατανάλωση |

### CI Pipeline

Κάθε `push` ή `pull request` στον κλάδο `main` εκτελεί αυτόματα όλες τις Playwright δοκιμές μέσω **GitHub Actions**. Τα αποτελέσματα αποθηκεύονται ως artifacts για 30 ημέρες.

---

## 10. Λειτουργίες Ανά Ρόλο

### Επισκέπτης (Guest)
- Αναζήτηση διαθεσιμότητας δωματίων με δυναμική τιμολόγηση
- Οδηγός κράτησης 3 βημάτων (στοιχεία επισκέπτη → πληρωμή → επιβεβαίωση)
- Έλεγχος χωρητικότητας σε πραγματικό χρόνο πριν την οριστικοποίηση
- Αυτόματος υπολογισμός προκαταβολής (20% ή 50% για κράτηση >90 ημέρες)

### Ρεσεψιονίστας
- Χάρτης δωματίων με real-time κατάσταση (Ελεύθερο / Κατειλημμένο / Καθαρισμός / Σύντομα κενό)
- Check-in με ανάθεση αριθμού δωματίου
- Check-out με προβολή χρεώσεων minibar και έκδοση απόδειξης (PDF)
- Νέα κράτηση με δυναμική τιμολόγηση
- Διαχείριση όλων των κρατήσεων (επεξεργασία, ακύρωση, αναζήτηση)

### Καθαρίστρια
- Λίστα δωματίων βάρδιας (βρώμικα / αναχωρήσεις)
- Κύκλωμα κατάστασης: Βρώμικο → Σε Καθαρισμό → Ελεύθερο
- Αποστολή & παραλαβή ιματισμού (laundry management)
- Αναφορά βλαβών και χαμηλού αποθέματος
- Υποβολή αναφοράς βάρδιας

### Minibar
- Καταγραφή κατανάλωσης ανά δωμάτιο (σύνδεση με ενεργή κράτηση)
- Αυτόματη ενημέρωση αποθέματος
- Αίτημα ανεφοδιασμού προς εσωτερικό διαχειριστή
- Προβολή εγκρίσεων/απορρίψεων αιτημάτων

### Οδηγός
- Προβολή δρομολογίων ημέρας
- Ενημέρωση κατάστασης δρομολογίου (Εκκρεμεί → Ολοκλήρωση)
- Αναφορά βλαβών οχήματος
- Καταχώριση δαπανών καυσίμων

### Κηπουρός
- Λίστα εργασιών με κύκλωμα κατάστασης (Εκκρεμεί → Σε εξέλιξη → Ολοκλήρωση)
- Διαχείριση events εξωτερικών χώρων
- Αίτημα υλικών κήπου
- Προβολή αποθέματος κήπου

### Εσωτερικός Διαχειριστής
- Ανάθεση δρομολογίων σε οδηγούς
- Διαχείριση στόλου οχημάτων
- Έγκριση/απόρριψη αιτημάτων ανεφοδιασμού minibar & κήπου
- Ανάθεση εργασιών σε κηπουρό
- Τιμολόγηση δωματίων & εποχικοί συντελεστές
- Μισθοδοσία & άδειες προσωπικού
- Διαχείριση ενοικίων καταστημάτων

### Διαχειριστής (Admin)
Περιλαμβάνει όλα τα παραπάνω καθώς και:
- Διαχείριση λογαριασμών χρηστών (δημιουργία, επεξεργασία, απενεργοποίηση)
- Διαχείριση αποθέματος (σύνολο ξενοδοχείου)
- Αναφορές εσόδων με γραφήματα (Chart.js)
- Εξαγωγή δεδομένων σε CSV
- Database backup
- Διαχείριση παραπόνων πελατών
- Ειδικές τιμολογήσεις ανά δωμάτιο και περίοδο
- Ιστορικό ειδοποιήσεων

---

## 11. Δυναμική Τιμολόγηση

Το σύστημα υλοποιεί πλήρη δυναμική τιμολόγηση μέσω της συνάρτησης `calcDynamicPrice()` στο `js/services/api.js`:

```
Τελική τιμή νύκτας = BasePrice × SeasonMultiplier × LowOccupancyDiscount
```

| Παράγοντας | Τιμή |
|---|---|
| Καλοκαίρι (Ιούν–Αύγ) | ×1.6 (προεπιλογή) |
| Χριστούγεννα (15 Δεκ – 7 Ιαν) | ×1.4 (προεπιλογή) |
| Πάσχα (±7 ημέρες) | ×1.3 (προεπιλογή) |
| Χαμηλή πληρότητα | −15% |
| Ειδική τιμή (custom range) | Ακριβής τιμή από `SPECIAL_PRICING` |

Οι συντελεστές εποχικότητας μπορούν να παραμετροποιηθούν από τον admin. Οι ειδικές τιμολογήσεις (custom date ranges) έχουν προτεραιότητα έναντι εποχικών συντελεστών.

---

## 12. Real-time Ενημερώσεις

Χρησιμοποιούνται **Supabase Realtime subscriptions** (WebSocket) για live ενημέρωση χωρίς ανανέωση σελίδας:

| Σελίδα | Channels | Πυροδότηση |
|---|---|---|
| Maid | `maid-rooms`, `maid-notifications`, `maid-reservations`, `maid-inventory`, `maid-laundry*` | Αλλαγή κατάστασης δωματίου, νέα ειδοποίηση |
| Receptionist | `ROOM`, `RESERVATION` | Check-in/out από άλλο τερματικό |
| Minibar | `NOTIFICATION` | Απόκριση αιτήματος ανεφοδιασμού |

Εφεδρική επανεκκίνηση δεδομένων κάθε 30 δευτερόλεπτα (`setInterval`) για αντοχή σε αποσύνδεση WebSocket.

---

## 13. CI/CD

Το GitHub Actions pipeline (`.github/workflows/playwright.yml`) εκτελείται αυτόματα σε κάθε `push`/`pull request` στον κλάδο `main`:

```
Push to main
     │
     ▼
┌─────────────────────────┐
│  Install Node.js (LTS)  │
│  npm ci                 │
│  Install Playwright     │
│  Run Playwright tests   │
│  Upload HTML report     │  ← artifacts (30 ημέρες)
└─────────────────────────┘
```

---

## 14. Γνωστοί Περιορισμοί

| Περιορισμός | Περιγραφή |
|---|---|
| **Μη κρυπτογραφημένοι κωδικοί** | Οι κωδικοί χρηστών αποθηκεύονται ως plain text στον πίνακα `EMPLOYEE`. Σε παραγωγικό σύστημα θα απαιτείτο bcrypt ή Supabase Auth. |
| **Απλό session management** | Η αυθεντικοποίηση βασίζεται σε `localStorage` χωρίς JWT ή Supabase Auth tokens. |
| **Χωρίς role-based row security** | Δεν χρησιμοποιούνται Supabase Row Level Security (RLS) πολιτικές — ο έλεγχος πρόσβασης γίνεται μόνο client-side. |
| **Inline credentials στο .env** | Τα credentials Supabase βρίσκονται στο version control (αποδεκτό για ακαδημαϊκή εργασία). |

---

## Στοιχεία Δοκιμών

| Χρήστης | Κωδικός | Ρόλος |
|---|---|---|
| `admin` | `1234` | Διαχειριστής |
| `maria_rec` | `1234` | Ρεσεψιονίστας |
| `eleni_maid` | `1234` | Καθαρίστρια |
| `nikos_bar` | `1234` | Minibar |
| `kostas_rec` | `1234` | Ρεσεψιονίστας |
| `ioan_manag` | `1234` | Εσωτερικός Διαχειριστής |

---

*Grand Kavala Hotel System — Πτυχιακή Εργασία*
