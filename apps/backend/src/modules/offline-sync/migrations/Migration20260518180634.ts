import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260518180634 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "sync_event" drop constraint if exists "sync_event_idempotency_key_unique";`);
    this.addSql(`alter table if exists "sync_batch" drop constraint if exists "sync_batch_batch_id_unique";`);
    this.addSql(`create table if not exists "sync_batch" ("id" text not null, "device_id" text not null, "batch_id" text not null, "status" text check ("status" in ('received', 'processing', 'completed', 'partial', 'failed')) not null default 'received', "started_at" timestamptz null, "completed_at" timestamptz null, "total_events" integer not null default 0, "success_count" integer not null default 0, "failed_count" integer not null default 0, "conflict_count" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "sync_batch_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sync_batch_batch_id_unique" ON "sync_batch" ("batch_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sync_batch_deleted_at" ON "sync_batch" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "sync_conflict" ("id" text not null, "event_id" text not null, "device_id" text not null, "conflict_type" text check ("conflict_type" in ('duplicate_order', 'stock_conflict', 'product_inactive', 'price_changed', 'tax_mismatch', 'invalid_cashier', 'invalid_device', 'invalid_school_mapping')) not null, "severity" text check ("severity" in ('low', 'medium', 'high', 'critical')) not null default 'medium', "payload" jsonb not null, "resolution_status" text check ("resolution_status" in ('open', 'in_progress', 'resolved', 'rejected')) not null default 'open', "resolution_note" text null, "resolved_by" text null, "resolved_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "sync_conflict_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sync_conflict_deleted_at" ON "sync_conflict" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "sync_event" ("id" text not null, "device_id" text not null, "event_type" text not null, "idempotency_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('pending', 'syncing', 'synced', 'failed', 'conflict')) not null default 'pending', "error_code" text null, "error_message" text null, "server_reference_id" text null, "batch_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "sync_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sync_event_idempotency_key_unique" ON "sync_event" ("idempotency_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sync_event_batch_id" ON "sync_event" ("batch_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sync_event_deleted_at" ON "sync_event" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "sync_event" add constraint "sync_event_batch_id_foreign" foreign key ("batch_id") references "sync_batch" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "sync_event" drop constraint if exists "sync_event_batch_id_foreign";`);

    this.addSql(`drop table if exists "sync_batch" cascade;`);

    this.addSql(`drop table if exists "sync_conflict" cascade;`);

    this.addSql(`drop table if exists "sync_event" cascade;`);
  }

}
