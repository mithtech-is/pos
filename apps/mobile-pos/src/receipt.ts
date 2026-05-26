import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { ReceiptData } from "@pos/shared";

/**
 * Mobile receipt rendering.
 *
 * Mirrors the Electron `printer.ts` HTML template so receipts look identical
 * regardless of which client printed them. On mobile we drive the system
 * print dialog via expo-print; from the dialog the cashier can pick a Wi-Fi /
 * Bluetooth thermal printer, an installed PDF target, or share/save the PDF.
 */
export function buildReceiptHtml(r: ReceiptData): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(r.receipt_number)}</title>
<style>
  @page { margin: 6mm; }
  body { font-family: -apple-system, "Helvetica Neue", monospace; font-size: 12px; width: 280px; }
  h2 { text-align: center; margin: 4px 0; font-size: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; padding: 2px 0; border-bottom: 1px solid #888; }
  td { padding: 2px 0; vertical-align: top; }
  td.right { text-align: right; }
  hr { border: 0; border-top: 1px dashed #444; margin: 6px 0; }
  .small { font-size: 10px; color: #444; }
  .center { text-align: center; }
  .row { display:flex; justify-content: space-between; }
</style></head>
<body>
  <h2>${escape(r.distributor_name)}</h2>
  ${r.distributor_address ? `<div class="center">${escape(r.distributor_address)}</div>` : ""}
  ${r.gstin ? `<div class="small center">GSTIN: ${escape(r.gstin)}</div>` : ""}
  <hr/>
  <div>Receipt: <b>${escape(r.receipt_number)}</b></div>
  <div>Local Order No: ${escape(r.local_order_number)}</div>
  ${r.server_order_number ? `<div>Server Order No: ${escape(r.server_order_number)}</div>` : ""}
  <div>Date: ${escape(r.date_time)}</div>
  <div>Cashier: ${escape(r.cashier_name)}</div>
  <div>School: ${escape(r.school_name)}</div>
  ${r.student_name ? `<div>Student: ${escape(r.student_name)}</div>` : ""}
  ${r.parent_mobile ? `<div>Parent: ${escape(r.parent_mobile)}</div>` : ""}
  <hr/>
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th class="right">Total</th></tr></thead>
    <tbody>
      ${r.items
        .map(
          (i) =>
            `<tr><td>${escape(i.product_name)} ${escape(i.size ?? "")}</td><td>${i.quantity}</td><td class="right">${i.line_total.toFixed(2)}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <hr/>
  <table>
    <tr><td>Subtotal</td><td class="right">${r.subtotal.toFixed(2)}</td></tr>
    <tr><td>Discount</td><td class="right">${r.discount_total.toFixed(2)}</td></tr>
    <tr><td>Tax</td><td class="right">${r.tax_total.toFixed(2)}</td></tr>
    <tr><td><b>Total</b></td><td class="right"><b>₹ ${r.grand_total.toFixed(2)}</b></td></tr>
  </table>
  <hr/>
  <div>Payment: ${escape(r.payment_mode)}${r.payment_reference ? ` (${escape(r.payment_reference)})` : ""}</div>
  <div>Status: ${r.sync_status === "synced" ? "Synced" : "Offline Receipt — Sync Pending"}</div>
  ${r.return_policy ? `<div class="small">${escape(r.return_policy)}</div>` : '<div class="small">Returns accepted within 7 days with this receipt.</div>'}
  <div class="center small" style="margin-top:8px">Thank you! 🙏</div>
</body></html>`;
}

function escape(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Show the system print dialog with the rendered receipt. On Android the user
 * can pick any installed print service (incl. Wi-Fi/Bluetooth thermal printers
 * if the manufacturer provides a print service plug-in) or save as PDF.
 */
export async function printReceipt(receipt: ReceiptData): Promise<void> {
  const html = buildReceiptHtml(receipt);
  await Print.printAsync({ html });
}

/**
 * Render to a PDF file and pop the share sheet — handy when there's no
 * printer set up, so the cashier can WhatsApp / email the receipt to the
 * parent in seconds.
 */
export async function shareReceiptPdf(receipt: ReceiptData): Promise<void> {
  const html = buildReceiptHtml(receipt);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Receipt ${receipt.receipt_number}`,
      UTI: "com.adobe.pdf",
    });
  }
}
