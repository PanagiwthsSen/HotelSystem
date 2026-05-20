# Grand Kavala Hotel System

## Commands
- `npm run dev` — Vite dev server (no config file, Vite defaults)
- `npm run build` — Vite build
- No tests, no lint, no typecheck

## Stack
- **Vanilla JS** (ES modules + inline `<script>`), **Vite 8**, **Supabase**
- No framework, no build-step beyond Vite

## Project structure
| Path | Purpose |
|---|---|
| `index.html` | Public landing page (guest-facing) |
| `pages/login.html` | Staff login portal |
| `pages/booking.html` | Guest booking (3-step wizard) |
| `pages/admin.html` | Admin/owner dashboard (Chart.js, Tabler Icons via CDN) |
| `pages/receptionist.html` | Reception check-in/out, room map |
| `pages/maid.html` | Maid task list (hardcoded data) |
| `pages/minibar.html` | Mini-bar consumption (hardcoded data) |
| `pages/manager.html` | Fleet/gardens manager (hardcoded data) |
| `js/supabase-config.js` | **Must be first** — creates Supabase client, attaches `window.supabase`, defines `window.showConfirm()` |
| `js/login.js` | ES module auth → saves `hotel_user` to localStorage |
| `css/*.css` | Per-page stylesheets |

## Module loading inconsistency
- **Admin**, **login**, and **booking** pages: use `<script type="module" src="...">` for both `supabase-config.js` and their page script (admin.js, login.js are ES modules).
- **Receptionist**, **maid**, **minibar**, **manager**: loaded as plain `<script>` (not `type="module"`). They depend on `window.supabase` (from `supabase-config.js`'s ES module) or use hardcoded mock data.

## Supabase
- Credentials in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`). The `.env` is in version control.
- The `EMPLOYEE` table stores plain-text passwords (no hashing).

## Database case rules
- **Table and column names are PascalCase/CamelCase** (e.g. `"EMPLOYEE"`, `"FirstName"`). In raw SQL queries (Supabase dashboard, pgAdmin, etc.) you **must** wrap them in double quotes.
- In Supabase JS client queries, use exact case without quotes: `.from('EMPLOYEE').select('FirstName, LastName')`. Never use snake_case.
- Validate all **REQUIRED** fields before inserting/updating (annotated `[REQUIRED]` below).

## Database schema
| Table | Columns |
|---|---|
| `COMPLAINT` | ComplaintID [REQUIRED], EmpID [REQUIRED] FK→EMPLOYEE, CustomerID [REQUIRED] FK→CUSTOMER, Description [REQUIRED], Status [OPTIONAL], CreatedAt [OPTIONAL] |
| `CUSTOMER` | CustomerID [REQUIRED], Phone [REQUIRED], Email [REQUIRED], IsGroup [REQUIRED], FirstName [OPTIONAL], LastName [OPTIONAL], Country [OPTIONAL] |
| `EMPLOYEE` | EmpID [REQUIRED], Role [REQUIRED], Salary [REQUIRED], isActive [REQUIRED], Username [OPTIONAL], Password [OPTIONAL], Leaves [OPTIONAL], Score [OPTIONAL], IBAN [OPTIONAL], LastPaymentDate [OPTIONAL], FirstName [OPTIONAL], LastName [OPTIONAL], Country [OPTIONAL] |
| `INVENTORY_ITEM` | ItemID [REQUIRED], Category [REQUIRED], Name [REQUIRED], Quantity [REQUIRED], MinThreshold [REQUIRED] |
| `LEASE_PAYMENT` | PaymentID [REQUIRED], ShopID [REQUIRED] FK→RENTED_SHOP, Amount [REQUIRED], IsDelayed [REQUIRED] |
| `MINIBAR_CONSUMPTION` | ConsumptionID [REQUIRED], ReservationID [REQUIRED] FK→RESERVATION, ItemID [REQUIRED] FK→INVENTORY_ITEM, Quantity [REQUIRED], Charge [REQUIRED] |
| `NOTIFICATION` | NotificationID [REQUIRED], TargetRole [REQUIRED], Type [REQUIRED], Message [REQUIRED], ItemID [OPTIONAL] FK→INVENTORY_ITEM, IsRead [REQUIRED], CreatedAt [OPTIONAL] |
| `RECEIPT` | ReceiptID [REQUIRED], ReservationID [OPTIONAL] FK→RESERVATION, PaymentDate [REQUIRED], Amount [REQUIRED], Category [OPTIONAL] |
| `RENTED_SHOP` | ShopID [REQUIRED], TenantName [REQUIRED], MonthlyRent [REQUIRED], ShopName [OPTIONAL] |
| `RESERVATION` | ReservationID [REQUIRED], CustomerID [REQUIRED] FK→CUSTOMER, CheckInDate [REQUIRED], CheckOutDate [REQUIRED], TotalCost [REQUIRED], Status [REQUIRED], RoomType [OPTIONAL] |
| `RESERVATION_ROOM` | ReservationID [REQUIRED] FK→RESERVATION, RoomNumber [REQUIRED] FK→ROOM |
| `ROOM` | RoomNumber [REQUIRED], RoomType [REQUIRED], BasePrice [REQUIRED], Status [REQUIRED] |
| `SHIFT` | ShiftID [REQUIRED], EmpID [REQUIRED] FK→EMPLOYEE, Date [REQUIRED], Hours [REQUIRED] |
| `TRIP` | TripID [REQUIRED], VehicleID [REQUIRED] FK→VEHICLE, DriverID [REQUIRED] FK→EMPLOYEE, CustomerID [OPTIONAL] FK→CUSTOMER, Date [REQUIRED], Cost [REQUIRED], Destination [REQUIRED] |
| `VEHICLE` | VehicleID [REQUIRED], LicensePlate [REQUIRED], Status [REQUIRED], Type [OPTIONAL], PlateNumber [OPTIONAL] |
| `VEHICLE_SERVICE` | ServiceID [REQUIRED], VehicleID [REQUIRED] FK→VEHICLE, ServiceDate [REQUIRED], NextServiceDate [REQUIRED], Cost [OPTIONAL], Notes [OPTIONAL] |

## Auth
- Simple localStorage session: key `hotel_user` stores `{ id, name, Role }`
- Role → page redirect (admin.js:547-549): `admin`/`manager` → admin.html, `receptionist` → receptionist.html, `maid` → maid.html, `minibar` → minibar.html
- No real JWT or Supabase Auth sessions

## Important quirks
- Admin page uses ES module imports → all admin functions must be explicitly assigned to `window.*` to be callable from inline HTML `onclick` handlers (e.g. `window.savePrices`, `window.logout`, `window.resolveComplaint`)
- `supabase-config.js` also sets `window.showConfirm()` — a custom modal replacing `confirm()`. It's async and must be used with `await`.
- All page CSS and JS paths are absolute (e.g. `/css/admin.css`) — Vite serves from project root
- Admin revenue chart uses Chart.js from CDN (loaded in admin.html by `<script>` tag, not ES import)
- Greek language throughout
- `package.json`: `"type": "commonjs"` (Vite handles ESM regardless)

## Database current state (2026-05-19)

| Table | Rows | Notes |
|---|---|---|
| CUSTOMER | 10 | Mostly Παναγιώτης Σέντας test entries |
| EMPLOYEE | 6 | admin:1234, maria_rec:1234, eleni_maid:1234, kostas_rec:1234, nikos_bar:1234, ioan_manag:1234 |
| ROOM | 510 | All Status = `free`, BasePrice varies |
| RESERVATION | 1 | CheckIn 2026-05-20, Status = Confirmed, no rooms in RESERVATION_ROOM |
| RESERVATION_ROOM | 0 | Empty |
| RECEIPT | 0 | Empty — revenue chart has no data |
| COMPLAINT | 0 | Empty |
| MINIBAR_CONSUMPTION | 0 | Empty |
| SHIFT | 0 | Empty |
| TRIP | 0 | Empty |
| INVENTORY_ITEM | 8 | Some below MinThreshold |
| RENTED_SHOP | 4 | ShopID 2 (Kavala Fashion Boutique) has delayed payment |
| LEASE_PAYMENT | 4 | One delayed |
| VEHICLE | 4 | 2 available, 1 in_use, 1 maintenance |

## Testing notes
- **Login**: `admin`/`1234` (owner), `maria_rec`/`1234` (reception), `eleni_maid`/`1234` (maid), `nikos_bar`/`1234` (minibar), `ioan_manag`/`1234` (manager)
- **Arrivals/departures**: Only 1 reservation starting 2026-05-20. For today's data, insert with CheckInDate/CheckOutDate = '2026-05-19'
- **Revenue chart**: No receipts exist — insert sample rows to test
- **Room map**: All 510 rooms are `free` — no occupied/dirty states visible yet
- **Maid page**: Uses hardcoded mock data (not connected to Supabase)
- **Minibar page**: Uses hardcoded mock data (not connected to Supabase)
- **Manager page**: Uses hardcoded mock data (not connected to Supabase)

## Workflow
- If implementation is requested while in plan mode, I will present a plan and ask you to confirm (by replying "yes" or "switch to build mode") before executing.
