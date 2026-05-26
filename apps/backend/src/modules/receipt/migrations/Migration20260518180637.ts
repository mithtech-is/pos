import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260518180637 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "receipt_log" drop constraint if exists "receipt_log_receipt_number_unique";`);
    this.addSql(`create table if not exists "receipt_log" ("id" text not null, "order_reference" text not null, "receipt_number" text not null, "printed_at" timestamptz not null, "printed_by" text null, "device_id" text null, "reprint_count" integer not null default 0, "body" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "receipt_log_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_receipt_log_receipt_number_unique" ON "receipt_log" ("receipt_number") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_receipt_log_deleted_at" ON "receipt_log" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "receipt_log" cascade;`);
  }

}
