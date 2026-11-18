// Board Records from the Engage Estero backend (backend/records_api.py) —
// the same agenda items the chatbot answers from, refreshed whenever the
// pipeline updates the data and the server redeploys. The Board Records
// page and the header's "Latest meeting" stamp read this instead of the
// ArcGIS Online layer (lib/boardRecords.ts), which is a one-time copy that
// only holds mappable items and must be re-uploaded by hand.
import { API_BASE } from "./config";
import type { BoardRecord, MinutesDoc, RecordSort } from "./boardRecords";

async function getJson<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "") qs.set(k, String(v));
  const query = qs.toString();
  const res = await fetch(`${API_BASE}${path}${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface ApiRecord {
  id: number;
  title: string;
  date: string;
  board: string;
  item_type: string;
  action: string;
  application_id: string;
  minutes_url: string;
}

function toRecord(r: ApiRecord): BoardRecord {
  return {
    id: r.id,
    title: r.title.trim() || "Untitled agenda item",
    category: "",
    date: r.date,
    board: r.board,
    itemType: r.item_type,
    action: r.action.trim(),
    applicationId: r.application_id,
    minutesUrl: r.minutes_url,
  };
}

/** One page of agenda items plus the total matching count. */
export async function fetchRecordsPage(opts: {
  decisionsOnly: boolean;
  board: string;
  search: string;
  sort: RecordSort;
  offset: number;
  pageSize: number;
}): Promise<{ records: BoardRecord[]; total: number }> {
  const data = await getJson<{ records: ApiRecord[]; total: number }>("/api/records", {
    view: opts.decisionsOnly ? "decisions" : "all",
    board: opts.board,
    q: opts.search.trim(),
    sort: opts.sort,
    offset: opts.offset,
    limit: opts.pageSize,
  });
  return { records: data.records.map(toRecord), total: data.total };
}

/** Distinct board names, for the board filter. */
export async function fetchBoards(): Promise<string[]> {
  return (await getJson<{ boards: string[] }>("/api/records/boards")).boards;
}

/** Every distinct minutes PDF (newest first), optionally narrowed to
 * meetings with an agenda item matching `search`. */
export async function fetchMinutesDocs(opts: { board?: string; search?: string } = {}): Promise<MinutesDoc[]> {
  const data = await getJson<{ docs: MinutesDoc[] }>("/api/records/minutes", {
    board: opts.board || "",
    q: (opts.search || "").trim(),
  });
  return data.docs;
}

export interface RecordsSummary {
  total: number;
  /** YYYY-MM-DD of the newest meeting in the data, or null. */
  latestMeeting: string | null;
}

export async function fetchRecordsSummary(): Promise<RecordsSummary> {
  const data = await getJson<{ total: number; latest_meeting: string | null }>("/api/records/summary");
  return { total: data.total, latestMeeting: data.latest_meeting };
}
