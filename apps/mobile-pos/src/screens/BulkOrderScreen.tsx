import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { buildIdempotencyKey } from "@pos/shared";
import {
  Badge,
  Button,
  Input,
  Muted,
  Panel,
  Row,
  Title,
  inr,
  styles,
} from "../components/ui";
import { colors } from "../theme";
import { useAuthStore } from "../state/auth";
import {
  inventory,
  masterData,
  orders as ordersRepo,
  settings,
  syncQueue,
} from "../db/repositories";

const SAMPLE = `student_name,class,gender,uniform_type,parent_mobile,shirt_size,pant_size
Aarav Shah,1,boy,regular,9876543210,28,28
Priya Iyer,2,girl,regular,9000000111,24,
Rohit Kumar,1,boy,regular,9000000222,30,30`;

type Row = {
  student_name: string;
  class: string;
  gender: "boy" | "girl" | "unisex";
  uniform_type: string;
  parent_mobile?: string;
  shirt_size?: string;
  pant_size?: string;
  status?: "ready" | "warning" | "error";
  message?: string;
  preview?: Array<{ product_name: string; size: string; price: number; variant_id: string; quantity: number }>;
  preview_total?: number;
};

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k: string) => headers.indexOf(k);
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      student_name: cols[idx("student_name")] ?? "",
      class: cols[idx("class")] ?? "",
      gender: (cols[idx("gender")] ?? "boy") as Row["gender"],
      uniform_type: cols[idx("uniform_type")] ?? "regular",
      parent_mobile: cols[idx("parent_mobile")] || undefined,
      shirt_size: cols[idx("shirt_size")] || undefined,
      pant_size: cols[idx("pant_size")] || undefined,
    };
  });
}

