import Database from "better-sqlite3";
import { app, IpcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { OrdersRepository } from "./repositories/orders";
import { SyncQueueRepository } from "./repositories/sync-queue";
import { MasterDataRepository } from "./repositories/master-data";
import { InventoryRepository } from "./repositories/inventory";
import { UsersRepository } from "./repositories/users";
import { AuditRepository } from "./repositories/audit";
import { SettingsRepository } from "./repositories/settings";
import { runMigrations } from "./migrations";

let db: Database.Database | null = null;

const TABLES = [
  "local_schools",
  "local_school_classes",
  "local_academic_years",
  "local_products",
  "local_variants",
  "local_kits",
  "local_kit_items",
  "local_inventory_snapshot",
  "local_orders",
  "local_order_items",
  "local_sync_queue",
  "local_users",
  "local_audit_logs",
  "local_cash_closings",
  "local_settings",
  "local_uniform_rules",
  "local_daily_sequence",
] as const;

export function getDatabase(): Database.Database {
  if (db) return db;
  const userData = app?.getPath ? app.getPath("userData") : process.cwd();
  const dbDir = path.join(userData, "pos-data");
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "pos.sqlite");

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);
  return db;
}

export function closeDatabase() {
  db?.close();
  db = null;
}

export const repositories = {
  orders: () => new OrdersRepository(getDatabase()),
  syncQueue: () => new SyncQueueRepository(getDatabase()),
  masterData: () => new MasterDataRepository(getDatabase()),
  inventory: () => new InventoryRepository(getDatabase()),
  users: () => new UsersRepository(getDatabase()),
  audit: () => new AuditRepository(getDatabase()),
  settings: () => new SettingsRepository(getDatabase()),
};

/**
 * IPC bridge — every database operation the renderer needs is dispatched here.
 * Repositories live in the main process; the renderer only sees the typed API
 * exposed by preload.ts.
 */
export function registerDatabaseHandlers(ipc: IpcMain) {
  ipc.handle("db:tables", () => TABLES);
  // Master data ----------------------------------------------------------
  ipc.handle("db:listSchools", () => repositories.masterData().listSchools());
  ipc.handle("db:listClasses", (_e, schoolId: string) =>
    repositories.masterData().listClasses(schoolId),
  );
  ipc.handle("db:searchVariants", (_e, query: string) =>
    repositories.masterData().searchVariants(query),
  );
  ipc.handle(
    "db:listProducts",
    (_e, args: { query?: string; school_id?: string } | undefined) =>
      repositories.masterData().listProducts(args ?? {}),
  );
  ipc.handle("db:listVariantsForProduct", (_e, productId: string) =>
    repositories.masterData().listVariantsForProduct(productId),
  );
  ipc.handle("db:findByBarcode", (_e, barcode: string) =>
    repositories.masterData().findByBarcode(barcode),
  );
  ipc.handle(
    "db:findKitByContext",
    (
      _e,
      payload: {
        school_id: string;
        class_id: string;
        gender: string;
        uniform_type: string;
        academic_year_id?: string;
      },
    ) => repositories.masterData().findKitByContext(payload),
  );
  ipc.handle("db:upsertMasterData", (_e, payload: any) =>
    repositories.masterData().upsertFromPullSync(payload),
  );

  // Orders ---------------------------------------------------------------
  ipc.handle("db:createLocalOrder", (_e, payload: any) =>
    repositories.orders().createOrder(payload),
  );
  ipc.handle("db:listLocalOrders", (_e, filter: any) =>
    repositories.orders().list(filter ?? {}),
  );
  ipc.handle("db:getLocalOrder", (_e, id: number) =>
    repositories.orders().getById(id),
  );
  ipc.handle("db:markOrderSynced", (_e, payload: any) =>
    repositories.orders().markSynced(payload.id, payload.server_order_id),
  );
  ipc.handle("db:markOrderFailed", (_e, payload: any) =>
    repositories
      .orders()
      .markStatus(payload.id, "failed", payload.last_error),
  );

  // Sync queue -----------------------------------------------------------
  ipc.handle("db:queuePush", (_e, payload: any) =>
    repositories.syncQueue().enqueue(payload),
  );
  ipc.handle("db:queuePending", (_e, limit?: number) =>
    repositories.syncQueue().listPending(limit ?? 50),
  );
  ipc.handle("db:queueMarkSyncing", (_e, ids: number[]) =>
    repositories.syncQueue().markSyncing(ids),
  );
  ipc.handle("db:queueMarkSynced", (_e, payload: any) =>
    repositories
      .syncQueue()
      .markSynced(payload.id, payload.server_reference_id),
  );
  ipc.handle("db:queueMarkFailed", (_e, payload: any) =>
    repositories.syncQueue().markFailed(payload.id, payload.error),
  );
  ipc.handle("db:queueStats", () => repositories.syncQueue().stats());

  // Inventory ------------------------------------------------------------
  ipc.handle("db:getLocalAvailable", (_e, variantId: string) =>
    repositories.inventory().getLocalAvailable(variantId),
  );
  ipc.handle("db:applyLocalSale", (_e, payload: any) =>
    repositories.inventory().applySale(payload.variant_id, payload.quantity),
  );
  ipc.handle("db:applyLocalReturn", (_e, payload: any) =>
    repositories.inventory().applyReturn(payload.variant_id, payload.quantity),
  );
  ipc.handle("db:upsertInventorySnapshot", (_e, payload: any) =>
    repositories.inventory().upsertSnapshot(payload),
  );

  // Users ----------------------------------------------------------------
  ipc.handle("db:listUsers", () => repositories.users().list());
  ipc.handle("db:findUserByEmail", (_e, email: string) =>
    repositories.users().findByEmail(email),
  );
  ipc.handle("db:upsertUser", (_e, payload: any) =>
    repositories.users().upsert(payload),
  );
  ipc.handle("db:verifyPin", (_e, payload: any) =>
    repositories.users().verifyPin(payload.user_id, payload.pin),
  );

  // Audit ----------------------------------------------------------------
  ipc.handle("db:audit", (_e, payload: any) =>
    repositories.audit().log(payload),
  );

  // Settings -------------------------------------------------------------
  ipc.handle("db:getSetting", (_e, key: string) =>
    repositories.settings().get(key),
  );
  ipc.handle("db:setSetting", (_e, payload: any) =>
    repositories.settings().set(payload.key, payload.value),
  );

  // Local order sequence -------------------------------------------------
  ipc.handle(
    "db:nextLocalOrderNumber",
    (_e, payload: { device_code: string; now: string }) =>
      repositories
        .orders()
        .allocateLocalOrderNumber(
          payload.device_code,
          new Date(payload.now ?? Date.now()),
        ),
  );
}
