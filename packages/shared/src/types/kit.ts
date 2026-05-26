import type { Gender, UniformType } from "./school";

export interface UniformKit {
  id: string;
  name: string;
  school_id: string;
  class_id: string;
  gender: Gender;
  uniform_type: UniformType;
  academic_year_id: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface UniformKitItem {
  id: string;
  kit_id: string;
  product_variant_id: string;
  quantity: number;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UniformRule {
  id: string;
  school_id: string;
  class_id: string;
  gender: Gender;
  uniform_type: UniformType;
  kit_id: string;
  academic_year_id: string;
  created_at: string;
  updated_at: string;
}
