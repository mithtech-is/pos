import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260518180632 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "uniform_kit" ("id" text not null, "name" text not null, "school_id" text not null, "class_id" text not null, "academic_year_id" text not null, "gender" text check ("gender" in ('boy', 'girl', 'unisex')) not null, "uniform_type" text check ("uniform_type" in ('regular', 'summer', 'winter', 'sports', 'house')) not null, "status" text check ("status" in ('active', 'inactive')) not null default 'active', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "uniform_kit_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_uniform_kit_deleted_at" ON "uniform_kit" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "uniform_kit_item" ("id" text not null, "product_variant_id" text not null, "quantity" integer not null default 1, "is_required" boolean not null default true, "sort_order" integer not null default 0, "kit_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "uniform_kit_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_uniform_kit_item_kit_id" ON "uniform_kit_item" ("kit_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_uniform_kit_item_deleted_at" ON "uniform_kit_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "uniform_rule" ("id" text not null, "school_id" text not null, "class_id" text not null, "gender" text check ("gender" in ('boy', 'girl', 'unisex')) not null, "uniform_type" text check ("uniform_type" in ('regular', 'summer', 'winter', 'sports', 'house')) not null, "kit_id" text not null, "academic_year_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "uniform_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_uniform_rule_deleted_at" ON "uniform_rule" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "uniform_kit_item" add constraint "uniform_kit_item_kit_id_foreign" foreign key ("kit_id") references "uniform_kit" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "uniform_kit_item" drop constraint if exists "uniform_kit_item_kit_id_foreign";`);

    this.addSql(`drop table if exists "uniform_kit" cascade;`);

    this.addSql(`drop table if exists "uniform_kit_item" cascade;`);

    this.addSql(`drop table if exists "uniform_rule" cascade;`);
  }

}
