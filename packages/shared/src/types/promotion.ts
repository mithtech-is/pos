export type PosPromotionType = "percent" | "flat" | "bogo";

export interface PosPromotion {
  id: string;
  code: string;
  type: PosPromotionType;
  /** percent: % off; flat: ₹ off; bogo: ignored (cheapest unit is free). */
  value: number;
  min_subtotal?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  active: boolean;
}
