import { useEffect, useState } from "react";
import { buildIdempotencyKey } from "@pos/shared";
import { useAuthStore } from "../state/auth";

/**
 * Bulk order upload.
 *
 * Paste a CSV, preview the configured bundle for each row, and create queued offline orders.
 *
 * CSV columns (header row required):
 *   customer_name,group,option,type,customer_mobile,top_size,bottom_size
 *
 * Example:
 *   Customer One,Default,standard,regular,9876543210,M,32
 *   Customer Two,Default,alternate,regular,9000000111,S,
 *
 * The parser is lenient about missing columns; unknown sizes fall back to the
 * kit's default variant. Failed rows are flagged for the cashier to fix
 * manually before submit.
 */

type Row = {
  student_name: string;
  class: string;
  gender: "boy" | "girl" | "unisex";
  uniform_type: string;
  customer_mobile?: string;
  shirt_size?: string;
  pant_size?: string;
  status?: "ready" | "warning" | "error";
  message?: string;
  /** Resolved variant ids + line totals after lookup. */
  preview?: Array<{ product_name: string; size: string; price: number; variant_id: string }>;
  preview_total?: number;
};

const SAMPLE = `customer_name,group,option,type,customer_mobile,top_size,bottom_size
Customer One,Default,standard,regular,9876543210,M,32
Customer Two,Default,alternate,regular,9000000111,S,
Customer Three,Default,standard,regular,9000000222,L,34`;

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const pick = (cols: string[], ...keys: string[]) => {
    for (const key of keys) {
      const i = idx(key);
      if (i >= 0 && cols[i]) return cols[i];
    }
    return "";
  };
  const optionToGender = (value: string): Row["gender"] => {
    const v = value.toLowerCase();
    if (v === "alternate" || v === "girl") return "girl";
    if (v === "universal" || v === "unisex") return "unisex";
    return "boy";
  };
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      student_name: pick(cols, "customer_name", "student_name"),
      class: pick(cols, "group", "class"),
      gender: optionToGender(pick(cols, "option", "gender")),
      uniform_type: pick(cols, "type", "uniform_type") || "regular",
      customer_mobile: pick(cols, "customer_mobile", "parent_mobile") || undefined,
      shirt_size: pick(cols, "top_size", "shirt_size") || undefined,
      pant_size: pick(cols, "bottom_size", "pant_size") || undefined,
    };
  });
}

function optionLabel(value: Row["gender"]): string {
  if (value === "girl") return "Alternate";
  if (value === "unisex") return "Universal";
  return "Standard";
}

