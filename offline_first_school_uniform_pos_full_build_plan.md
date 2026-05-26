# Offline-First School Uniform POS System  
## Full Build Plan, PRD, SRS, System Design, Database Design, Sync Logic, Security, Reports, and MVP Scope

---

## 0. Purpose of This Document

This document is a complete step-by-step build guide for an offline-first POS system for a school-uniform distributor.

The business sells uniforms for multiple schools. Some sales counters may operate in remote areas where internet access is unreliable or unavailable. Therefore, the POS must continue working offline and sync with the central Medusa.js backend when internet returns.

The recommended architecture is:

```text
Medusa.js Backend + PostgreSQL
        ↓
Custom Sync API
        ↓
Electron/React POS App + SQLite
```

Medusa should act as the central commerce backend, inventory source, admin system, and reporting system. The POS should be a separate offline-first client with a local database and sync queue.

---

# 1. Core System Idea

## 1.1 Business Flow

The school-uniform POS should not behave like a normal retail POS only.

The core flow should be:

```text
School → Class → Gender → Uniform Type → Size → Product / Kit → Bill
```

Example:

```text
School: Green Valley Public School
Class: 5
Gender: Boy
Uniform Type: Regular
Kit:
  - Shirt Size 28
  - Pant Size 28
  - Belt
  - Tie
  - Socks
```

The cashier should not manually search every item. The system should suggest products and kits based on school, class, gender, and uniform type.

---

# 2. Recommended Architecture

## 2.1 High-Level Architecture

```text
Cloud Backend
  ├── Medusa.js
  ├── PostgreSQL
  ├── Redis
  ├── Custom Modules
  ├── Custom Sync APIs
  ├── Medusa Admin
  └── Reports

Remote POS Device
  ├── Electron App
  ├── React UI
  ├── SQLite Local DB
  ├── Sync Worker
  ├── Barcode Scanner
  ├── Thermal Printer
  └── Local Receipt Engine
```

## 2.2 Why This Architecture?

Do not run full Medusa locally on every POS device.

Reasons:

```text
Hard to maintain
Hard to update
Higher system requirements
Complex database syncing
Higher risk of data corruption
Harder staff setup
```

Better approach:

```text
Central Medusa backend
Offline-first POS app
Local SQLite database
Sync queue
Conflict resolution
```

---

# 3. Technology Stack

## 3.1 Backend Stack

```text
Backend Framework: Medusa.js v2
Primary Database: PostgreSQL
Cache / Queue: Redis
Language: TypeScript
Admin: Medusa Admin + custom admin extensions
Deployment: VPS / Docker / cloud hosting
```

## 3.2 POS App Stack

```text
Desktop App: Electron
Frontend: React
Language: TypeScript
Local Database: SQLite
Printer: Thermal printer integration
Barcode: Scanner keyboard input / USB barcode scanner
```

## 3.3 Why Electron?

Electron is recommended because the POS may need:

```text
Thermal printer support
Barcode scanner support
Local SQLite database
Offline reliability
Desktop billing counter usage
Controlled app updates
```

A PWA can also work offline, but Electron is more reliable for POS hardware and long offline usage.

---

# 4. PRD — Product Requirements Document

## 4.1 Product Name

```text
Offline-First School Uniform POS System
```

## 4.2 Objective

Build a reliable offline-first POS system for school-uniform distributors that can sell uniforms in remote areas, work without internet, print receipts, manage inventory, and sync sales data to a central Medusa.js backend when internet becomes available.

## 4.3 Target Users

### Owner / Distributor

Needs:

```text
View total sales
Track school-wise performance
Manage inventory
View cash collection
Monitor remote counters
Resolve sync conflicts
Generate reports
```

### Store Manager

Needs:

```text
Manage staff
Approve discounts
Handle returns
Check low stock
Open and close daily counter
Resolve failed offline bills
```

### Cashier

Needs:

```text
Fast billing
Barcode scanning
School-wise product search
Offline billing
Receipt printing
Simple payment entry
```

### Inventory Staff

Needs:

```text
Stock inward
Stock transfer
Size-wise stock view
Low-stock alerts
Stock adjustment
```

### Optional School Representative

Needs:

```text
View assigned uniform catalog
View class-wise kit
Place bulk order request
Track fulfillment status
```

## 4.4 Core Problems

```text
Internet may be unavailable at remote counters.
Parents ask by school/class, not by SKU.
Uniforms have size, gender, school, class, and academic-year dependencies.
Same item type may have different school logos, colors, or pricing.
Manual stock tracking causes mismatch.
Offline sales may create central inventory conflicts.
```

## 4.5 Core Goals

```text
POS should work offline.
Orders should sync automatically.
Inventory should be school-wise and size-wise.
Billing should be fast.
Barcode scanning should be supported.
Receipts should print locally.
Central admin should show all counters.
Owner should get reports.
System should prevent duplicate orders during sync.
```

## 4.6 MVP Scope

The MVP should include:

```text
Medusa backend setup
School management
Product and variant management
Uniform kit management
POS device registration
Electron/React POS app
SQLite local database
Offline billing
Cash payment
Manual UPI reference entry
Barcode scanning
Receipt printing
Order sync
Basic conflict handling
Inventory deduction
Basic reports
User roles
Audit logs
```

Avoid in MVP:

```text
Complex loyalty
Parent ecommerce portal
Advanced school portal
AI forecasting
Accounting software integration
Card terminal integration
Multi-currency
Advanced CRM
```

---

# 5. SRS — Software Requirements Specification

## 5.1 Functional Requirements

### FR-001: User Authentication

The system shall allow users to log in with role-based access.

Roles:

```text
Owner
Admin
Store Manager
Cashier
Inventory Staff
School Representative
```

