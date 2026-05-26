import { model } from "@medusajs/framework/utils";

export const AcademicYear = model.define("academic_year", {
  id: model.id().primaryKey(),
  name: model.text(),
  start_date: model.dateTime(),
  end_date: model.dateTime(),
  is_active: model.boolean().default(false),
});

export default AcademicYear;
