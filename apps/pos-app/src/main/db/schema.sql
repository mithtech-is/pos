-- SQLite schema for the offline POS local database.
-- Migrations are sequential — see migrations/*.sql for the canonical history.
-- This file is the consolidated view applied to a fresh database.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---- Schools / classes ----------------------------------------------------
CREATE TABLE IF NOT EXISTS local_schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  area TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_school_classes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  academic_year_id TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (school_id) REFERENCES local_schools(id)
);

CREATE INDEX IF NOT EXISTS idx_local_school_classes_school
  ON local_school_classes(school_id, status);

CREATE TABLE IF NOT EXISTS local_academic_years (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- ---- Products / variants / kits ------------------------------------------
CREATE TABLE IF NOT EXISTS local_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  school_id TEXT,
  uniform_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_products_school
  ON local_products(school_id, status);

CREATE TABLE IF NOT EXISTS local_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT,
  size TEXT,
  gender TEXT,
  color TEXT,
  fabric TEXT,
  class_from INTEGER,
  class_to INTEGER,
  price REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  academic_year_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES local_products(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_local_variants_sku ON local_variants(sku);
CREATE INDEX IF NOT EXISTS idx_local_variants_barcode ON local_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_local_variants_product ON local_variants(product_id);

CREATE TABLE IF NOT EXISTS local_kits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  school_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  gender TEXT NOT NULL,
  uniform_type TEXT NOT NULL,
  academic_year_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_kits_context
  ON local_kits(school_id, class_id, gender, uniform_type, academic_year_id);

CREATE TABLE IF NOT EXISTS local_kit_items (
  id TEXT PRIMARY KEY,
  kit_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_required INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (kit_id) REFERENCES local_kits(id)
);

CREATE INDEX IF NOT EXISTS idx_local_kit_items_kit ON local_kit_items(kit_id);

-- ---- Local inventory snapshot --------------------------------------------
CREATE TABLE IF NOT EXISTS local_inventory_snapshot (
  variant_id TEXT NOT NULL,
  stock_location_id TEXT NOT NULL,
  last_synced_quantity INTEGER NOT NULL DEFAULT 0,
  unsynced_sales INTEGER NOT NULL DEFAULT 0,
  unsynced_returns INTEGER NOT NULL DEFAULT 0,
  unsynced_adjustments INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (variant_id, stock_location_id)
);

-- ---- Local orders --------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_order_number TEXT NOT NULL UNIQUE,
  server_order_id TEXT,
  device_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  school_id TEXT NOT NULL,
  class_id TEXT,
  student_name TEXT,
  parent_mobile TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL,
  payment_reference TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_offline INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_local_orders_sync ON local_orders(sync_status);
CREATE INDEX IF NOT EXISTS idx_local_orders_date ON local_orders(created_at);

CREATE TABLE IF NOT EXISTS local_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_order_id INTEGER NOT NULL,
  variant_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  size TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  FOREIGN KEY (local_order_id) REFERENCES local_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_local_order_items_order ON local_order_items(local_order_id);

-- ---- Sync queue ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,  -- JSON
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  server_reference_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_sync_queue_status ON local_sync_queue(status);

-- ---- Users / sessions ----------------------------------------------------
CREATE TABLE IF NOT EXISTS local_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  pin_hash TEXT,
  branch_ids TEXT,            -- JSON array of outlet ids this user is scoped to (null/[] = all)
  offline_access_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  updated_at TEXT NOT NULL
);

-- ---- Audit logs ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  device_id TEXT,
  action TEXT NOT NULL,
  payload TEXT,  -- JSON
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_audit_logs_sync ON local_audit_logs(sync_status);

-- ---- Cash closings -------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_cash_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  cash_in_drawer REAL NOT NULL DEFAULT 0,
  cash_collected REAL NOT NULL DEFAULT 0,
  upi_collected REAL NOT NULL DEFAULT 0,
  card_collected REAL NOT NULL DEFAULT 0,
  credit_outstanding REAL NOT NULL DEFAULT 0,
  notes TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- ---- Settings / blocked devices ------------------------------------------
CREATE TABLE IF NOT EXISTS local_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_uniform_rules (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  gender TEXT NOT NULL,
  uniform_type TEXT NOT NULL,
  kit_id TEXT NOT NULL,
  academic_year_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_uniform_rules_context
  ON local_uniform_rules(school_id, class_id, gender, uniform_type, academic_year_id);

-- ---- Daily sequence counter (for local order numbers) --------------------
CREATE TABLE IF NOT EXISTS local_daily_sequence (
  device_code TEXT NOT NULL,
  date_key TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_code, date_key)
);
