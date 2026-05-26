import type { Gender, UniformType } from "./school";

export interface Product {
  id: string;
  name: string;
  category: string;
  school_id?: string | null;
  uniform_type?: UniformType | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  barcode?: string | null;
  size: string;
  gender?: Gender | null;
  color?: string | null;
  fabric?: string | null;
  class_from?: number | null;
  class_to?: number | null;
  price: number;
  tax_rate: number;
  status: "active" | "inactive";
  academic_year_id?: string | null;
  created_at: string;
  updated_at: string;
}