### FR-002: Offline Login

The POS shall allow offline login only for users who have logged in successfully online before.

Offline login policy:

```text
First login must be online.
Offline session should expire after configurable days.
Cashier PIN should be required for offline access.
Manager PIN should be required for sensitive offline actions.
```

### FR-003: School Management

Admin shall be able to create and manage schools.

Fields:

```text
School name
School code
Address
City
Area
Route
Contact person
Phone
Email
Status
Academic year
```

### FR-004: Product Management

Admin shall manage products and product variants.

Fields:

```text
Product name
Category
School mapping
Class mapping
Gender mapping
Uniform type
Size
Color
Fabric
SKU
Barcode
MRP
Selling price
Tax rate
Status
Image
```

### FR-005: Uniform Kit Management

Admin shall create kits by school, class, gender, uniform type, and academic year.

Example:

```text
School: ABC School
Class: 4
Gender: Girl
Uniform Type: Regular
Kit Items:
  - Shirt
  - Skirt
  - Belt
  - Tie
  - Socks
```

### FR-006: POS Billing

Cashier shall be able to create a bill by:

```text
Selecting school
Selecting class
Selecting gender
Adding student name
Adding parent mobile
Scanning barcode
Searching product
Adding kit
Changing quantity
Applying allowed discount
Choosing payment mode
Printing receipt
```

### FR-007: Offline Billing

The POS shall create and store bills locally when internet is unavailable.

Every offline bill must include:

```text
Local order ID
Device ID
Cashier ID
School ID
Student name
Parent mobile
Cart items
Payment mode
Total amount
Created timestamp
Sync status
Idempotency key
```

### FR-008: Sync Queue

The POS shall maintain a sync queue for offline events.

Syncable events:

```text
Order created
Return created
Exchange created
Stock adjustment
Cash closing
Audit event
```

### FR-009: Order Sync

The POS shall push offline orders to Medusa when internet becomes available.

Sync statuses:

```text
Pending
Syncing
Synced
Failed
Conflict
Cancelled Locally
```

### FR-010: Inventory Deduction

The POS shall deduct local stock immediately after billing.

The backend shall deduct central stock after successful sync.

### FR-011: Conflict Handling

The backend shall detect conflicts such as:

```text
Duplicate order
Stock not available
Product inactive
Price changed
Tax changed
Invalid cashier
Invalid POS device
Invalid school mapping
```

### FR-012: Receipt Printing

The POS shall print receipts locally.

Receipt fields:

```text
Distributor name
Store name
School name
Student name
Parent mobile
Order number
Item name
Size
Quantity
Price
Discount
Tax
Total
Payment mode
Cashier name
Date and time
Sync status
```

### FR-013: Returns and Exchanges

The POS shall support:

```text
Full return
Partial return
Size exchange
Product exchange
Refund as cash
Refund as store credit
```

For MVP, offline returns should require manager PIN.

### FR-014: Reports

The system shall generate reports for:

```text
Daily sales
School-wise sales
Class-wise sales
Product-wise sales
Size-wise sales
Cashier-wise sales
Payment-wise sales
Low stock
Offline pending orders
Sync conflicts
Returns and exchanges
```

---

## 5.2 Non-Functional Requirements

### NFR-001: Offline Availability

The POS should work without internet for a configurable period, for example:

```text
1 day
3 days
7 days
```

The exact offline duration should be a business policy.

### NFR-002: Sync Reliability

The sync process must be idempotent.

Meaning:

```text
The same offline order must not create duplicate central orders.
```

### NFR-003: Local Performance

Product search and barcode lookup should work locally and return results quickly.

Target:

```text
Product search: under 1 second
Barcode scan lookup: near instant
Bill creation: no dependency on server during offline mode
```

### NFR-004: Security

The system must include:

```text
Role-based access
Encrypted local database
Secure device registration
Audit logs
Session expiry
Manager approval for sensitive actions
No plain-text sensitive exports
```

### NFR-005: Backup

The POS should support emergency backup of unsynced orders.

Backup format:

```text
Encrypted JSON
Encrypted SQLite backup
CSV export only for non-sensitive operational recovery
```

---

# 6. Backend Setup

## 6.1 Create Medusa Backend

Example setup:

```bash
npx create-medusa-app@latest school-uniform-pos
cd school-uniform-pos/apps/backend
```

During setup:

```text
Install backend: Yes
Install storefront: Optional / No for MVP
Database: PostgreSQL
Admin dashboard: Yes
```

For this POS system, the storefront is not required in the first MVP. The main frontend will be the POS app.

## 6.2 Configure Environment Variables

Create or update `.env`:

```env
DATABASE_URL=postgres://user:password@localhost:5432/school_uniform_pos
REDIS_URL=redis://localhost:6379

JWT_SECRET=replace_with_secure_secret
COOKIE_SECRET=replace_with_secure_secret

ADMIN_CORS=http://localhost:7000,http://localhost:9000
AUTH_CORS=http://localhost:7000,http://localhost:9000
STORE_CORS=http://localhost:7000
```

In production, use secure secrets and proper domain-specific CORS.

## 6.3 Core Backend Responsibilities

The backend must handle:

```text
School management
Uniform product catalog
Class/gender/size mapping
Uniform kits
Inventory
POS devices
Offline sync
Orders
Returns
Reports
Users and permissions
Audit logs
```

---

# 7. Medusa Custom Modules

## 7.1 Required Custom Modules

Create these custom modules:

```text
School Module
Academic Year Module
Uniform Kit Module
POS Device Module
Offline Sync Module
Student Module
Receipt Module
Audit Log Module
Conflict Module
```

## 7.2 Suggested Backend Folder Structure

