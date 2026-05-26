import { MODULE_KEYS } from "../modules";

/**
 * Reporting service.
 *
 * Reports are read-only aggregations over Medusa orders + the offline-sync
 * tables. Each method returns `{ items, count }`; HTTP routes wrap it in the
 * standard ApiSuccess envelope. Filters are intentionally simple (date range,
 * a few foreign-key narrowings) since the spec calls out "Do not overcomplicate
 * charts in MVP".
 *
 * All methods accept a Medusa container so they can resolve services lazily —
 * keeps the report layer decoupled from how the routes get wired.
 */

export interface DateRangeFilter {
  date_from?: string;
  date_to?: string;
}

export interface ReportContainer {
  resolve<T = any>(key: string): T;
}

export class ReportsService {
  constructor(private readonly container: ReportContainer) {}

  private async listOrders(filter: Record<string, any> = {}) {
    let orderService: any;
    try {
      orderService = this.container.resolve<any>("order");
    } catch {
      return [] as any[];
    }
    const where: Record<string, unknown> = { ...filter };
    if (filter.date_from || filter.date_to) {
      where.created_at = {
        ...(filter.date_from ? { $gte: new Date(filter.date_from) } : {}),
        ...(filter.date_to ? { $lte: new Date(filter.date_to) } : {}),
      };
      delete (where as any).date_from;
      delete (where as any).date_to;
    }
    return orderService.listOrders(where, { take: 5000 });
  }

  /** Daily sales totals across all counters. */
  async dailySales(filter: DateRangeFilter) {
    const orders = await this.listOrders(filter);
    const byDay = new Map<string, {
      date: string;
      total_orders: number;
      gross_sales: number;
      discount: number;
      tax: number;
      net_sales: number;
      cash_collected: number;
      upi_collected: number;
      credit_sales: number;
      returns: number;
    }>();
    for (const o of orders) {
      const date = new Date(o.created_at).toISOString().slice(0, 10);
      const row = byDay.get(date) ?? {
        date,
        total_orders: 0,
        gross_sales: 0,
        discount: 0,
        tax: 0,
        net_sales: 0,
        cash_collected: 0,
        upi_collected: 0,
        credit_sales: 0,
        returns: 0,
      };
      row.total_orders += 1;
      row.gross_sales += Number(o.subtotal ?? 0);
      row.discount += Number(o.discount_total ?? 0);
      row.tax += Number(o.tax_total ?? 0);
      row.net_sales += Number(o.total ?? 0);
      const mode = o.metadata?.payment_mode ?? "cash";
      if (mode === "cash") row.cash_collected += Number(o.total ?? 0);
      else if (mode === "upi") row.upi_collected += Number(o.total ?? 0);
      else if (mode === "credit") row.credit_sales += Number(o.total ?? 0);
      byDay.set(date, row);
    }
    const items = Array.from(byDay.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    return { items, count: items.length };
  }

  async schoolSales(filter: DateRangeFilter & { school_id?: string }) {
    const orders = await this.listOrders(filter);
    const bySchool = new Map<string, {
      school_id: string;
      total_orders: number;
      total_items: number;
      gross_sales: number;
      discount: number;
      net_sales: number;
    }>();
    for (const o of orders) {
      const schoolId = o.metadata?.school_id ?? "_unassigned";
      if (filter.school_id && schoolId !== filter.school_id) continue;
      const row = bySchool.get(schoolId) ?? {
        school_id: schoolId,
        total_orders: 0,
        total_items: 0,
        gross_sales: 0,
        discount: 0,
        net_sales: 0,
      };
      row.total_orders += 1;
      row.total_items += (o.items ?? []).reduce(
        (s: number, i: any) => s + Number(i.quantity ?? 0),
        0,
      );
      row.gross_sales += Number(o.subtotal ?? 0);
      row.discount += Number(o.discount_total ?? 0);
      row.net_sales += Number(o.total ?? 0);
      bySchool.set(schoolId, row);
    }
    const items = Array.from(bySchool.values()).sort(
      (a, b) => b.net_sales - a.net_sales,
    );
    return { items, count: items.length };
  }

  async offlinePendingOrders() {
    const sync = this.container.resolve<any>(MODULE_KEYS.OFFLINE_SYNC);
    const items = await sync.listSyncEvents(
      { event_type: "order.created", status: ["pending", "failed"] },
      { order: { created_at: "DESC" }, take: 500 },
    );
    return { items, count: items.length };
  }

  async syncConflicts(filter: { resolution_status?: string }) {
    const sync = this.container.resolve<any>(MODULE_KEYS.OFFLINE_SYNC);
    const items = await sync.listSyncConflicts(
      { resolution_status: filter.resolution_status ?? "open" },
      { order: { created_at: "DESC" }, take: 500 },
    );
    return { items, count: items.length };
  }

  async cashierSales(filter: DateRangeFilter & { cashier_id?: string }) {
    const orders = await this.listOrders(filter);
    const byCashier = new Map<string, {
      cashier_id: string;
      orders: number;
      gross_sales: number;
      discounts: number;
      cash_collected: number;
      upi_collected: number;
    }>();
    for (const o of orders) {
      const id = o.metadata?.pos_cashier_id ?? "_unknown";
      if (filter.cashier_id && id !== filter.cashier_id) continue;
      const row = byCashier.get(id) ?? {
        cashier_id: id,
        orders: 0,
        gross_sales: 0,
        discounts: 0,
        cash_collected: 0,
        upi_collected: 0,
      };
      row.orders += 1;
      row.gross_sales += Number(o.subtotal ?? 0);
      row.discounts += Number(o.discount_total ?? 0);
      const mode = o.metadata?.payment_mode ?? "cash";
      if (mode === "cash") row.cash_collected += Number(o.total ?? 0);
      if (mode === "upi") row.upi_collected += Number(o.total ?? 0);
      byCashier.set(id, row);
    }
    const items = Array.from(byCashier.values());
    return { items, count: items.length };
  }

  async paymentSummary(filter: DateRangeFilter) {
    const orders = await this.listOrders(filter);
    const byMode = new Map<string, { mode: string; orders: number; gross: number }>();
    for (const o of orders) {
      const mode = o.metadata?.payment_mode ?? "cash";
      const row = byMode.get(mode) ?? { mode, orders: 0, gross: 0 };
      row.orders += 1;
      row.gross += Number(o.total ?? 0);
      byMode.set(mode, row);
    }
    const items = Array.from(byMode.values()).sort((a, b) => b.gross - a.gross);
    return { items, count: items.length };
  }
}
