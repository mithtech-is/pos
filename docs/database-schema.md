# Database Schema

Two databases:

1. **PostgreSQL** — central source of truth, owned by Medusa.
2. **SQLite** (local to each POS device) — offline-first cache + outbound queue.

## PostgreSQL (custom tables)

Built-in Medusa tables (`product`, `product_variant`, `inventory_item`,
`inventory_level`, `stock_location`, `sales_channel`, `order`, `customer`,
`payment`, etc.) are managed by Medusa core and are not re-documented here.

The custom modules add the following:

### `school`
```
id, name, code (unique), address, city, area, route,
contact_person, phone, email, status, created_at, updated_at
```

### `school_class`
```
id, school_id, class_name, display_order,
academic_year_id, status, created_at, updated_at
```

### `academic_year`
```
id, name, start_date, end_date, is_active, created_at, updated_at
```

### `uniform_kit`
```
id, name, school_id, class_id, gender,
uniform_type, academic_year_id, status, created_at, updated_at
```

### `uniform_kit_item`
```
id, kit_id, product_variant_id, quantity,
is_required, sort_order, created_at, updated_at
```

### `uniform_rule`
```
id, school_id, class_id, gender, uniform_type, kit_id,
academic_year_id, created_at, updated_at
```

### `pos_device`
```
id, device_code (unique), device_name, store_location_id,
sales_channel_id, assigned_user_id, last_sync_at,
status, registered_at, blocked_at, registration_token,
created_at, updated_at
```

### `pos_session`
```
id, device_id, user_id, login_at, logout_at,
last_online_at, session_status, created_at, updated_at
```

### `sync_batch`
```
id, device_id, batch_id (unique), status,
started_at, completed_at,
total_events, success_count, failed_count, conflict_count,
created_at, updated_at
```

### `sync_event`
```
id, batch_id, device_id, event_type,
idempotency_key (unique), payload (jsonb),
status, error_code, error_message,
server_reference_id, created_at, updated_at
```

### `sync_conflict`
```
id, event_id, device_id, conflict_type, severity,
payload (jsonb), resolution_status,
resolution_note, resolved_by, resolved_at,
created_at, updated_at
```

### `audit_log`
```
id, user_id, device_id, action, entity_type, entity_id,
old_value (jsonb), new_value (jsonb), ip_address,
source ('online'|'offline'), created_at
```

### `student_profile`
```
id, student_name, parent_mobile, parent_email,
school_id, class_id, gender, customer_id (optional Medusa customer)
```

### `receipt_log`
```
id, order_reference, receipt_number (unique), printed_at,
printed_by, device_id, reprint_count, body (jsonb)
```

## SQLite (local POS)

See `apps/pos-app/src/main/db/schema.sql` for the canonical schema. Summary:

| Table | Purpose |
| --- | --- |
| `local_schools` / `local_school_classes` / `local_academic_years` | Pulled master data |
| `local_products` / `local_variants` | Pulled product catalog |
| `local_kits` / `local_kit_items` / `local_uniform_rules` | Kit suggestions |
| `local_inventory_snapshot` | last_synced_quantity + unsynced deltas per variant |
| `local_orders` / `local_order_items` | Offline-originated orders |
| `local_sync_queue` | Outbound events with idempotency keys |
| `local_users` | Local user cache with hashed offline PINs |
| `local_audit_logs` | Offline audit events awaiting push |
| `local_cash_closings` | End-of-day closings |
| `local_settings` | Backend URL, device code, distributor name, flags |
| `local_daily_sequence` | Per-device-per-day local order number sequence |

## Local order number format

```
{DEVICE_CODE}-{YYYYMMDD}-{SEQUENCE}     e.g. POS001-20260518-0001
```

`SEQUENCE` resets daily and is allocated atomically via
`OrdersRepository.allocateLocalOrderNumber()`.

## Idempotency key format

```
{DEVICE_ID}:{LOCAL_ORDER_NUMBER}        e.g. POS001:POS001-20260518-0001
```

Same key is stored as `local_orders.idempotency_key` and
`local_sync_queue.idempotency_key` so retries are stable across crashes.