```text
apps/backend/src/
  modules/
    school/
      models/
        school.ts
        school-class.ts
        academic-year.ts
      service.ts
      index.ts

    uniform-kit/
      models/
        uniform-kit.ts
        uniform-kit-item.ts
        uniform-rule.ts
      service.ts
      index.ts

    pos-device/
      models/
        pos-device.ts
        pos-session.ts
      service.ts
      index.ts

    offline-sync/
      models/
        sync-batch.ts
        sync-event.ts
        sync-conflict.ts
      service.ts
      index.ts

    audit-log/
      models/
        audit-log.ts
      service.ts
      index.ts

  api/
    admin/
      schools/
      uniform-kits/
      pos-devices/
      sync-conflicts/

    pos/
      auth/
      sync/
      barcode/
      orders/
      returns/
```

## 7.3 School Module

### Purpose

Manage schools, academic years, classes, areas, and school-specific selling rules.

### Data Models

```text
School
AcademicYear
SchoolClass
```

### School Fields

```text
id
name
code
address
city
area
route
contact_person
phone
email
status
created_at
updated_at
```

### SchoolClass Fields

```text
id
school_id
class_name
display_order
academic_year_id
status
created_at
updated_at
```

### AcademicYear Fields

```text
id
name
start_date
end_date
is_active
created_at
updated_at
```

## 7.4 Uniform Kit Module

### Purpose

Manage class-wise, gender-wise, school-wise uniform kits.

### Data Models

```text
UniformKit
UniformKitItem
UniformRule
```

### UniformKit Fields

```text
id
name
school_id
class_id
gender
uniform_type
academic_year_id
status
created_at
updated_at
```

### UniformKitItem Fields

```text
id
kit_id
product_variant_id
quantity
is_required
sort_order
created_at
updated_at
```

### UniformRule Fields

```text
id
school_id
class_id
gender
uniform_type
kit_id
academic_year_id
created_at
updated_at
```

## 7.5 POS Device Module

### Purpose

Register and control POS devices.

### POSDevice Fields

```text
id
device_code
device_name
store_location_id
sales_channel_id
assigned_user_id
last_sync_at
status
registered_at
blocked_at
created_at
updated_at
```

### POSSession Fields

```text
id
device_id
user_id
login_at
logout_at
session_status
last_online_at
created_at
updated_at
```

## 7.6 Offline Sync Module

### Purpose

Track sync batches, sync events, and sync conflicts.

### SyncBatch Fields

```text
id
device_id
batch_id
status
started_at
completed_at
total_events
success_count
failed_count
created_at
updated_at
```

### SyncEvent Fields

```text
id
batch_id
device_id
event_type
idempotency_key
payload
status
error_code
error_message
server_reference_id
created_at
updated_at
```

### SyncConflict Fields

```text
id
event_id
device_id
conflict_type
severity
payload
resolution_status
resolved_by
resolved_at
created_at
updated_at
```

---

# 8. Product and Inventory Design

## 8.1 Product Structure

Use Medusa products for uniform product families.

Example product:

```text
Product: ABC School Boys Shirt
Category: Shirt
School: ABC School
Uniform Type: Regular
```

Use product variants for size-wise SKUs.

Example variants:

```text
ABC-B-SHIRT-26
ABC-B-SHIRT-28
ABC-B-SHIRT-30
ABC-B-SHIRT-32
```

## 8.2 Product Variant Metadata

Extend or link product variants with custom school-uniform fields.

Suggested fields:

```text
school_id
class_from
class_to
gender
size
color
fabric
uniform_type
academic_year_id
barcode
sku
```

## 8.3 Inventory Structure

Use inventory, stock locations, and sales channels.

Recommended structure:

```text
Sales Channel: Main Online / Admin
Sales Channel: POS Counter 1
Sales Channel: POS Counter 2
Sales Channel: Remote Camp Sale
```

```text
Stock Location: Main Warehouse
Stock Location: City Store
Stock Location: Remote Counter 1
Stock Location: School Camp 1
```

## 8.4 Inventory Layers

Use three layers:

### 1. Central Inventory

Stored in PostgreSQL through Medusa.

```text
Source of truth after sync
```

### 2. Local POS Inventory Snapshot

Stored in SQLite.

```text
Last synced stock available to the POS device
```

### 3. Unsynced Local Movements

Stored in SQLite.

```text
Offline sales
Offline returns
Offline stock adjustments
```

Formula:

```text
Local Available Stock =
Last Synced Stock
- Unsynced Local Sales
+ Unsynced Local Returns
+ Unsynced Local Adjustments
```

---

# 9. Backend API Design

## 9.1 POS Authentication APIs

```http
POST /pos/auth/login
POST /pos/auth/refresh
POST /pos/auth/logout
POST /pos/device/register
POST /pos/device/heartbeat
```

## 9.2 POS Pull Sync API

```http
POST /pos/sync/pull
```

Purpose:

```text
Download master data to POS
```

Request:

```json
{
  "device_id": "POS-001",
  "last_sync_at": "2026-05-18T10:00:00Z"
}
```

Response:

```json
{
  "server_time": "2026-05-18T10:05:00Z",
  "schools": [],
  "classes": [],
  "products": [],
  "variants": [],
  "kits": [],
  "prices": [],
  "inventory_snapshot": [],
  "users": [],
  "settings": []
}
```

## 9.3 POS Push Sync API

```http
POST /pos/sync/push
```

Purpose:

```text
Upload offline orders, returns, adjustments, and audit logs
```

Request:

```json
{
  "device_id": "POS-001",
  "batch_id": "batch_20260518_001",
  "events": [
    {
      "event_type": "order.created",
      "idempotency_key": "POS-001_local_1001",
      "payload": {}
    }
  ]
}
```

