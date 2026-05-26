import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260518180636 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "student_profile" ("id" text not null, "student_name" text not null, "parent_mobile" text null, "parent_email" text null, "school_id" text not null, "class_id" text null, "gender" text check ("gender" in ('boy', 'girl', 'unisex')) null, "customer_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "student_profile_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_student_profile_deleted_at" ON "student_profile" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "student_profile" cascade;`);
  }

}
