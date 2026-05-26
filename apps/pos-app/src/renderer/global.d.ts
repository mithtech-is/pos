import type { PosApi } from "../preload/preload";

declare global {
  interface Window {
    pos: PosApi;
  }
}

export {};
