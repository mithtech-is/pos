import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260518180631 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "school" drop constraint if exists "school_code_unique";`);
    this.addSql(`create table if not exists "academic_year" ("id" text not null, "name" text not null, "start_date" timestamptz not null, "end_date" timestamptz not null, "is_active" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "academic_year_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_academic_year_deleted_at" ON "academic_year" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "school" ("id" text not null, "name" text not null, "code" text not null, "address" text null, "city" text null, "area" text null, "route" text null, "contact_person" text null, "phone" text null, "email" text null, "status" text check ("status" in ('active', 'inactive')) not null default 'active', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "school_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_school_code_unique" ON "school" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_school_deleted_at" ON "school" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "school_class" ("id" text not null, "class_name" text not null, "display_order" integer not null default 0, "status" text check ("status" in ('active', 'inactive')) not null default 'active', "school_id" text not null, "academic_year_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "school_class_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_school_class_school_id" ON "school_class" ("school_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_school_class_academic_year_id" ON "school_class" ("academic_year_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_school_class_deleted_at" ON "school_class" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "school_class" add constraint "school_class_school_id_foreign" foreign key ("school_id") references "school" ("id") on update cascade;`);
    this.addSql(`alter table if exists "school_class" add constraint "school_class_academic_year_id_foreign" foreign key ("academic_year_id") references "academic_year" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "school_class" drop constraint if exists "school_class_academic_year_id_foreign";`);

    this.addSql(`alter table if exists "school_class" drop constraint if exists "school_class_school_id_foreign";`);

    this.addSql(`drop table if exists "academic_year" cascade;`);

    this.addSql(`drop table if exists "school" cascade;`);

    this.addSql(`drop table if exists "school_class" cascade;`);
  }

}