Response:

```json
{
  "batch_id": "batch_20260518_001",
  "results": [
    {
      "idempotency_key": "POS-001_local_1001",
      "status": "synced",
      "server_order_id": "order_123"
    }
  ]
}
```

## 9.4 Barcode API

```http
GET /pos/barcode/:barcode
```

Purpose:

```text
Find product variant by barcode
```

This should be available online, but the POS should also maintain a local barcode index in SQLite for offline use.

## 9.5 Conflict APIs

```http
GET /admin/sync-conflicts
POST /admin/sync-conflicts/:id/resolve
POST /admin/sync-conflicts/:id/reject
```

## 9.6 Reports APIs

```http
GET /admin/reports/sales
GET /admin/reports/school-sales
GET /admin/reports/product-sales
GET /admin/reports/low-stock
GET /admin/reports/payment-summary
GET /admin/reports/offline-sync
GET /admin/reports/returns
GET /admin/reports/cashier-sales
GET /admin/reports/device-sales
```

---

# 10. Backend Workflows

## 10.1 Required Workflows

Create these workflows:

```text
create-pos-order-workflow
sync-offline-order-workflow
resolve-sync-conflict-workflow
create-return-workflow
stock-adjustment-workflow
cash-closing-workflow
register-pos-device-workflow
```

## 10.2 Offline Order Sync Workflow

Workflow steps:

```text
1. Receive event.
2. Validate device.
3. Validate cashier.
4. Check idempotency key.
5. Validate products.
6. Validate price policy.
7. Validate inventory.
8. Create customer/student reference if required.
9. Create order.
10. Deduct inventory.
11. Record payment.
12. Mark sync event as synced.
13. Return server order ID.
```

## 10.3 Idempotency Rule

Every offline order must have:

```text
device_id
local_order_id
idempotency_key
created_at
```

Recommended idempotency key:

```text
device_id + ":" + local_order_id
```

Example:

```text
POS-001:LOCAL-000123
```

If the same event is sent again, the backend should return the existing server order instead of creating a duplicate.

---

# 11. PostgreSQL Database Design

## 11.1 Central Tables

### schools

```sql
id
name
code
address
city
area
route
contact_person
phone
email
status
created_at
updated_at
```

### academic_years

```sql
id
name
start_date
end_date
is_active
created_at
updated_at
```

### school_classes

```sql
id
school_id
class_name
display_order
academic_year_id
status
created_at
updated_at
```

### uniform_kits

```sql
id
name
school_id
class_id
gender
uniform_type
academic_year_id
status
created_at
updated_at
```

### uniform_kit_items

```sql
id
kit_id
product_variant_id
quantity
is_required
sort_order
created_at
updated_at
```

### uniform_rules

```sql
id
school_id
class_id
gender
uniform_type
kit_id
academic_year_id
created_at
updated_at
```

### pos_devices

```sql
id
device_code
device_name
store_location_id
sales_channel_id
assigned_user_id
last_sync_at
status
registered_at
blocked_at
created_at
updated_at
```

### sync_batches

```sql
id
device_id
batch_id
status
started_at
completed_at
total_events
success_count
failed_count
created_at
updated_at
```

### sync_events

```sql
id
batch_id
device_id
event_type
idempotency_key
payload
status
error_code
error_message
server_reference_id
created_at
updated_at
```

### sync_conflicts

```sql
id
event_id
device_id
conflict_type
severity
payload
resolution_status
resolved_by
resolved_at
created_at
updated_at
```

### audit_logs

```sql
id
user_id
device_id
action
entity_type
entity_id
old_value
new_value
ip_address
created_at
```

---

# 12. Electron/React POS App Setup

## 12.1 POS App Folder Structure

```text
pos-app/
  src/
    main/
      main.ts
      printer.ts
      sqlite.ts
      sync-worker.ts

    renderer/
      app.tsx
      pages/
        LoginPage.tsx
        POSPage.tsx
        OrdersPage.tsx
        SyncPage.tsx
        SettingsPage.tsx

      components/
        SchoolSelector.tsx
        ClassSelector.tsx
        ProductSearch.tsx
        BarcodeInput.tsx
        CartPanel.tsx
        PaymentPanel.tsx
        SyncStatusBadge.tsx

    shared/
      types/
      constants/
      validation/

  migrations/
  package.json
```

## 12.2 Core POS App Features

```text
Offline login
School selection
Class selection
Gender selection
Uniform type selection
Kit suggestions
Product search
Barcode scanning
Cart
Discount approval
Payment mode
Receipt printing
Sync queue
Pending orders screen
Conflict status screen
Local inventory screen
```

---

# 13. SQLite Local Database Design

## 13.1 Local SQLite Tables

### local_schools

```sql
id
name
code
area
city
status
updated_at
```

### local_school_classes

```sql
id
school_id
class_name
academic_year_id
status
updated_at
```

### local_products

```sql
id
name
category
school_id
uniform_type
status
updated_at
```

### local_variants

```sql
id
product_id
sku
barcode
size
gender
price
tax_rate
status
updated_at
```

### local_kits

```sql
id
name
school_id
class_id
gender
uniform_type
academic_year_id
status
updated_at
```

### local_kit_items

```sql
id
kit_id
variant_id
quantity
is_required
```

### local_inventory_snapshot

```sql
variant_id
stock_location_id
last_synced_quantity
local_available_quantity
updated_at
```

### local_orders

```sql
id
local_order_number
server_order_id
device_id
cashier_id
school_id
student_name
parent_mobile
subtotal
discount_total
tax_total
grand_total
payment_mode
payment_reference
sync_status
created_offline
created_at
synced_at
idempotency_key
```

### local_order_items

