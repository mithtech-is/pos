import { MedusaService } from "@medusajs/framework/utils";
import { ReceiptLog } from "./models/receipt-log";

class ReceiptModuleService extends MedusaService({ ReceiptLog }) {
  async logPrint(args: {
    order_reference: string;
    receipt_number: string;
    printed_by?: string;
    device_id?: string;
    body: Record<string, unknown>;
  }) {
    const [existing] = await this.listReceiptLogs({
      receipt_number: args.receipt_number,
    });
    if (existing) {
      return this.updateReceiptLogs({
        selector: { id: existing.id },
        data: { reprint_count: (existing.reprint_count ?? 0) + 1 },
      });
    }
    return this.createReceiptLogs({
      ...args,
      printed_at: new Date(),
      reprint_count: 0,
    });
  }
}

export default ReceiptModuleService;
