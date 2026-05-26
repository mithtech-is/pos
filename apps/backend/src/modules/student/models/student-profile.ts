import { model } from "@medusajs/framework/utils";

/**
 * Light student/parent record captured at billing time. Not a full customer
 * record: the goal is to remember "who bought what" for returns/exchanges,
 * not to build a CRM. Promotion to a Medusa customer happens lazily.
 */
export const StudentProfile = model.define("student_profile", {
  id: model.id().primaryKey(),
  student_name: model.text().searchable(),
  parent_mobile: model.text().searchable().nullable(),
  parent_email: model.text().nullable(),
  school_id: model.text().searchable(),
  class_id: model.text().nullable(),
  gender: model.enum(["boy", "girl", "unisex"]).nullable(),
  /** Optional link to a Medusa customer once one exists. */
  customer_id: model.text().nullable(),
});

export default StudentProfile;