```sql
id
local_order_id
variant_id
sku
product_name
size
quantity
unit_price
discount
tax
line_total
```

### local_sync_queue

```sql
id
event_type
idempotency_key
payload
status
retry_count
last_error
created_at
updated_at
```

### local_users

```sql
id
name
email
role
pin_hash
offline_access_expires_at
status
updated_at
```

### local_audit_logs

```sql
id
user_id
device_id
action
payload
sync_status
created_at
```

---

# 14. Offline-First Logic

## 14.1 Offline Billing Rule

The POS must never depend on internet to complete a local sale.

When cashier clicks `Complete Sale`:

```text
1. Validate cart locally.
2. Validate cashier session.
3. Validate local stock.
4. Generate local order number.
5. Generate idempotency key.
6. Save order to SQLite.
7. Save order items to SQLite.
8. Reduce local available stock.
9. Add order.created event to sync queue.
10. Print receipt.
11. Show sync status as Pending.
```

## 14.2 Local Order Number Format

Example:

```text
POS001-20260518-0001
```

Format:

```text
DEVICE_CODE-DATE-SEQUENCE
```

## 14.3 Sync Queue Event

Example:

```json
{
  "event_type": "order.created",
  "idempotency_key": "POS001:POS001-20260518-0001",
  "payload": {
    "local_order_number": "POS001-20260518-0001",
    "school_id": "school_123",
    "cashier_id": "user_123",
    "items": [],
    "payment": {},
    "created_at": "2026-05-18T10:30:00Z"
  }
}
```

## 14.4 Sync Worker Logic

```text
Every 30–60 seconds when online:
  1. Check connectivity.
  2. Get pending sync events.
  3. Send batch to /pos/sync/push.
  4. Process response.
  5. Mark successful events as synced.
  6. Mark failed events as failed.
  7. Mark conflict events as conflict.
  8. Retry retryable failures.
```

## 14.5 Pull Sync Logic

POS should pull master data:

```text
At login
On app start
After successful push sync
Manually through Sync Now
Scheduled interval when online
```

Pull data includes:

```text
Schools
Classes
Products
Variants
Kits
Prices
Inventory snapshot
Users
Permissions
Settings
Blocked devices
```

---

# 15. Conflict Handling

## 15.1 Conflict Types

### Duplicate Order

Cause:

```text
Same offline order sent multiple times.
```

Resolution:

```text
Use idempotency key.
Return existing server order ID.
Do not create duplicate order.
```

### Stock Conflict

Cause:

```text
POS sold item offline, but central stock is insufficient during sync.
```

Resolution options:

```text
Approve negative stock
Transfer stock
Adjust stock
Cancel central fulfillment
Mark as inventory conflict
```

### Product Inactive

Cause:

```text
Product was deactivated centrally after the POS last synced.
```

Resolution:

```text
Allow sale with warning if receipt already issued.
Require admin review.
Prevent future local sales after next sync.
```

### Price Changed

Cause:

```text
Price changed centrally while POS was offline.
```

Recommended policy:

```text
Honor the price available at last POS sync.
Do not ask customer to pay extra after receipt is printed.
Flag difference in report.
```

### Invalid Cashier

Cause:

```text
Cashier account was disabled centrally while POS was offline.
```

Resolution:

```text
Sync order but flag security conflict.
Block cashier from future offline login after next pull sync.
```

### Invalid Device

Cause:

```text
POS device was blocked centrally.
```

Resolution:

```text
Stop sync.
Lock POS.
Require admin intervention.
```

## 15.2 Conflict Severity

```text
Low: Price changed, but order amount accepted.
Medium: Product inactive after sale.
High: Stock unavailable.
Critical: Blocked device or invalid cashier.
```

---

# 16. Inventory Strategy

## 16.1 Central Inventory

Central inventory lives in Medusa/PostgreSQL.

Use stock locations:

```text
Main Warehouse
Store Counter
Remote Counter
School Camp Counter
```

## 16.2 POS Inventory Snapshot

The POS receives inventory snapshot during pull sync.

Example:

```text
Variant: ABC-B-SHIRT-28
Last synced quantity: 20
Unsynced local sales: 3
Local available: 17
```

## 16.3 Stock Deduction

When bill is created offline:

```text
Deduct local stock immediately.
Add stock movement event.
Sync later.
```

When bill syncs online:

```text
Deduct central stock.
Link local order to server order.
Update POS snapshot in next pull sync.
```

## 16.4 Low Stock Alerts

Generate alerts by:

```text
School
Product
Size
Location
Academic year
```

Example:

```text
ABC School Boys Shirt Size 28 is below 5 units at Remote Counter 1.
```

---

# 17. POS UI Structure

## 17.1 POS Main Screen

```text
Top Bar:
  School selector
  Class selector
  Gender selector
  Sync status
  Cashier name

Left Panel:
  Barcode input
  Product search
  Kit suggestions
  Recent products

Center Panel:
  Product list
  Size selector
  Stock indicator

Right Panel:
  Cart
  Discount
  Payment mode
  Complete sale
  Print receipt
```

## 17.2 Billing Flow

```text
1. Select school.
2. Select class.
3. Select gender.
4. Select uniform type.
5. Choose suggested kit or scan product.
6. Confirm size.
7. Add student/parent details.
8. Select payment mode.
9. Complete sale.
10. Print receipt.
```

## 17.3 Offline Status UI

Show very clear states:

```text
Online — Synced
Offline — 8 orders pending
Syncing — 3 of 8 uploaded
Conflict — 2 orders need review
Device Blocked — Contact admin
```

## 17.4 Product Card

Each product card should show:

```text
Product name
School code
Size
Price
Available local stock
Barcode/SKU
```

## 17.5 Cart UI

Cart should show:

