import { useSyncExternalStore } from "react";

// Hash routes (#/map) rather than real paths: production serves the built SPA
// through FastAPI's StaticFiles (backend/app.py), which has no index.html
// fallback, so a refresh on /map would 404. Hash routes need no server help.
export type Route = "home" | "map" | "ask" | "records" | "meetings" | "pulse";

const SLUGS: Record<Route, string> = {
  home: "",
  map: "map",
  ask: "ask",
  records: "records",
  meetings: "meetings",
  pulse: "pulse",
};

export const ROUTE_LABELS: Record<Route, string> = {
  home: "Home",
  map: "Explore Map",
  ask: "Ask a Question",
  records: "Board Records",
  meetings: "Meetings",
  pulse: "Community Pulse",
};

export function routeHref(route: Route): string {
  return `#/${SLUGS[route]}`;
}

function parseHash(hash: string): Route {
  const slug = hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return (Object.keys(SLUGS) as Route[]).find((r) => SLUGS[r] === slug) ?? "home";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseHash(window.location.hash));
}

export function navigate(route: Route): void {
  window.location.hash = `/${SLUGS[route]}`;
}
