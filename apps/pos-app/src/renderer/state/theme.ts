import { create } from "zustand";

/**
 * Theme preference for the Electron app. Three values:
 *   "light"  — always light
 *   "dark"   — always dark
 *   "system" — follow the OS color scheme via prefers-color-scheme
 *
 * Persistence lives in the SQLite settings table via the existing
 * window.pos.getSetting / setSetting IPC bridge.
 *
 * The active theme drives a `data-theme` attribute on <html>, which the CSS
 * variables in styles.css read to swap palettes.
 */
export type ThemePreference = "light" | "dark" | "system";

interface ThemeState {
  preference: ThemePreference;
  mode: "light" | "dark";
  setPreference: (p: ThemePreference) => Promise<void>;
  hydrate: () => Promise<void>;
}

function resolveMode(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  }
  return pref;
}

function applyDocumentTheme(mode: "light" | "dark") {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", mode);
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: "light",
  mode: "light",
  async setPreference(p: ThemePreference) {
    const mode = resolveMode(p);
    applyDocumentTheme(mode);
    set({ preference: p, mode });
    try {
      await window.pos.setSetting({ key: "theme_preference", value: p });
    } catch {
      /* offline ok */
    }
  },
  async hydrate() {
    let pref: ThemePreference = "light";
    try {
      const stored = (await window.pos.getSetting("theme_preference")) as
        | ThemePreference
        | undefined;
      if (stored === "light" || stored === "dark" || stored === "system") {
        pref = stored;
      }
    } catch {
      /* default to light */
    }
    const mode = resolveMode(pref);
    applyDocumentTheme(mode);
    set({ preference: pref, mode });

    // If preference is "system", listen for OS color-scheme changes.
    if (pref === "system" && typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        const m = mq.matches ? "dark" : "light";
        applyDocumentTheme(m);
        set({ mode: m });
      };
      mq.addEventListener?.("change", handler);
    }
  },
}));