```text
Item name
Size
Quantity
Unit price
Discount
Line total
Remove button
```

## 17.6 Payment UI

MVP payment modes:

```text
Cash
Manual UPI Reference
Credit / Pay Later
```

Do not treat offline UPI or card payments as verified unless payment gateway support is explicitly integrated.

---

# 18. Admin Dashboard Design

## 18.1 Admin Sections

```text
Dashboard
Schools
Academic Years
Products
Product Variants
Uniform Kits
Inventory
Stock Transfers
POS Devices
Orders
Returns
Sync Queue
Conflicts
Reports
Users & Roles
Settings
Audit Logs
```

## 18.2 Owner Dashboard

Show:

```text
Today’s sales
Cash collected
UPI collected
Pending sync orders
Conflict orders
Top schools
Top products
Low stock items
Counter-wise sales
```

## 18.3 School Management Page

Features:

```text
Create school
Edit school
Deactivate school
Map classes
Map academic year
Map price list
View school-wise products
View school-wise sales
```

## 18.4 Uniform Kit Page

Features:

```text
Create kit
Map school
Map class
Map gender
Add required items
Add optional items
Preview POS kit flow
Duplicate kit for another class
```

## 18.5 POS Device Page

Features:

```text
Register device
Assign location
Assign sales channel
View last sync
Block device
Force logout
View pending orders
View device audit logs
```

## 18.6 Conflict Resolution Page

Features:

```text
View conflict type
View local receipt
View central stock
Approve order
Approve negative stock
Reject order
Transfer stock
Mark resolved
Add resolution note
```

---

# 19. Reports Module

## 19.1 Purpose of Reports

Reports should help the owner and team understand:

```text
How much was sold
Which schools are performing best
Which products are moving fast
Which sizes are low in stock
Which orders are pending sync
Which counters are collecting cash
Which staff members are billing
Where conflicts are happening
```

## 19.2 Daily Sales Report

### Purpose

Track daily total sales across all POS counters and locations.

### Filters

```text
Date range
Store / location
POS device
Cashier
Payment mode
School
```

### Columns

```text
Date
Total orders
Gross sales
Discount
Tax
Net sales
Cash collected
UPI collected
Credit sales
Returns
Final total
```

### Example Use Case

Owner wants to know total sales for the day and how much cash should be available at each counter.

---

## 19.3 School-Wise Sales Report

### Purpose

Understand which schools generate the highest sales.

### Filters

```text
Date range
School
Class
Gender
Uniform type
Location
```

### Columns

```text
School name
School code
Total orders
Total items sold
Gross sales
Discount
Net sales
Returns
Average bill value
```

### Example Use Case

Distributor wants to know which school has the highest uniform demand this month.

---

## 19.4 Class-Wise Sales Report

### Purpose

Understand sales by class.

### Filters

```text
School
Class
Academic year
Date range
Gender
Uniform type
```

### Columns

```text
School
Class
Gender
Uniform type
Orders
Items sold
Net sales
Top-selling size
```

### Example Use Case

Distributor wants to stock more items for Class 5 boys because demand is high.

---

## 19.5 Product-Wise Sales Report

### Purpose

Track which products are selling most.

### Filters

```text
Date range
Product
Category
School
Size
Gender
Location
```

### Columns

```text
Product name
SKU
Barcode
School
Category
Size
Quantity sold
Gross sales
Discount
Net sales
Available stock
```

### Example Use Case

Inventory team wants to identify fast-moving products.

---

## 19.6 Size-Wise Sales Report

### Purpose

Understand size demand patterns.

### Filters

```text
School
Product category
Gender
Class
Date range
```

### Columns

```text
School
Product category
Size
Quantity sold
Available stock
Return quantity
Net movement
```

### Example Use Case

The business wants to know which shirt and pant sizes are most demanded.

---

## 19.7 Inventory Report

### Purpose

Track current stock across locations.

### Filters

```text
School
Product
Size
Location
Stock status
Academic year
```

### Columns

```text
Product name
SKU
School
Size
Location
Opening stock
Stock inward
Stock sold
Stock returned
Stock adjusted
Current stock
Low stock threshold
Stock status
```

### Stock Status

```text
In stock
Low stock
Out of stock
Overstock
```

---

## 19.8 Low Stock Report

### Purpose

Show items that need restocking.

### Filters

```text
School
Location
Product category
Size
Threshold
```

### Columns

```text
School
Product
Size
Location
Current stock
Minimum required stock
Shortage quantity
Suggested reorder quantity
```

### Example Use Case

Inventory manager wants a purchase/inward plan before school reopening season.

---

## 19.9 Offline Pending Orders Report

### Purpose

Show orders created offline but not yet synced.

### Filters

```text
POS device
Location
Cashier
Date range
Sync status
```

### Columns

```text
Local order number
Device
Cashier
School
Order amount
Created at
Sync status
Last sync attempt
Error message
```

### Sync Status Values

```text
Pending
Syncing
Failed
Conflict
Synced
```

---

## 19.10 Sync Conflict Report

### Purpose

Track all orders or events that had sync issues.

### Filters

```text
Conflict type
Severity
Device
School
Date range
Resolution status
```

### Columns

```text
Conflict ID
Local order number
Device
Cashier
Conflict type
Severity
Order amount
Created at
Detected at
Resolution status
Resolved by
Resolved at
```

### Conflict Types

```text
Stock conflict
Price conflict
Product inactive
Invalid cashier
Invalid device
Duplicate order
Tax mismatch
```

---

## 19.11 Payment Mode Report

### Purpose

Track collection by payment type.

### Filters

```text
Date range
Cashier
POS device
Location
School
Payment mode
```

### Columns

```text
Payment mode
Number of orders
Gross amount
Refunds
Net collected
Pending verification
```

