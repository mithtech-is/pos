import { model } from "@medusajs/framework/utils";
import { UniformKitItem } from "./uniform-kit-item";

export const UniformKit = model.define("uniform_kit", {
  id: model.id().primaryKey(),
  name: model.text(),
  /** FK references kept as plain text so this module stays decoupled from school module. */
  school_id: model.text().searchable(),
  class_id: model.text().searchable(),
  academic_year_id: model.text(),
  gender: model.enum(["boy", "girl", "unisex"]),
  uniform_type: model.enum([
    "regular",
    "summer",
    "winter",
    "sports",
    "house",
  ]),
  status: model.enum(["active", "inactive"]).default("active"),
  items: model.hasMany(() => UniformKitItem, { mappedBy: "kit" }),
});

export default UniformKit;
