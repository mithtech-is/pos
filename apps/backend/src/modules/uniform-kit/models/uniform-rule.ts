import { model } from "@medusajs/framework/utils";

/**
 * Maps (school + class + gender + uniform_type + academic_year) -> kit_id.
 * The POS billing screen looks up suggested kits through this rule.
 */
export const UniformRule = model.define("uniform_rule", {
  id: model.id().primaryKey(),
  school_id: model.text().searchable(),
  class_id: model.text().searchable(),
  gender: model.enum(["boy", "girl", "unisex"]),
  uniform_type: model.enum([
    "regular",
    "summer",
    "winter",
    "sports",
    "house",
  ]),
  kit_id: model.text(),
  academic_year_id: model.text(),
});

export default UniformRule;
