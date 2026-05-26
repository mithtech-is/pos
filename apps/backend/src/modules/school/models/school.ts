import { model } from "@medusajs/framework/utils";

/**
 * A school is one of the customers the distributor sells uniforms for.
 * Sales channels and stock locations are configured separately in Medusa core;
 * this model adds the school-uniform domain layer on top.
 */
export const School = model.define("school", {
  id: model.id().primaryKey(),
  name: model.text().searchable(),
  code: model.text().unique(),
  address: model.text().nullable(),
  city: model.text().nullable(),
  area: model.text().nullable(),
  route: model.text().nullable(),
  contact_person: model.text().nullable(),
  phone: model.text().nullable(),
  email: model.text().nullable(),
  status: model
    .enum(["active", "inactive"])
    .default("active"),
});

export default School;
