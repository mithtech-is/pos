/**
 * Design tokens for the new light/dark theme system.
 *
 * Palette is lifted from the Agilo Medusa POS starter so the UI matches the
 * reference screenshots. Both `light` and `dark` palettes expose the same
 * keys so components can read from a single resolved theme without branching.
 *
 * The dark palette is a hand-tuned inversion that keeps the same emotional
 * intent (success stays green, warning stays amber, etc.) while lifting
 * surfaces and softening text the way good native dark themes do.
 */

export type ThemeMode = "light" | "dark";

export interface Palette {
  /* Surfaces */
  bg: string; // app background
  surface: string; // cards, panels
  surface2: string; // raised surfaces (modals, sheets)
  surface3: string; // input fields, chips at rest

  /* Text */
  text: string; // primary text
  textSoft: string; // secondary text
  muted: string; // tertiary / labels
  muted2: string; // placeholder

  /* Lines */
  border: string;
  borderStrong: string;

  /* Brand / interactive */
  primary: string; // primary action (black in light, white in dark)
  primaryFg: string; // text on primary
  primarySoft: string; // soft tint for active states

  /* Status families (each has a soft bg + bold fg pair) */
  successBg: string;
  successFg: string;
  warningBg: string;
  warningFg: string;
  errorBg: string;
  errorFg: string;
  activeBg: string;
  activeFg: string;
  neutralBg: string;
  neutralFg: string;
}

/* ============================================================
   LIGHT palette — Agilo-style minimal monochrome
   ============================================================ */
export const lightPalette: Palette = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surface2: "#FFFFFF",
  surface3: "#F1F1F1",

  text: "#282828",
  textSoft: "#525252",
  muted: "#888888",
  muted2: "#B5B5B5",

  border: "#E5E5E5",
  borderStrong: "#D4D4D4",

  primary: "#282828",
  primaryFg: "#FFFFFF",
  primarySoft: "#F1F1F1",

  successBg: "#B9F1B2",
  successFg: "#1F6B17",
  warningBg: "#F8EC9A",
  warningFg: "#7A6810",
  errorBg: "#FFDFDF",
  errorFg: "#C01F1F",
  activeBg: "#B8CCFF",
  activeFg: "#3253B5",
  neutralBg: "#F1F1F1",
  neutralFg: "#525252",
};

/* ============================================================
   DARK palette — same hierarchy, low-contrast on near-black
   ============================================================ */
export const darkPalette: Palette = {
  bg: "#0E0E0E",
  surface: "#171717",
  surface2: "#1F1F1F",
  surface3: "#262626",

  text: "#F5F5F5",
  textSoft: "#D4D4D4",
  muted: "#A3A3A3",
  muted2: "#737373",

  border: "#2A2A2A",
  borderStrong: "#3A3A3A",

  primary: "#FAFAFA",
  primaryFg: "#171717",
  primarySoft: "#262626",

  successBg: "#1E3A1A",
  successFg: "#86EFAC",
  warningBg: "#3A311A",
  warningFg: "#FCD34D",
  errorBg: "#3A1A1A",
  errorFg: "#FCA5A5",
  activeBg: "#1A2240",
  activeFg: "#A3BFFA",
  neutralBg: "#262626",
  neutralFg: "#D4D4D4",
};

/* ============================================================
   Other tokens — same shape for both themes
   ============================================================ */
export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
  "4xl": 32,
  pill: 999,
} as const;

export const spacing = {
  px: 1,
  "0.5": 2,
  "1": 4,
  "1.5": 6,
  "2": 8,
  "2.5": 10,
  "3": 12,
  "3.5": 14,
  "4": 16,
  "5": 20,
  "6": 24,
  "7": 28,
  "8": 32,
  "10": 40,
  "12": 48,
  "16": 64,
} as const;

export const font = {
  size: {
    "3xs": 9,
    "2xs": 10,
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 22,
    "2xl": 26,
    "3xl": 32,
    "4xl": 40,
  },
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
  lineHeight: {
    tight: 1.1,
    normal: 1.35,
    relaxed: 1.55,
  },
} as const;

/* Elevation presets — light gets soft drop shadows, dark gets lifted bg */
export interface ShadowPreset {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export type ElevationLevels = {
  1: ShadowPreset;
  2: ShadowPreset;
  3: ShadowPreset;
};

export const elevation: { light: ElevationLevels; dark: ElevationLevels } = {
  light: {
    1: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    2: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    3: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 6,
    },
  },
  dark: {
    1: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 1,
    },
    2: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 3,
    },
    3: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 24,
      elevation: 6,
    },
  },
};