### Payment Modes

```text
Cash
UPI
Card
Credit / Pay Later
School Bulk Account
```

---

## 19.12 Cashier-Wise Sales Report

### Purpose

Track sales and activity by cashier.

### Filters

```text
Date range
Cashier
Device
Location
Payment mode
```

### Columns

```text
Cashier name
Orders created
Items sold
Gross sales
Discounts given
Returns handled
Cash collected
UPI collected
Offline orders created
Conflicts caused
```

---

## 19.13 POS Device Report

### Purpose

Monitor remote POS devices.

### Filters

```text
Device
Location
Status
Last sync date
```

### Columns

```text
Device code
Location
Assigned user
Status
Last sync at
Pending orders
Failed orders
Conflicts
App version
Last heartbeat
```

### Device Status

```text
Active
Offline
Blocked
Suspended
Retired
```

---

## 19.14 Returns and Exchange Report

### Purpose

Track returned and exchanged items.

### Filters

```text
Date range
School
Product
Cashier
Return reason
Location
```

### Columns

```text
Return ID
Original order number
Product
Size
Quantity
Refund amount
Return reason
Handled by
Approved by
Created at
```

### Return Reasons

```text
Size issue
Defective item
Wrong product
Duplicate purchase
School change
Other
```

---

## 19.15 Discount Report

### Purpose

Track discounts and prevent misuse.

### Filters

```text
Date range
Cashier
Manager
Discount type
School
Location
```

### Columns

```text
Order number
Cashier
Discount amount
Discount percentage
Reason
Approved by
Created at
```

---

## 19.16 Audit Log Report

### Purpose

Track sensitive actions.

### Filters

```text
User
Action
Device
Date range
Entity type
```

### Columns

```text
Timestamp
User
Device
Action
Entity type
Entity ID
Old value
New value
IP address
Sync status
```

### Logged Actions

```text
Login
Logout
Bill created
Bill cancelled
Discount applied
Return created
Stock adjusted
Sync failed
Conflict resolved
Device blocked
```

---

# 20. Security Design

## 20.1 Authentication

Use:

```text
Online login with secure token
Offline PIN login
Session expiry
Refresh token policy
Device binding
```

## 20.2 Device Registration

Each POS device must be registered centrally.

Device lifecycle:

```text
Pending Registration
Active
Suspended
Blocked
Retired
```

## 20.3 Local Database Security

Implement:

```text
SQLite encryption
PIN hash, not plain PIN
No plain-text passwords
Local session expiry
Encrypted backups
```

## 20.4 Sensitive Actions

Require manager PIN for:

```text
High discount
Returns
Exchanges
Stock adjustment
Cancel bill
Reprint receipt
Open cash drawer
Manual price override
Delete synced order
```

## 20.5 Audit Logging

Log:

```text
Login
Logout
Bill created
Bill cancelled
Discount applied
Return created
Stock adjusted
Sync failed
Conflict resolved
Device blocked
```

---

# 21. Color Palette and Theme Guidance

## 21.1 Limitation

The instruction was to use the provided website name only and search that website for color palette and themes.

In the available conversation, the referenced websites are:

```text
docs.medusajs.com
developer.mozilla.org
pouchdb.com
```

These are technical documentation websites. They are not brand/design-resource websites for the school-uniform distributor. They do not provide a usable business-specific POS color palette or theme for this project.

Therefore, this document does not extract or invent a color palette from those sites.

## 21.2 Practical Recommendation

A developer or designer should choose the POS theme based on:

```text
Distributor brand colors
School-uniform industry trust tone
High readability for cashiers
Fast counter usage
Accessibility contrast
Low eye strain
Clear offline/online states
```

Recommended neutral POS palette:

```text
Primary: Deep navy or deep green
Background: Off-white / very light gray
Text: Near-black
Success: Green
Warning: Amber
Error: Red
Info: Blue
Disabled: Gray
```

## 21.3 Theme Rules

Use:

```text
Light theme as default
Dark theme optional
High-contrast mode for billing counter
Large readable numbers
Clear colored sync status
Minimal decorative graphics
```

## 21.4 UI Best Practices

```text
Do not use low-contrast text.
Do not make billing screen visually heavy.
Use strong hierarchy for total amount.
Use clear button states.
Use red only for error/destructive actions.
Use green only for success/synced/paid states.
Show offline status prominently.
```

---

# 22. Receipt Design

## 22.1 Receipt Fields

```text
Distributor name
Address
GSTIN if applicable
Receipt number
Local order number
Server order number if synced
Date and time
Cashier name
School name
Student name
Parent mobile
Items
Size
Quantity
Rate
Discount
Tax
Total
Payment mode
Sync status
Return policy
```

## 22.2 Offline Receipt Rule

If order is offline, receipt should show:

```text
Offline Receipt
Sync Pending
Local Order No: POS001-20260518-0001
```

After sync, reprint can show:

```text
Server Order No: ORD-12345
```

---

# 23. Testing Plan

## 23.1 Backend Tests

Test:

```text
School creation
Kit creation
Product mapping
Barcode lookup
POS device registration
Pull sync
Push sync
Order creation
Inventory deduction
Conflict creation
Conflict resolution
```

## 23.2 POS Offline Tests

Test:

```text
Login online
Login offline
Create bill offline
Print receipt offline
Restart app and verify order remains
Reduce local stock
Sync after internet returns
Prevent duplicate sync
Handle failed sync
```

## 23.3 Inventory Tests

Test:

```text
Sell product online
Sell product offline
Sync stock
Stock conflict
Low stock alert
Stock transfer
Return stock increase
```

## 23.4 Security Tests

Test:

