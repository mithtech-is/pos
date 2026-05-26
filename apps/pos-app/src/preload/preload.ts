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