export default function BulkOrderPage() {
  const user = useAuthStore((s) => s.user);
  const [schools, setSchools] = useState<any[]>([]);
  const [classesBySchool, setClassesBySchool] = useState<Record<string, any[]>>({});
  const [schoolId, setSchoolId] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "credit">("credit");
  const [csv, setCsv] = useState(SAMPLE);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const list = await window.pos.listSchools();
      setSchools(list);
      const byId: Record<string, any[]> = {};
      for (const s of list) byId[s.id] = await window.pos.listClasses(s.id);
      setClassesBySchool(byId);
    })().catch(() => {});
  }, []);

  /**
   * Resolve a row against the local catalog: find the kit for
   * (channel, group, profile, item type) and pick the variant matching
   * shirt_size / pant_size if provided.
   */
  async function resolveRow(row: Row): Promise<Row> {
    if (!schoolId) {
      return { ...row, status: "error", message: "Pick an outlet first" };
    }
    const classes = classesBySchool[schoolId] ?? [];
    const cls = classes.find((c) => c.class_name === row.class);
    if (!cls) {
      return { ...row, status: "error", message: `Group "${row.class}" not found` };
    }
    const kitInfo: any = await window.pos.findKitByContext({
      school_id: schoolId,
      class_id: cls.id,
      gender: row.gender,
      uniform_type: row.uniform_type,
    });
    if (!kitInfo) {
      return {
        ...row,
        status: "error",
        message: `No bundle configured for group ${row.class} ${optionLabel(row.gender)} ${row.uniform_type}`,
      };
    }
    const preview: Row["preview"] = [];
    let total = 0;
    let warning: string | undefined;
    for (const item of kitInfo.items) {
      // If the row supplied a size, swap to that size's variant within the same product.
      const wantedSize =
        (item.product_name as string)?.toLowerCase().includes("shirt")
          ? row.shirt_size
          : (item.product_name as string)?.toLowerCase().includes("pant")
            ? row.pant_size
            : undefined;
      let resolved = item;
      if (wantedSize && wantedSize !== item.size) {
        const all = await window.pos.searchVariants(item.product_name);
        const match = all.find(
          (v: any) => v.size === wantedSize && v.product_name === item.product_name,
        );
        if (match) {
          resolved = { ...item, variant_id: match.id, size: match.size, price: match.price };
        } else {
          warning = `Wanted ${item.product_name} size ${wantedSize}, using default size ${item.size}`;
        }
      }
      preview.push({
        product_name: resolved.product_name,
        size: resolved.size,
        price: resolved.price,
        variant_id: resolved.variant_id,
      });
      total += Number(resolved.price ?? 0) * Number(resolved.quantity ?? 1);
    }
    return {
      ...row,
      status: warning ? "warning" : "ready",
      message: warning,
      preview,
      preview_total: total,
    };
  }

  async function previewAll() {
    setBusy(true);
    setMessage(null);
    try {
      const parsed = parseCsv(csv);
      const resolved: Row[] = [];
      for (const r of parsed) resolved.push(await resolveRow(r));
      setRows(resolved);
    } finally {
      setBusy(false);
    }
  }

  async function submitAll() {
    if (!user || rows.length === 0) {
      setMessage("Preview the CSV first");
      return;
    }
    const ready = rows.filter((r) => r.status !== "error");
    if (ready.length === 0) {
      setMessage("No rows ready to bill");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const deviceCode = ((await window.pos.getSetting("device_code")) as string) ?? "POS001";
      let created = 0;
      let failed = 0;
      for (const row of ready) {
        try {
          const items = (row.preview ?? []).map((p) => ({
            variant_id: p.variant_id,
            sku: "",
            product_name: p.product_name,
            size: p.size,
            quantity: 1,
            unit_price: p.price,
            discount: 0,
            tax: 0,
            line_total: p.price,
          }));
          const subtotal = items.reduce((s, i) => s + i.line_total, 0);
          const localOrderNumber = await window.pos.nextLocalOrderNumber({
            device_code: deviceCode,
            now: new Date().toISOString(),
          });
          const idempotencyKey = buildIdempotencyKey(deviceCode, localOrderNumber);
          const createdAt = new Date().toISOString();
          const classes = classesBySchool[schoolId] ?? [];
          const cls = classes.find((c) => c.class_name === row.class);

          await window.pos.createLocalOrder({
            local_order_number: localOrderNumber,
            idempotency_key: idempotencyKey,
            device_id: deviceCode,
            cashier_id: user.id,
            school_id: schoolId,
            class_id: cls?.id ?? null,
            student_name: row.student_name,
            parent_mobile: row.customer_mobile ?? null,
            subtotal,
            discount_total: 0,
            tax_total: 0,
            grand_total: subtotal,
            payment_mode: paymentMode,
            payment_reference: null,
            items,
            created_at: createdAt,
          });
          for (const it of items) {
            await window.pos.applyLocalSale({
              variant_id: it.variant_id,
              quantity: it.quantity,
            });
          }
          await window.pos.queuePush({
            event_type: "order.created",
            idempotency_key: idempotencyKey,
            payload: {
              device_id: deviceCode,
              cashier_id: user.id,
              school_id: schoolId,
              class_id: cls?.id ?? null,
              student_name: row.student_name,
              parent_mobile: row.customer_mobile ?? null,
              subtotal,
              discount_total: 0,
              tax_total: 0,
              grand_total: subtotal,
              payment_mode: paymentMode,
              payment_reference: null,
              created_offline: true,
              created_at: createdAt,
              local_order_number: localOrderNumber,
              idempotency_key: idempotencyKey,
              items,
              bulk_batch: true,
            },
          });
          created++;
        } catch (err) {
          failed++;
          console.error("[bulk] row failed:", row.student_name, err);
        }
      }
      setMessage(`Created ${created} orders, ${failed} failed`);
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  const summary = {
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    warnings: rows.filter((r) => r.status === "warning").length,
    errors: rows.filter((r) => r.status === "error").length,
    grand_total: rows.reduce((s, r) => s + (r.preview_total ?? 0), 0),
  };

  return (
    <div style={{ padding: 12 }}>
      <div className="panel" style={{ marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>Bulk order upload</h2>
        <div className="muted" style={{ marginBottom: 8 }}>
          Paste a CSV with headers: <code>customer_name, group, option, type, customer_mobile, top_size, bottom_size</code>.
          Each row turns into one queued offline order with the configured kit.
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label>Outlet</label>
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="">Select…</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Payment</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)}>
              <option value="credit">Credit / invoice</option>
              <option value="cash">Cash on delivery</option>
            </select>
          </div>
          <button className="primary" onClick={previewAll} disabled={busy || !schoolId}>
            {busy ? "Resolving…" : "Preview"}
          </button>
        </div>
        <textarea
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          style={{ width: "100%", marginTop: 12, fontFamily: "monospace" }}
        />
      </div>

      {rows.length > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{summary.total} rows</strong>{" "}
              <span className="muted">
                · {summary.ready} ready · {summary.warnings} warnings · {summary.errors} errors
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="muted">Grand total</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>
                ₹{summary.grand_total.toFixed(2)}
              </div>
            </div>
            <button
              className="primary"
              onClick={submitAll}
              disabled={busy || summary.ready === 0}
            >
              {busy ? "Creating…" : `Create ${summary.ready} orders`}
            </button>
          </div>
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Group</th>
                <th>Option</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.student_name}
                    <div className="muted" style={{ fontSize: 11 }}>{r.customer_mobile ?? ""}</div>
                  </td>
                  <td>{r.class}</td>
                  <td>{optionLabel(r.gender)}</td>
                  <td>
                    {r.preview?.map((p, j) => (
                      <div key={j} style={{ fontSize: 12 }}>
                        {p.product_name} size {p.size} — ₹{p.price}
                      </div>
                    )) ?? <span className="muted">—</span>}
                  </td>
                  <td>
                    {r.preview_total ? `₹${r.preview_total.toFixed(2)}` : "—"}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        r.status === "error"
                          ? "error"
                          : r.status === "warning"
                            ? "offline"
                            : "online"
                      }`}
                    >
                      {r.status ?? "—"}
                    </span>
                    {r.message && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {r.message}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {message && (
        <div className="panel" style={{ marginTop: 12, color: "var(--accent-2)" }}>
          {message}
        </div>
      )}
    </div>
  );
}

