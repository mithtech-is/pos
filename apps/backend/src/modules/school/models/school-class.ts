import { model } from "@medusajs/framework/utils";
import { School } from "./school";
import { AcademicYear } from "./academic-year";

export const SchoolClass = model.define("school_class", {
  id: model.id().primaryKey(),
  class_name: model.text(),
  display_order: model.number().default(0),
  status: model
    .enum(["active", "inactive"])
    .default("active"),
  school: model.belongsTo(() => School, { mappedBy: "classes" }),
  academic_year: model.belongsTo(() => AcademicYear, {
    mappedBy: "school_classes",
  }),
});

export default SchoolClass;
