/**
 * Design tokens shared across the mobile UI. Mirrors the Electron app's
 * CSS variables so the two clients feel like the same product.
 */
export const colors = {
  bg: "#0e0e0e",
  bgElev1: "#171717",
  bgElev2: "#1f1f1f",
  panel: "#171717",
  panel2: "#1f1f1f",

  text: "#f5f5f5",
  textSoft: "#d4d4d4",
  muted: "#a3a3a3",
  muted2: "#737373",

  border: "#2a2a2a",
  borderStrong: "#3a3a3a",

  accent: "#fafafa",
  accentHover: "#ffffff",
  accentSoft: "rgba(250, 250, 250, 0.12)",

  success: "#22c55e",
  successSoft: "rgba(34, 197, 94, 0.18)",
  warning: "#f59e0b",
  warningSoft: "rgba(245, 158, 11, 0.18)",
  danger: "#ef4444",
  dangerSoft: "rgba(239, 68, 68, 0.18)",
  info: "#d4d4d4",
  infoSoft: "rgba(212, 212, 212, 0.16)",
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const font = {
  size: { xs: 11, sm: 12, md: 14, lg: 16, xl: 20, xxl: 28 },
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
};

/** Convert a payment mode to its display color. */
export const paymentColor: Record<string, string> = {
  cash: colors.success,
  upi: colors.info,
  card: colors.accent,
  credit: colors.warning,
};

/** Common shadow preset for elevated cards. */
export const elevation = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 12,
  elevation: 4,
};
