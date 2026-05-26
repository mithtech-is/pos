import { model } from "@medusajs/framework/utils";

export const ReceiptLog = model.define("receipt_log", {
  id: model.id().primaryKey(),
  /** Either the local order number (offline) or server order id (after sync). */
  order_reference: model.text().searchable(),
  receipt_number: model.text().unique(),
  printed_at: model.dateTime(),
  printed_by: model.text().nullable(),
  device_id: model.text().nullable(),
  reprint_count: model.number().default(0),
  /** Serialized receipt body so reprints don't need to recompute pricing. */
  body: model.json(),
});

export default ReceiptLog;
