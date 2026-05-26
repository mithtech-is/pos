export type UserRole =
  | "owner"
  | "admin"
  | "store_manager"
  | "cashier"
  | "inventory_staff"
  | "school_representative";

export interface POSUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "active" | "inactive";
  offline_access_expires_at?: string | null;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  device_code: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: POSUser;
  expires_in: number;
  /** Hashed PIN used for offline PIN unlock (already salted on the server). */
  offline_pin_hash?: string;
}
