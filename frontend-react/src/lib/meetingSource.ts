import type { Meeting } from "../types";

/** Official Village pages that pipeline/discover.py scrapes for new minutes PDFs. */
const COUNCIL_MINUTES_URL = "https://estero-fl.gov/villagecouncilminutes/";
const PZDB_MINUTES_URL = "https://estero-fl.gov/pzdbminutes/";
/** Public agendas / video / transcripts hub (estero-fl.gov/agendas-minutes/ is a 404). */
export const AGENDAS_URL = "https://estero-fl.gov/meetings/";

/** Resolve the public page for a meeting — prefer an explicit url, else board minutes, else agendas. */
export function meetingSourceUrl(meeting: Pick<Meeting, "board" | "url">): string {
  if (meeting.url && /^https?:\/\//i.test(meeting.url)) return meeting.url;
  const board = (meeting.board || "").toLowerCase();
  if (board.includes("zoning") || board.includes("pzdb") || board.includes("design board")) {
    return PZDB_MINUTES_URL;
  }
  if (board.includes("council")) {
    return COUNCIL_MINUTES_URL;
  }
  return AGENDAS_URL;
}
