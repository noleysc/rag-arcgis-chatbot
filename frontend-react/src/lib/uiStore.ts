import type { RightTab } from "../types";

// Small singleton (same pattern as mapViewStore.ts) so components outside the
// right-panel subtree — e.g. a "Show on map" link deep inside a chat card —
// can switch the Map/Pulse tab without threading state through two unrelated
// branches of the tree. Registered by RightPanel on mount, cleared on unmount.
let setTab: ((tab: RightTab) => void) | null = null;

export function registerTabSwitcher(fn: ((tab: RightTab) => void) | null): void {
  setTab = fn;
}

export function switchToTab(tab: RightTab): void {
  setTab?.(tab);
}

export interface MapContextSelection {
  title: string;
  appId: string;
  location: string;
}

let currentMapContext: MapContextSelection | null = null;
const mapContextListeners = new Set<(ctx: MapContextSelection | null) => void>();

export function setMapContext(ctx: MapContextSelection | null): void {
  currentMapContext = ctx;
  for (const fn of mapContextListeners) {
    fn(ctx);
  }
}

export function getMapContext(): MapContextSelection | null {
  return currentMapContext;
}

export function subscribeMapContext(fn: (ctx: MapContextSelection | null) => void): () => void {
  mapContextListeners.add(fn);
  fn(currentMapContext);
  return () => {
    mapContextListeners.delete(fn);
  };
}

