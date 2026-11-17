/**
 * Report data model — the contract between the transformation layer
 * (buildReport.ts, which only rearranges what one chatbot answer already
 * contains) and the PDF renderer (pdf/*.tsx, which only draws it).
 *
 * Nothing in here is free text written by the report engine about Estero:
 * every string is either copied from the answer / its structured metadata,
 * a fixed label ("Key Findings"), or a fact about the report itself
 * (generation date, how many sources it cites).
 */

/** Outcome vocabulary of backend/prompts/answer_system.md timeline statuses
 * and ProjectOut.status, plus "other" for anything unrecognised (shown
 * verbatim, never coerced into one of the known outcomes). */
export type StatusKind = "approved" | "denied" | "continued" | "nodecision" | "update" | "other";

/** One styled stretch of inline text. */
export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  /** External http(s)/mailto target. */
  href?: string;
  /** A bolded outcome word in the answer ("**approved**") — drawn in that
   * outcome's color. Only ever set from the answer's own wording. */
  status?: StatusKind;
  /** A `[RECORD_ID]` citation the backend actually cited. `ref` is the
   * number of the matching entry in Report.sources, or null when the
   * response carried no source document for that ID (the citation is then
   * shown as plain text — no link is invented). */
  cite?: { recordId: string; ref: number | null };
}

export type Block =
  | { type: "paragraph"; runs: InlineRun[] }
  | { type: "heading"; depth: number; runs: InlineRun[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "table"; align: Array<"left" | "right" | "center" | null>; header: InlineRun[][]; rows: InlineRun[][][] }
  | { type: "quote"; blocks: Block[] }
  | { type: "code"; text: string }
  | { type: "rule" };

export interface ListItem {
  blocks: Block[];
}

/** Rough date interval parsed from a date expression as written ("2022-07-12",
 * "Spring 2027", "Sat Nov 21 4:30 PM"). Only used to decide whether a dated
 * item is in the past or the future — the label shown is always the
 * original wording (ISO days are merely re-formatted, e.g. "Jul 12, 2022"). */
export interface DateSpan {
  start: Date;
  end: Date;
  precision: "day" | "month" | "season" | "quarter" | "year";
}

export type Tense = "past" | "current" | "future" | "unknown";

export interface Metric {
  /** The figure exactly as written in the answer ("$4.2 million", "4"). */
  value: string;
  /** Unit noun that followed the number in the answer ("lanes"), if any. */
  unit: string;
  /** The sentence the figure appears in, as plain text (may be clipped with
   * an ellipsis around the figure). */
  context: string;
  refs: number[];
}

export interface Finding {
  /** Bold lead of the bullet ("**Estero Sports Park**: …"), when present. */
  title: InlineRun[] | null;
  body: InlineRun[];
  /** Nested lists / extra paragraphs inside the bullet. */
  extra: Block[];
  refs: number[];
}

export interface TimelineItem {
  /** Display label (original wording; ISO days re-formatted). */
  dateLabel: string;
  tense: Tense;
  event: InlineRun[];
  /** Outcome text exactly as provided ("Approved", "Update", …); empty for
   * dated items lifted from a prose list, which carry no outcome. */
  status: string;
  statusKind: StatusKind | null;
  recordId: string;
  ref: number | null;
}

export type SourceKind = "board_record" | "village_council" | "article" | "page" | "event" | "document" | "link" | "note";

export interface SourceEntry {
  /** 1-based citation number. */
  n: number;
  kind: SourceKind;
  /** Short label for the kind ("Board record", "EsteroToday article"). */
  kindLabel: string;
  title: string;
  /** Publisher derived from the URL host ("EsteroToday", "Village of Estero"). */
  org: string;
  /** Meeting / publication date as display text. */
  date: string;
  recordId: string;
  location: string;
  /** Recorded outcome for meeting records (verbatim). */
  status: string;
  statusKind: StatusKind | null;
  summary: string;
  url: string;
  /** Label for the link button ("Open minutes (PDF)", "Read article"). */
  linkLabel: string;
}

/** Agenda items sharing a meeting date. */
export interface MeetingGroup {
  date: string;
  /** True when ≥2 cited items share the date — shown under a meeting header. */
  isMeeting: boolean;
  /** Source refs (Report.sources[n - 1]) of the meeting records. */
  records: number[];
}

export type Notice = { tone: "caution" | "info"; title: string; text: string };

export type ReportSection =
  | { kind: "metrics"; id: string; title: string; items: Metric[] }
  | { kind: "findings"; id: string; title: string; intro: Block[]; items: Finding[]; outro: Block[] }
  | { kind: "details"; id: string; title: string; blocks: Block[] }
  | { kind: "timeline"; id: string; title: string; subtitle: string; items: TimelineItem[]; hasFuture: boolean }
  | {
      kind: "decisions";
      id: string;
      title: string;
      subtitle: string;
      note: string;
      groups: MeetingGroup[];
      /** Comparison table rows (source refs), present for ≥3 records. */
      comparison: number[];
    }
  | { kind: "evidence"; id: string; title: string; subtitle: string; refs: number[] }
  | { kind: "related"; id: string; title: string; note: string; items: Array<{ recordId: string; text: string; ref: number | null }> }
  | { kind: "followups"; id: string; title: string; items: string[] };

export interface Report {
  /** Display title derived from the user's question. */
  title: string;
  /** Eyebrow above the title ("A Community Mobility Brief"). */
  kicker: string;
  designation: string;
  question: string;
  generatedAt: Date;
  generatedLabel: string;
  filename: string;
  /** The answer's "Bottom line" (or its lead paragraph); null when the answer
   * has no lead paragraph to quote. */
  summary: InlineRun[] | null;
  notices: Notice[];
  /** Part one: the answer itself (glance figures, findings, details,
   * schedules written in the answer, suggested follow-up questions). */
  answerSections: ReportSection[];
  /** Part two, "Evidence & Context": dated record timeline, meeting
   * records, supporting documents, related records. References follow. */
  evidenceSections: ReportSection[];
  sources: SourceEntry[];
  /** Record IDs the answer cites that came with no source document. */
  unlinkedCitations: string[];
  /** Source-type of the answer as reported by the backend. */
  answerBasis: "records" | "mixed" | "general";
}
