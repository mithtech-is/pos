import { contextBridge, ipcRenderer } from "electron";

console.log("[preload] script starting");

/**
 * Preload bridge: exposes a typed `window.pos` API to the renderer.
 * NO direct ipcRenderer/Node access leaks into renderer code.
 */
const api = {
  // Master data
  listSchools: () => ipcRenderer.invoke("db:listSchools"),
  listClasses: (schoolId: string) =>
    ipcRenderer.invoke("db:listClasses", schoolId),
  searchVariants: (query: string) =>
    ipcRenderer.invoke("db:searchVariants", query),
  listProducts: (args?: { query?: string; school_id?: string }) =>
    ipcRenderer.invoke("db:listProducts", args),
  listVariantsForProduct: (productId: string) =>
    ipcRenderer.invoke("db:listVariantsForProduct", productId),
  findByBarcode: (barcode: string) =>
    ipcRenderer.invoke("db:findByBarcode", barcode),
  // Scan-to-add: create a catalog product from a scanned barcode (online only).
  createProductByScan: (payload: {
    barcode: string;
    name: string;
    price: number;
    category?: string;
  }) => ipcRenderer.invoke("pos:createProduct", payload),
  // Loyalty / CRM (online-only, best-effort)
  lookupCustomer: (phone: string) => ipcRenderer.invoke("pos:lookupCustomer", phone),
  awardPoints: (payload: {
    phone: string;
    name?: string;
    spent: number;
    redeem_points?: number;
    earn_rupees_per_point?: number;
  }) => ipcRenderer.invoke("pos:awardPoints", payload),
  // Promotions
  listPromotions: () => ipcRenderer.invoke("pos:listPromotions"),
  savePromotion: (promo: {
    code: string;
    type: "percent" | "flat" | "bogo";
    value: number;
    min_subtotal?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    active?: boolean;
  }) => ipcRenderer.invoke("pos:savePromotion", promo),
  deletePromotion: (id: string) => ipcRenderer.invoke("pos:deletePromotion", id),
  // Inventory / suppliers / purchase orders (back-office, online)
  listInventory: () => ipcRenderer.invoke("pos:listInventory"),
  updateInventory: (body: {
    sku: string;
    reorder_point?: number;
    set_stock?: number;
    add_stock?: number;
  }) => ipcRenderer.invoke("pos:updateInventory", body),
  listSuppliers: () => ipcRenderer.invoke("pos:listSuppliers"),
  saveSupplier: (body: { name: string; phone?: string; email?: string }) =>
    ipcRenderer.invoke("pos:saveSupplier", body),
  deleteSupplier: (id: string) => ipcRenderer.invoke("pos:deleteSupplier", id),
  listPurchaseOrders: () => ipcRenderer.invoke("pos:listPurchaseOrders"),
  savePurchaseOrder: (body: {
    supplier_id?: string | null;
    supplier_name?: string | null;
    lines: Array<{ sku: string; qty: number; cost?: number }>;
  }) => ipcRenderer.invoke("pos:savePurchaseOrder", body),
  receivePurchaseOrder: (id: string) => ipcRenderer.invoke("pos:receivePurchaseOrder", id),
  // Stores / outlets (multi-store)
  listStores: () => ipcRenderer.invoke("pos:listStores"),
  saveStore: (body: { name: string; code: string; city?: string }) =>
    ipcRenderer.invoke("pos:saveStore", body),
  setStoreActive: (payload: { id: string; active: boolean }) =>
    ipcRenderer.invoke("pos:setStoreActive", payload),
  // Users & Branches (manager admin)
  listUsersAdmin: () => ipcRenderer.invoke("pos:listUsersAdmin"),
  setUserBranches: (payload: { id: string; branch_ids: string[] }) =>
    ipcRenderer.invoke("pos:setUserBranches", payload),
  findKitByContext: (payload: {
    school_id: string;
    class_id: string;
    gender: string;
    uniform_type: string;
    academic_year_id?: string;
  }) => ipcRenderer.invoke("db:findKitByContext", payload),

  // Orders
  createLocalOrder: (payload: any) =>
    ipcRenderer.invoke("db:createLocalOrder", payload),
  listLocalOrders: (filter?: any) =>
    ipcRenderer.invoke("db:listLocalOrders", filter),
  getLocalOrder: (id: number) => ipcRenderer.invoke("db:getLocalOrder", id),
  analytics: (filter?: { from?: string; to?: string }) =>
    ipcRenderer.invoke("db:analytics", filter ?? {}),
  nextLocalOrderNumber: (payload: { device_code: string; now: string }) =>
    ipcRenderer.invoke("db:nextLocalOrderNumber", payload),

  // Sync queue
  queuePush: (payload: any) => ipcRenderer.invoke("db:queuePush", payload),
  queueStats: () => ipcRenderer.invoke("db:queueStats"),

  // Inventory
  getLocalAvailable: (variantId: string) =>
    ipcRenderer.invoke("db:getLocalAvailable", variantId),
  applyLocalSale: (payload: { variant_id: string; quantity: number }) =>
    ipcRenderer.invoke("db:applyLocalSale", payload),

  // Users
  listUsers: () => ipcRenderer.invoke("db:listUsers"),
  findUserByEmail: (email: string) =>
    ipcRenderer.invoke("db:findUserByEmail", email),
  verifyPin: (payload: { user_id: string; pin: string }) =>
    ipcRenderer.invoke("db:verifyPin", payload),
  verifyManagerPin: (payload: { pin: string; action?: string }) =>
    ipcRenderer.invoke("auth:verifyManagerPin", payload),

  // Audit
  audit: (payload: { user_id?: string; device_id?: string; action: string; data?: any }) =>
    ipcRenderer.invoke("db:audit", payload),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke("db:getSetting", key),
  setSetting: (payload: { key: string; value: unknown }) =>
    ipcRenderer.invoke("db:setSetting", payload),

  // Sync worker
  syncTick: () => ipcRenderer.invoke("sync:tick"),
  syncState: () => ipcRenderer.invoke("sync:state"),
  syncPause: (paused: boolean) => ipcRenderer.invoke("sync:pause", paused),
  setBackendUrl: (url: string) =>
    ipcRenderer.invoke("sync:setBackendUrl", url),
  setDeviceCode: (code: string) =>
    ipcRenderer.invoke("sync:setDeviceCode", code),
  setDeviceToken: (token: string) =>
    ipcRenderer.invoke("sync:setDeviceToken", token),
  onLogin: (payload: any) => ipcRenderer.invoke("sync:onLogin", payload),

  // Printer
  printReceipt: (receipt: any) => ipcRenderer.invoke("printer:print", receipt),
  renderReceipt: (receipt: any) =>
    ipcRenderer.invoke("printer:render", receipt),
  lastReceipt: () => ipcRenderer.invoke("printer:last"),

};

try {
  contextBridge.exposeInMainWorld("pos", api);
  console.log("[preload] window.pos exposed with", Object.keys(api).length, "methods");
} catch (e) {
  console.error("[preload] contextBridge.exposeInMainWorld FAILED:", e);
}

export type PosApi = typeof api;
