# CounterFlow POS — Software Walkthrough

A practical guide to the whole system: what each piece is, the screens, which
buttons take you where, and how the main processes flow end to end.

---

## 1. The pieces

| Piece | What it is | How it runs | URL / entry |
|---|---|---|---|
| **Backend + DB** | Medusa v2 API + Postgres (the shared "POS server") | Docker, fixed port | `http://localhost:9000` |
| **Admin site** | Medusa admin dashboard (catalog, prices, orders, customers) | served by backend | `http://localhost:9000/app` |
| **Desktop POS** | Electron + React till app (the counter terminal) | `start-demo.bat` / Desktop launcher | opens its own window (Vite `:5173`) |
| **Mobile POS** | Expo / React Native app (field sales) | `start-mobile.bat` (Metro `:8088`) | Expo Go → `exp://<PC-IP>:8088` |

**One-click launch:** double-click `Start CounterFlow POS.bat` on the Desktop →
starts Docker → backend → opens admin + the desktop POS.

**Login (seeded):** `manager@pos.local / manager12345` (manager) ·
`cashier@pos.local / cashier12345` (cashier). Manager PIN for approvals: `9999`.

---

## 2. Roles

- **Cashier** — sells, returns (with manager approval), parks sales, runs EOD.
- **Manager** — everything a cashier can do **plus** Add Product, Promotions,
  Inventory, Stores, big discounts, and approvals via PIN.

Sensitive actions (discount over 10%, returns) pop a **Manager PIN modal**;
the PIN is verified online, or offline against a cached hash.

---

## 3. Desktop POS — screen map (the top nav)

Every item in the top navigation and where it takes you:

| Nav button | Route | What you do there |
|---|---|---|
| **Catalog** | `/products` | Browse the product grid; tap a product → detail modal → add to cart |
| **Add Product** | `/add-product` | **Scan a barcode to create a new product** (name + price) — manager tool |
| **Checkout** | `/pos` | The main till: scan, cart, discounts, coupons, loyalty, payment, complete sale |
| **Dashboard** | `/transactions` | Recent transactions overview |
| **Analytics** | `/analytics` | Sales KPIs, daily trend, payment mix, top products, sales-by-store, CSV export |
| **Customers** | `/customers` | Look up a customer by phone → loyalty points + purchase history |
| **Promotions** | `/promotions` | Create/list/delete coupons (%/flat/BOGO, min-subtotal, validity) |
| **Inventory** | `/inventory` | Stock + low-stock alerts · Suppliers · Purchase Orders + Receive |
| **Stores** | `/stores` | Create / activate / deactivate outlets (multi-store) |
| **Orders** | `/orders` | All orders booked on this terminal |
| **Offline Orders** | `/offline-trades` | Audit of orders booked offline + their sync status; Push / Export CSV |
| **Returns** | `/returns` | Find an order → select items → refund (manager-approved) |
| **Bulk Upload** | `/bulk` | Bulk-create orders |
| **EOD** | `/closing` | Cash closing: opening float, counted cash, variance |
| **Pending Sync** | `/pending` | Orders still queued to sync |
| **Sync** | `/sync` | Sync status + manual sync controls |
| **Conflicts** | `/conflicts` | Sync conflicts needing review |
| **Settings** | `/settings` | Connection, business identity, tax/GST, loyalty, payments, theme |

If you're **not logged in**, every route redirects to **`/login`**.

---

## 4. The core SELL flow (button by button)

**Checkout screen (`/pos`)** is a 3-pane layout: left = scanner + search +
parked sales, center = catalog/search results, right = cart + payment.

1. **Pick the outlet** (top context bar dropdown) and optionally enter the
   **customer name + mobile**. Entering a known mobile auto-loads the customer's
   **loyalty** card (points, "earns N pts").
2. **Add items** — either:
   - **Scan** a barcode into the always-focused scanner box → item drops into
     the cart instantly (green pulse). Unknown code → red toast: *"use Search"*.
   - **Search** by name/SKU (center pane) → click a result → adds to cart.
3. **Cart (right pane):** adjust quantity, remove a line (×).
4. **Discount** (optional): type a cart discount. Over **10%** → a **Manager PIN
   modal** appears; enter PIN to approve.
5. **Coupon** (optional): type a code → **Apply** → shows "Coupon X − ₹Y".
6. **Loyalty** (optional): if a customer is loaded, **Redeem** points (₹1 each).
7. **Totals** update live — Subtotal, Discount, Coupon, Points, **Taxable value,
   CGST, SGST**, **Total**.
8. **Payment mode**: Cash / **UPI (shows a QR)** / Credit.
   - UPI → **"Show UPI QR"** → customer scans → you capture the UTR → completes.
9. **Complete order** → the sale is:
   - written to **local SQLite** (offline-first),
   - given a **local order number + idempotency key**,
   - **queued for sync**, receipt rendered (**Reprint** reprints the last one),
   - loyalty points awarded (best-effort, online),
   - cart resets.
