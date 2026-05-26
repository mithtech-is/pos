import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance, useColorScheme } from "react-native";
import { settings } from "../db/repositories";
import {
  type ElevationLevels,
  type Palette,
  type ThemeMode,
  darkPalette,
  elevation,
  font,
  lightPalette,
  radius,
  spacing,
} from "./tokens";

/**
 * Theme runtime — picks the active palette, exposes a setter that persists
 * the user's choice, and respects the OS color scheme when the user hasn't
 * explicitly chosen one.
 *
 * Persistence reuses the existing `settings` repo so the choice survives app
 * restarts without adding a new storage layer.
 */

export type ThemePreference = "light" | "dark" | "system";

interface Theme {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  colors: Palette;
  radius: typeof radius;
  spacing: typeof spacing;
  font: typeof font;
  elevation: ElevationLevels;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("light");
  const [loaded, setLoaded] = useState(false);

  // Hydrate from the SQLite settings store on first mount.
  useEffect(() => {
    (async () => {
      const stored = await settings.get<ThemePreference>("theme_preference");
      if (stored === "light" || stored === "dark" || stored === "system") {
        setPreferenceState(stored);
      }
      setLoaded(true);
    })().catch(() => setLoaded(true));
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    void settings.set("theme_preference", p);
  }, []);

  const mode: ThemeMode = useMemo(() => {
    if (preference === "system") {
      return systemScheme === "dark" ? "dark" : "light";
    }
    return preference;
  }, [preference, systemScheme]);

  const value = useMemo<Theme>(
    () => ({
      mode,
      preference,
      setPreference,
      colors: mode === "dark" ? darkPalette : lightPalette,
      radius,
      spacing,
      font,
      elevation: mode === "dark" ? elevation.dark : elevation.light,
    }),
    [mode, preference, setPreference],
  );

  // Don't render until hydrated to avoid a light->dark flash on first paint.
  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}

/**
 * Convenience: programmatically force a one-shot scheme switch (used by the
 * /Settings screen for the manual toggle).
 */
export function setSystemAppearance(mode: "light" | "dark") {
  Appearance.setColorScheme(mode);
}
