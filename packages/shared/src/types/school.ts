export type Gender = "boy" | "girl" | "unisex";

export type UniformType = "regular" | "summer" | "winter" | "sports" | "house";

export interface School {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  area?: string | null;
  route?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface SchoolClass {
  id: string;
  school_id: string;
  class_name: string;
  display_order: number;
  academic_year_id: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