export default function BulkOrderScreen() {
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
      const list = await masterData.listSchools();
      setSchools(list);
      const cs: Record<string, any[]> = {};
      for (const s of list) cs[s.id] = await masterData.listClasses(s.id);
      setClassesBySchool(cs);
    })().catch(() => {});
  }, []);

  async function resolveRow(row: Row): Promise<Row> {
    if (!schoolId) return { ...row, status: "error", message: "Pick a school first" };
    const classes = classesBySchool[schoolId] ?? [];
    const cls = classes.find((c) => c.class_name === row.class);
    if (!cls) return { ...row, status: "error", message: `Class ${row.class} not found` };
    const kitInfo = await masterData.findKitByContext({
      school_id: schoolId,
      class_id: cls.id,
      gender: row.gender,
      uniform_type: row.uniform_type,
    });
    if (!kitInfo) {
      return {
        ...row,
        status: "error",
        message: `No kit for class ${row.class} ${row.gender} ${row.uniform_type}`,
      };
    }
    const preview: Row["preview"] = [];
    let total = 0;
    let warning: string | undefined;
    for (const item of kitInfo.items) {
      const wanted =
        item.product_name?.toLowerCase().includes("shirt")
          ? row.shirt_size
          : item.product_name?.toLowerCase().includes("pant")
            ? row.pant_size
            : undefined;
      let resolved = item;
      if (wanted && wanted !== item.size) {
        const all = await masterData.searchVariants(item.product_name);
        const match = all.find(
          (v: any) => v.size === wanted && v.product_name === item.product_name,
        );
        if (match) {
          resolved = { ...item, variant_id: match.id, size: match.size, price: match.price };
        } else {
          warning = `Wanted ${item.product_name} size ${wanted}, using ${item.size}`;
        }
      }
      preview.push({
        product_name: resolved.product_name,
        size: resolved.size,
        price: resolved.price,
        variant_id: resolved.variant_id,
        quantity: item.quantity ?? 1,
      });
      total += Number(resolved.price ?? 0) * (item.quantity ?? 1);
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
    if (!schoolId) {
      setMessage("Pick a school");
      return;
    }
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
    if (!user || !schoolId) return;
    const ready = rows.filter((r) => r.status !== "error");
    if (ready.length === 0) {
      setMessage("No rows ready");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const deviceCode = (await settings.get<string>("device_code")) ?? "POS001";
      const classes = classesBySchool[schoolId] ?? [];
      let created = 0;
      let failed = 0;
      for (const row of ready) {
        try {
          const items = (row.preview ?? []).map((p) => ({
            variant_id: p.variant_id,
            sku: "",
            product_name: p.product_name,
            size: p.size,
            quantity: p.quantity,
            unit_price: p.price,
            discount: 0,
            tax: 0,
            line_total: p.price * p.quantity,
          }));
          const subtotal = items.reduce((s, i) => s + i.line_total, 0);
          const localOrderNumber = await ordersRepo.allocateLocalOrderNumber(
            deviceCode,
            new Date(),
          );
          const idempotencyKey = buildIdempotencyKey(deviceCode, localOrderNumber);
          const createdAt = new Date().toISOString();
          const cls = classes.find((c) => c.class_name === row.class);
          await ordersRepo.create({
            local_order_number: localOrderNumber,
            idempotency_key: idempotencyKey,
            device_id: deviceCode,
            cashier_id: user.id,
            school_id: schoolId,
            class_id: cls?.id ?? null,
            student_name: row.student_name,
            parent_mobile: row.parent_mobile ?? null,
            subtotal,
            discount_total: 0,
            tax_total: 0,
            grand_total: subtotal,
            payment_mode: paymentMode,
            payment_reference: null,
            items,
            created_at: createdAt,
          });
          for (const it of items) await inventory.applySale(it.variant_id, it.quantity);
          await syncQueue.enqueue({
            event_type: "order.created",
            idempotency_key: idempotencyKey,
            payload: {
              device_id: deviceCode,
              cashier_id: user.id,
              school_id: schoolId,
              class_id: cls?.id ?? null,
              student_name: row.student_name,
              parent_mobile: row.parent_mobile ?? null,
              subtotal,
              discount_total: 0,
              tax_total: 0,
              grand_total: subtotal,
              payment_mode: paymentMode,
              created_offline: true,
              created_at: createdAt,
              local_order_number: localOrderNumber,
              idempotency_key: idempotencyKey,
              items,
              bulk_batch: true,
            },
          });
          created++;
        } catch {
          failed++;
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
    gross: rows.reduce((s, r) => s + (r.preview_total ?? 0), 0),
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollPad}>
      <Title>📦 Bulk school order</Title>
      <Muted style={{ marginTop: 6, marginBottom: 12 }}>
        Paste CSV with headers: student_name, class, gender, uniform_type,
        parent_mobile, shirt_size, pant_size. Each row becomes one queued
        offline order.
      </Muted>

      <Panel elev>
        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
          School
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {schools.map((s) => (
            <Button
              key={s.id}
              onPress={() => setSchoolId(s.id)}
              variant={schoolId === s.id ? "primary" : "ghost"}
            >
              {s.code}
            </Button>
          ))}
        </ScrollView>
        <View style={{ height: 10 }} />
        <Row gap={8}>
          <Button
            onPress={() => setPaymentMode("credit")}
            variant={paymentMode === "credit" ? "primary" : "ghost"}
            style={{ flex: 1 }}
          >
            📒 Credit / invoice
          </Button>
          <Button
            onPress={() => setPaymentMode("cash")}
            variant={paymentMode === "cash" ? "primary" : "ghost"}
            style={{ flex: 1 }}
          >
            💵 Cash on delivery
          </Button>
        </Row>
        <View style={{ height: 10 }} />
        <Input
          label="CSV"
          value={csv}
          onChangeText={setCsv}
          multiline
          numberOfLines={8}
          style={{ fontFamily: "monospace", fontSize: 12, minHeight: 120 }}
        />
        <View style={{ height: 10 }} />
        <Button onPress={previewAll} variant="primary" size="lg" loading={busy}>
          Preview
        </Button>
      </Panel>

      {rows.length > 0 && (
        <Panel elev style={{ marginTop: 12 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {summary.total} rows
              </Text>
              <Muted>
                {summary.ready} ready · {summary.warnings} warnings · {summary.errors} errors
              </Muted>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Muted>Gross total</Muted>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 18 }}>
                {inr(summary.gross)}
              </Text>
            </View>
          </Row>
          <View style={{ height: 10 }} />
          <Button
            onPress={submitAll}
            variant="primary"
            size="lg"
            loading={busy}
            disabled={summary.ready === 0}
          >
            Create {summary.ready} orders
          </Button>
          <View style={{ height: 10 }} />
          {rows.map((r, i) => (
            <View
              key={i}
              style={{
                borderTopColor: colors.border,
                borderTopWidth: i === 0 ? 0 : 1,
                paddingVertical: 8,
              }}
            >
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontWeight: "500" }}>
                  {r.student_name} — class {r.class} {r.gender}
                </Text>
                <Badge
                  variant={
                    r.status === "error"
                      ? "error"
                      : r.status === "warning"
                        ? "offline"
                        : "online"
                  }
                >
                  {r.status}
                </Badge>
              </Row>
              {r.message && <Muted>{r.message}</Muted>}
              {r.preview && (
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  {r.preview.map((p) => `${p.product_name} ${p.size}`).join(", ")}
                </Text>
              )}
              {r.preview_total ? (
                <Text style={{ color: colors.text, fontWeight: "500" }}>
                  {inr(r.preview_total)}
                </Text>
              ) : null}
            </View>
          ))}
        </Panel>
      )}

      {message && (
        <Panel style={{ marginTop: 12 }}>
          <Text style={{ color: colors.info }}>{message}</Text>
        </Panel>
      )}
    </ScrollView>
  );
}
