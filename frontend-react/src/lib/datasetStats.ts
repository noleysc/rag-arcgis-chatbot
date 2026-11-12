import { API_BASE } from "./config";

export interface EsteroTodayShare {
  /** EsteroToday records in the chatbot's index (posts, pages, PDFs). */
  count: number;
  /** All indexed records: board records plus EsteroToday. */
  total: number;
  /** count / total, rounded to a whole percent. */
  percent: number;
}

/** How much of the chatbot's dataset comes from EsteroToday (the Engage
 * Estero site), from the backend's live index counts. Throws when the
 * backend is unreachable or the index isn't loaded yet. */
export async function fetchEsteroTodayShare(): Promise<EsteroTodayShare> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  const data = (await res.json()) as { source_counts?: { board_records?: number; esterotoday?: number } };
  const count = data.source_counts?.esterotoday ?? 0;
  const total = count + (data.source_counts?.board_records ?? 0);
  if (!total) throw new Error("Index not loaded");
  return { count, total, percent: Math.round((count / total) * 100) };
}