10. **⏸ Hold** parks the current cart (left-pane "Parked sales" list) so you can
    serve another customer; **Resume** brings it back.

---

## 5. Other key flows

**Add Product by scan (`/add-product`, manager):** focus the field → scan an
**unknown** barcode → a form appears pre-filled with that code → enter **name +
price** → **Add product**. It's created on the backend (with a real price set,
so the admin pricing editor works) and synced down so it's **immediately
scannable** on Checkout.

**Returns (`/returns`):** search/select the original order → tick the items and
quantities to return → choose refund mode (cash / store credit) → **Manager PIN**
→ confirm. Stock is added back locally; a `return.created` event **syncs**.

**EOD / Cash closing (`/closing`):** enter opening float, count physical cash →
see **expected vs counted variance** → close shift. A `cash.closed` event
**syncs**.

**Inventory (`/inventory`)** — three tabs:
- **Stock:** every product's stock-on-hand vs reorder point, a **⚠️ low-stock**
  banner, Low/OK badges; edit stock + reorder inline → **Save**.
- **Suppliers:** add / list / delete vendors.
- **Purchase Orders:** pick supplier → add lines (SKU + qty + cost) → **Create
  PO** → later **Receive** (goods-receipt) which **adds the qty to stock**.

**Promotions (`/promotions`, manager):** fill code + type (%/flat/BOGO) + value
(+ optional min-subtotal & dates) → **Add**. Coupons are cached on each terminal
so they apply at Checkout even offline.

**Customers (`/customers`):** enter a phone → see the loyalty profile (points,
lifetime spend, visits) + recent purchases from this terminal.

**Analytics (`/analytics`):** pick a range (Today / 7d / 30d / All) → KPIs
(orders, gross, net, tax, discounts, est. gross profit), **daily trend**,
**payment mix**, **sales by store**, **top products**, and **📥 CSV** export.

**Stores (`/stores`, manager):** create an outlet (name/code/city); it syncs
into the Checkout outlet dropdown. Activate/deactivate as needed.

**Settings (`/settings`):** Backend URL + terminal code, **Tax/GST** (rate, HSN,
MRP-inclusive toggle), **Loyalty** (earn rate, assumed margin %), **Payments**
(UPI VPA, NEFT/IFSC), business identity + GSTIN, and **theme** (light/dark/system).

---

## 6. Offline-first & sync (how it works under the hood)

```
Sell offline ─► write to local SQLite ─► enqueue event (idempotency key)
                                              │
              every 30s the sync worker ──────┤
                  probes backend /health      │
                      online? ───────────────►├─ push queued events (batch ≤ 50)
                                              │     order.created  → create order
                                              │     return.created → create return
                                              │     cash.closed    → record closing
                                              │  ◄─ mark each Synced / Conflict
                      offline? ──────────────►└─ keep queue, retry next tick (≤ 5×)
```

- The till **never blocks on the network** — every sale is local-first.
- When connectivity returns, the **background worker auto-syncs** (≈30s cadence);
  **idempotency keys** prevent duplicates; failures retry up to 5× then land on
  the **Conflicts** screen.
- **Offline Orders** page shows the audit trail + per-row sync state, with a
  manual **Push to backend** button.
- Requires **one initial online sync** (to cache catalog + login) before going
  offline.

---

## 7. Admin site (`http://localhost:9000/app`)

The Medusa admin is the back-office source of truth: create products and set
their **barcode/SKU + price** (which is what makes them scannable at the till),
view orders/customers, manage users. Log in with the manager account.

---

## 8. Mobile POS (Expo)

`start-mobile.bat` runs Metro on **port 8088**. On a phone on the same Wi-Fi,
open **Expo Go** and connect to **`exp://<PC-IP>:8088`**. The app points at the
backend via `apps/mobile-pos/.env` (`EXPO_PUBLIC_POS_BACKEND_URL`). It has the
core selling flow (POS, Cart, Returns, Cash closing, Sync) and a **camera**
barcode scanner. *(The newer desktop features — loyalty, promotions, inventory,
analytics, stores — are desktop-first for now.)*

---

## 9. Quick reference — button → destination

| You click… | …it goes to |
|---|---|
| A catalog product card | Product detail modal → **Add to cart** → Checkout cart |
| Scanner success (Checkout) | New cart line (right pane) |
| **Complete order** | Saves locally + queues sync + prints receipt + resets cart |
| **⏸ Hold** | Parks cart → appears under "Parked sales" (left) |
| **Resume** (parked) | Loads that cart back into Checkout |
| **Show UPI QR** | UPI QR modal → capture UTR → completes sale |
| **Apply** (coupon) | Adds a "Coupon" discount line |
| **Add product** (Add Product) | Creates product on backend → scannable on Checkout |
| **Create PO** → **Receive** | Adds received qty to stock-on-hand (Inventory → Stock) |
| **Push to backend** (Offline Orders) | Forces an immediate sync of the queue |
| **📥 CSV** (Analytics / Offline Orders) | Downloads a CSV export |
| **Sign out** (Settings) | Returns to `/login` |
