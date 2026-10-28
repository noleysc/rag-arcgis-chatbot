/** "2026-06-17" → "Jun 17, 2026". Date-only strings are parsed as local
 * midnight so the day doesn't shift west of UTC. */
export function formatShortDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "2026-06-17" → { month: "JUN", day: 17 } for calendar-leaf badges. */
export function monthDay(dateStr: string): { month: string; day: number } {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  return { month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(), day: d.getDate() };
}
