import { IpcMain, BrowserWindow } from "electron";
import type { ReceiptData } from "@pos/shared";

/**
 * Receipt printing.
 *
 * For MVP this delegates to Electron's `webContents.print()` against a hidden
 * window that renders the HTML receipt. Real thermal-printer ESC/POS support
 * requires `node-thermal-printer` or `escpos` and a serial/USB binding —
 * tracked under Phase 12 in the build plan.
 *
 * TODO(Phase 12): integrate node-thermal-printer for USB thermal printers
 * (the most common counter setup) and add a "Test print" button in Settings.
 */

let lastReceipt: ReceiptData | null = null;

function buildReceiptHtml(r: ReceiptData): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${r.receipt_number}</title>
<style>
  body { font-family: monospace; font-size: 12px; width: 280px; }
  h2 { text-align: center; margin: 4px 0; }
  table { width: 100%; }
  td.right { text-align: right; }
  hr { border: 0; border-top: 1px dashed #444; margin: 6px 0; }
  .small { font-size: 10px; color: #444; }
</style></head>
<body>
  <h2>${r.distributor_name}</h2>
  ${r.distributor_address ? `<div style="text-align:center">${r.distributor_address}</div>` : ""}
  ${r.gstin ? `<div class="small" style="text-align:center">GSTIN: ${r.gstin}</div>` : ""}
  <hr/>
  <div>Receipt: ${r.receipt_number}</div>
  <div>Local Order No: ${r.local_order_number}</div>
  ${r.server_order_number ? `<div>Server Order No: ${r.server_order_number}</div>` : ""}
  <div>Date: ${r.date_time}</div>
  <div>Cashier: ${r.cashier_name}</div>
  <div>School: ${r.school_name}</div>
  ${r.student_name ? `<div>Student: ${r.student_name}</div>` : ""}
  ${r.parent_mobile ? `<div>Parent: ${r.parent_mobile}</div>` : ""}
  <hr/>
  <table>
    <thead><tr><th align="left">Item</th><th>Qty</th><th class="right">Total</th></tr></thead>
    <tbody>
      ${r.items
        .map(
          (i) =>
            `<tr><td>${i.product_name} ${i.size ?? ""}</td><td>${i.quantity}</td><td class="right">${i.line_total.toFixed(2)}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <hr/>
  <table>
    <tr><td>Subtotal</td><td class="right">${r.subtotal.toFixed(2)}</td></tr>
    <tr><td>Discount</td><td class="right">${r.discount_total.toFixed(2)}</td></tr>
    <tr><td>Tax</td><td class="right">${r.tax_total.toFixed(2)}</td></tr>
    <tr><td><b>Total</b></td><td class="right"><b>${r.grand_total.toFixed(2)}</b></td></tr>
  </table>
  <hr/>
  <div>Payment: ${r.payment_mode}${r.payment_reference ? ` (${r.payment_reference})` : ""}</div>
  <div>Status: ${r.sync_status === "synced" ? "Synced" : "Offline Receipt — Sync Pending"}</div>
  ${r.return_policy ? `<div class="small">${r.return_policy}</div>` : ""}
</body></html>`;
}

export function registerPrinterHandlers(ipc: IpcMain) {
  ipc.handle("printer:render", (_e, receipt: ReceiptData) => {
    lastReceipt = receipt;
    return { html: buildReceiptHtml(receipt) };
  });

  ipc.handle("printer:print", async (_e, receipt: ReceiptData) => {
    // Print silently to the system default printer. For thermal printers,
    // the OS driver maps this to the receipt printer; for desktop testing it
    // hits the default Windows printer.
    const html = buildReceiptHtml(receipt);
    const win = new BrowserWindow({
      show: false,
      width: 320,
      height: 800,
      webPreferences: { sandbox: true },
    });
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      win.webContents.print(
        { silent: false, printBackground: true },
        (success, failureReason) => {
          win.close();
          if (success) resolve({ ok: true });
          else resolve({ ok: false, error: failureReason });
        },
      );
    });
  });

  ipc.handle("printer:last", () => lastReceipt);
}
