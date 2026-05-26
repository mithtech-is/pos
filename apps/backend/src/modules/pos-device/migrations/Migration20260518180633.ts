import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260518180633 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pos_device" drop constraint if exists "pos_device_device_code_unique";`);
    this.addSql(`create table if not exists "pos_device" ("id" text not null, "device_code" text not null, "device_name" text not null, "store_location_id" text null, "sales_channel_id" text null, "assigned_user_id" text null, "last_sync_at" timestamptz null, "registered_at" timestamptz null, "blocked_at" timestamptz null, "status" text check ("status" in ('pending_registration', 'active', 'suspended', 'blocked', 'retired')) not null default 'pending_registration', "registration_token" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pos_device_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pos_device_device_code_unique" ON "pos_device" ("device_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pos_device_deleted_at" ON "pos_device" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "pos_session" ("id" text not null, "user_id" text not null, "login_at" timestamptz not null, "logout_at" timestamptz null, "last_online_at" timestamptz null, "session_status" text check ("session_status" in ('open', 'closed')) not null default 'open', "device_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pos_session_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pos_session_device_id" ON "pos_session" ("device_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pos_session_deleted_at" ON "pos_session" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "pos_session" add constraint "pos_session_device_id_foreign" foreign key ("device_id") references "pos_device" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "pos_session" drop constraint if exists "pos_session_device_id_foreign";`);

    this.addSql(`drop table if exists "pos_device" cascade;`);

    this.addSql(`drop table if exists "pos_session" cascade;`);
  }

}
