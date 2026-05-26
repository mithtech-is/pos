import { model } from "@medusajs/framework/utils";
import { UniformKit } from "./uniform-kit";

export const UniformKitItem = model.define("uniform_kit_item", {
  id: model.id().primaryKey(),
  /** Medusa product variant id this line references. */
  product_variant_id: model.text(),
  quantity: model.number().default(1),
  is_required: model.boolean().default(true),
  sort_order: model.number().default(0),
  kit: model.belongsTo(() => UniformKit, { mappedBy: "items" }),
});

export default UniformKitItem;
