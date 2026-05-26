export type DeviceStatus =
  | "pending_registration"
  | "active"
  | "suspended"
  | "blocked"
  | "retired";

export interface POSDevice {
  id: string;
  device_code: string;
  device_name: string;
  store_location_id?: string | null;
  sales_channel_id?: string | null;
  assigned_user_id?: string | null;
  last_sync_at?: string | null;
  status: DeviceStatus;
  registered_at?: string | null;
  blocked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface POSSession {
  id: string;
  device_id: string;
  user_id: string;
  login_at: string;
  logout_at?: string | null;
  session_status: "open" | "closed";
  last_online_at?: string | null;
  created_at: string;
  updated_at: string;
}