```text
Blocked device cannot sync
Disabled cashier cannot continue after sync
Manager PIN required for discount
Encrypted local backup
Invalid sync payload rejected
Duplicate idempotency key handled
```

## 23.5 Field Tests

Test in real counter environment:

```text
Barcode scanner
Thermal printer
Slow internet
No internet
Power cut recovery
Cashier training
End-of-day report
Remote sync
```

---

# 24. Deployment Plan

## 24.1 Backend Deployment

Deploy:

```text
Medusa backend
PostgreSQL
Redis
Admin dashboard
HTTPS domain
Backup system
Monitoring
```

## 24.2 POS Deployment

Package Electron app for:

```text
Windows first
macOS optional
Linux optional
```

Remote counters usually use Windows desktops/laptops, so Windows should be the first build target.

## 24.3 Device Onboarding

Steps:

```text
Install POS app
Open app
Enter distributor backend URL
Register device
Admin approves device
First login online
Pull master data
Test printer
Test barcode scanner
Start billing
```

## 24.4 Backup Plan

Implement:

```text
Daily SQLite backup
Encrypted pending-order backup
Manual sync export
Admin recovery screen
```

---

# 25. Rollout Plan

## Phase 1: Backend Foundation

Deliver:

```text
Medusa setup
PostgreSQL setup
School module
Uniform kit module
Product mapping
Inventory setup
Admin screens
```

## Phase 2: POS MVP

Deliver:

```text
Electron app
SQLite database
Login
School/class/gender flow
Product search
Barcode scan
Cart
Cash billing
Receipt printing
Offline order save
```

## Phase 3: Sync Engine

Deliver:

```text
Pull sync
Push sync
Sync queue
Idempotency
Conflict detection
Retry logic
Sync dashboard
```

## Phase 4: Inventory and Reports

Deliver:

```text
Inventory snapshot
Stock deduction
Low stock reports
School-wise sales
Cashier-wise sales
Payment summary
Offline order report
```

## Phase 5: Hardening

Deliver:

```text
Security testing
Offline stress testing
Printer testing
Barcode testing
Backup testing
Role testing
Production deployment
```

---

# 26. Final MVP Checklist

## Backend

```text
[ ] Medusa installed
[ ] PostgreSQL connected
[ ] Redis connected
[ ] Admin user created
[ ] School module created
[ ] Uniform kit module created
[ ] POS device module created
[ ] Offline sync module created
[ ] Product variant school mapping completed
[ ] Inventory location setup completed
[ ] Sales channels configured
[ ] POS sync APIs completed
[ ] Conflict dashboard completed
```

## POS

```text
[ ] Electron app created
[ ] React UI created
[ ] SQLite database created
[ ] Offline login working
[ ] School selector working
[ ] Class/gender selector working
[ ] Product search working
[ ] Barcode scan working
[ ] Kit add-to-cart working
[ ] Billing working
[ ] Receipt printing working
[ ] Offline order storage working
[ ] Sync queue working
[ ] Retry logic working
[ ] Local stock deduction working
```

## Reports

```text
[ ] Daily sales report
[ ] School-wise sales report
[ ] Class-wise sales report
[ ] Product-wise sales report
[ ] Size-wise sales report
[ ] Inventory report
[ ] Low stock report
[ ] Offline pending orders report
[ ] Sync conflict report
[ ] Payment mode report
[ ] Cashier-wise sales report
[ ] POS device report
[ ] Return and exchange report
[ ] Discount report
[ ] Audit log report
```

## Security

```text
[ ] Role permissions added
[ ] Manager PIN added
[ ] Device registration added
[ ] Local DB encrypted
[ ] Audit logs added
[ ] Token expiry handled
[ ] Blocked device handled
```

## Testing

```text
[ ] Online billing tested
[ ] Offline billing tested
[ ] Sync tested
[ ] Duplicate sync tested
[ ] Stock conflict tested
[ ] Price conflict tested
[ ] Printer tested
[ ] Barcode scanner tested
[ ] Backup tested
```

---

# 27. Final Recommended Architecture

Use this architecture for the full working system:

```text
Medusa.js v2 Backend
  ├── PostgreSQL
  ├── Redis
  ├── Medusa Admin
  ├── Product Module
  ├── Inventory Module
  ├── Stock Location Module
  ├── Sales Channel Module
  ├── Order Module
  ├── Customer Module
  ├── Custom School Module
  ├── Custom Uniform Kit Module
  ├── Custom POS Device Module
  ├── Custom Offline Sync Module
  └── Custom Reports

Electron/React POS App
  ├── SQLite Local DB
  ├── Offline Login
  ├── School/Class/Gender Billing
  ├── Barcode Scanner
  ├── Receipt Printer
  ├── Local Inventory Snapshot
  ├── Sync Queue
  └── Conflict Status UI
```

---

# 28. Final Recommendation

Build the system as an offline-first POS from day one.

Do not build a normal online POS first and add offline later. Offline billing, local inventory, local order numbers, sync queue, conflict handling, and idempotency must be part of the core architecture from the beginning.

The best MVP path is:

```text
Medusa.js backend + PostgreSQL
Custom school/uniform modules
Electron/React POS app
SQLite local database
Offline order queue
Automatic sync
Conflict dashboard
Basic reports
```

This gives the distributor a practical, scalable, and field-ready system for school-uniform sales in both city stores and remote school counters.

---

# 29. Reference Links

These links are technical references only and should not be used as the visual design/theme source for this POS system.

```text
Medusa Documentation: https://docs.medusajs.com
Medusa POS Recipe: https://docs.medusajs.com/resources/recipes/pos
MDN Service Worker API: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
Electron Documentation: https://www.electronjs.org/docs
SQLite Documentation: https://www.sqlite.org/docs.html
```
