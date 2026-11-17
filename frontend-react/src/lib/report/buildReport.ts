/**
 * The report composition engine: one finished chatbot answer → Report.
 *
 * No second AI call and no keyword templates. Sections are chosen from what
 * the answer actually contains:
 *   - the "Bottom line" (or lead paragraph)      → executive summary
 *   - figures the answer bolds ($, %, "4 lanes") → At a Glance (only ≥2)
 *   - the answer's bullet list(s)                → numbered Key Findings
 *   - other paragraphs / headed sections / tables → Key Details
 *   - a bullet list whose items all start with a date → a schedule timeline
 *   - structured `timeline` entries              → Timeline of Developments
 *   - cited board / council records              → Decisions on Record
 *   - cited articles / pages / documents         → Supporting Evidence
 *   - `related`, `follow_ups`                    → Related Records, Questions
 * Anything absent is simply left out — no empty or filler sections.
 */
import type { ChatMessage } from "../../types";
import { splitBottomLine } from "../answerText";
import { matchLeadingDate, parseDateExpression, tenseOf } from "./dates";
import { mergeRuns, parseInline, parseMarkdown, statusKindOf, trimRuns, type CitationResolver } from "./markdown";
import type {
  Block,
  Finding,
  InlineRun,
  ListItem,
  Metric,
  Notice,
  Report,
  ReportSection,
  TimelineItem,
} from "./model";
import { displayRecordId, isInternalRecordId, isMeetingRecord, SourceRegistry } from "./sources";
import { cleanInline, clipText, formatDateLabel, formatLongDate, formatShortDate, plainText } from "./text";
import { reportFilename, reportKicker, reportTitle } from "./title";

export interface BuildReportOptions {
  /** The question that produced the answer (defaults to message.question). */
  question?: string;
  /** Clock for the generation date and past/future checks. */
  now?: Date;
}

export const REPORT_DESIGNATION = "Civic Intelligence Brief";

// ─────────────────────────────────────────────
// Block helpers
// ─────────────────────────────────────────────

function collectRefs(blocks: Block[] | InlineRun[], into: number[] = []): number[] {
  const visitRuns = (runs: InlineRun[]) => {
    for (const r of runs) if (r.cite?.ref && !into.includes(r.cite.ref)) into.push(r.cite.ref);
  };
  const visit = (b: Block) => {
    switch (b.type) {
      case "paragraph":
      case "heading":
        visitRuns(b.runs);
        break;
      case "list":
        b.items.forEach((i) => i.blocks.forEach(visit));
        break;
      case "table":
        b.header.forEach(visitRuns);
        b.rows.forEach((row) => row.forEach(visitRuns));
        break;
      case "quote":
        b.blocks.forEach(visit);
        break;
      default:
        break;
    }
  };
  for (const item of blocks) {
    if ("type" in item) visit(item);
    else visitRuns([item]);
  }
  return into;
}

function forEachRunList(blocks: Block[], fn: (runs: InlineRun[]) => void): void {
  for (const b of blocks) {
    if (b.type === "paragraph" || b.type === "heading") fn(b.runs);
    else if (b.type === "list") b.items.forEach((i) => forEachRunList(i.blocks, fn));
    else if (b.type === "quote") forEachRunList(b.blocks, fn);
    else if (b.type === "table") {
      b.header.forEach(fn);
      b.rows.forEach((row) => row.forEach(fn));
    }
  }
}

/** Drop the first `count` characters from a run list (used to lift a leading
 * date or label out of a bullet). */
function dropChars(runs: InlineRun[], count: number): InlineRun[] {
  const out: InlineRun[] = [];
  let remaining = count;
  for (const r of runs) {
    if (remaining <= 0) out.push(r);
    else if (r.text.length <= remaining) remaining -= r.text.length;
    else {
      out.push({ ...r, text: r.text.slice(remaining) });
      remaining = 0;
    }
  }
  return out;
}

const LEAD_SEPARATOR = /^\s*(?::|—|–|-(?=\s))\s*/;

/** "**Estero Sports Park** — details" → title + body. Only splits when the
 * bold lead is followed by an explicit separator (or ends with a colon), so
 * a bolded figure starting a sentence ("**$4M** was budgeted") stays a
 * sentence. */
function splitLead(runs: InlineRun[]): { title: InlineRun[] | null; body: InlineRun[] } {
  const first = runs[0];
  if (!first || !first.bold || first.cite || first.text.length > 140) return { title: null, body: runs };
  const leadText = first.text.trim();
  const rest = runs.slice(1);
  const restText = plainText(rest);
  const colonInLead = /[:—–]$/.test(leadText);
  if (!colonInLead && !LEAD_SEPARATOR.test(restText)) return { title: null, body: runs };
  const body = trimRuns(colonInLead ? rest : dropChars(rest, (LEAD_SEPARATOR.exec(restText) || [""])[0].length));
  if (!body.length) return { title: null, body: runs };
  // The body now starts its own line under the title: sentence-case it
  // ("master-planned communities…" → "Master-planned communities…").
  const head = body[0];
  if (!head.cite && /^[a-z]/.test(head.text)) body[0] = { ...head, text: head.text[0].toUpperCase() + head.text.slice(1) };
  const titleText = leadText.replace(/\s*[:—–]$/, "");
  return { title: [{ ...first, text: titleText }], body: mergeRuns(body) };
}

function findingFromItem(item: ListItem): Finding {
  const [first, ...extra] = item.blocks;
  const refs = collectRefs(item.blocks);
  if (!first || first.type !== "paragraph") return { title: null, body: [], extra: item.blocks, refs };
  const { title, body } = splitLead(first.runs);
  return { title, body, extra, refs };
}

interface HeadingGroup {
  heading: InlineRun[] | null;
  blocks: Block[];
}

/**
 * Answers often label a list with a paragraph instead of a markdown heading:
 * "**Residential & Mixed-Use:**" or "Examples from Estero:". When such a
 * label sits directly above a list or table it is treated as that group's
 * heading (same words, minus the trailing colon).
 */
function promoteLabelParagraphs(blocks: Block[]): Block[] {
  return blocks.map((b, i) => {
    const next = blocks[i + 1];
    if (b.type !== "paragraph" || !next || (next.type !== "list" && next.type !== "table")) return b;
    if (b.runs.some((r) => r.cite || r.href)) return b;
    const text = plainText(b.runs).trim();
    const allBold = b.runs.every((r) => r.bold || !r.text.trim());
    const shortLabel = /:$/.test(text) && text.length <= 60 && text.split(/\s+/).length <= 6;
    if ((allBold && text.length <= 80) || shortLabel) {
      return { type: "heading", depth: 3, runs: [{ text: text.replace(/\s*:$/, "") }] };
    }
    return b;
  });
}

function groupByHeading(blocks: Block[]): HeadingGroup[] {
  const groups: HeadingGroup[] = [{ heading: null, blocks: [] }];
  for (const b of promoteLabelParagraphs(blocks)) {
    if (b.type === "heading") groups.push({ heading: b.runs, blocks: [] });
    else groups[groups.length - 1].blocks.push(b);
  }
  return groups.filter((g) => g.heading || g.blocks.length);
}

/** A group that is one list, optionally with paragraphs before and after. */
function listShape(
  blocks: Block[],
): { intro: Block[]; list: Extract<Block, { type: "list" }>; outro: Block[] } | null {
  const at = blocks.findIndex((b) => b.type === "list");
  if (at === -1 || blocks.slice(at + 1).some((b) => b.type === "list")) return null;
  const intro = blocks.slice(0, at);
  const outro = blocks.slice(at + 1);
  if (![...intro, ...outro].every((b) => b.type === "paragraph")) return null;
  return { intro, list: blocks[at] as Extract<Block, { type: "list" }>, outro };
}

// ─────────────────────────────────────────────
// Dated lists → timeline
// ─────────────────────────────────────────────

function datedItems(list: Extract<Block, { type: "list" }>, now: Date): TimelineItem[] | null {
  if (list.items.length < 2) return null;
  const items: TimelineItem[] = [];
  for (const item of list.items) {
    const first = item.blocks[0];
    if (!first || first.type !== "paragraph") return null;
    const text = plainText(first.runs);
    const hit = matchLeadingDate(text, now);
    if (!hit) return null;
    const after = text.slice(hit.length);
    const sep = /^\s*(?::|—|–|-|,)?\s*/.exec(after)?.[0] ?? "";
    // The date must be the item's lead, not the start of a sentence ("2024 saw…").
    if (!/[:—–,-]/.test(sep) && !/^\s*\(/.test(after)) return null;
    const event = trimRuns(dropChars(first.runs, hit.length + sep.length));
    if (!event.length) return null;
    items.push({
      dateLabel: formatDateLabel(text.slice(0, hit.length).trim()),
      tense: tenseOf(hit.span, now),
      event: mergeRuns(event),
      status: "",
      statusKind: null,
      recordId: "",
      ref: null,
    });
  }
  return items;
}

// ─────────────────────────────────────────────
// At-a-glance figures
// ─────────────────────────────────────────────

const UNIT_WORDS =
  "acres?|lanes?|homes?|houses?|(?:dwelling |residential )?units?|stories|story|floors?|square[- ]feet|square[- ]foot|sq\\.? ?ft\\.?|feet|foot|miles?|apartments?|townhomes?|townhouses?|condos?|condominiums?|(?:hotel )?rooms?|beds?|seats?|(?:parking )?spaces?|parcels?|residents?|vehicles?|(?:daily )?trips?|buildings?|signals?|roundabouts?|employees?|jobs?|students?";
const NUMBER = "\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?";
const MONEY = /^\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:thousand|million|billion|[kmb])\b)?$/i;
const PERCENT = /^\d{1,3}(?:\.\d+)?\s?(?:%|percent)$/i;
const QUANTITY = new RegExp(`^(${NUMBER})[\\s-]+(${UNIT_WORDS})$`, "i");
const VOTE = /^(\d{1,2})\s?[-–]\s?(\d{1,2})(?:\s+vote)?$/i;
/** Figures inside ordinary (non-bold) text. The look-behind keeps numbers
 * that are part of IDs, dates or road names ("SEZ2022", "I-75") out. */
const FIGURES_IN_TEXT = new RegExp(
  [
    "(?<money>\\$\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:thousand|million|billion)\\b|[KMB]\\b)?)",
    "(?<![\\w.$-])(?<pct>\\d{1,3}(?:\\.\\d+)?\\s?(?:%|percent\\b))",
    `(?<![\\w.$/-])(?<qty>(?<num>${NUMBER})[\\s-](?<unit>${UNIT_WORDS}))\\b`,
  ].join("|"),
  "gi",
);
const PLURAL_UNITS: Record<string, string> = {
  acre: "acres", lane: "lanes", home: "homes", house: "houses", unit: "units", "dwelling unit": "dwelling units",
  "residential unit": "residential units", story: "stories", floor: "floors", "square foot": "square feet",
  "square-foot": "square feet", foot: "feet", mile: "miles", apartment: "apartments", townhome: "townhomes",
  townhouse: "townhouses", condo: "condos", condominium: "condominiums", room: "rooms", "hotel room": "hotel rooms",
  bed: "beds", seat: "seats", space: "spaces", "parking space": "parking spaces", parcel: "parcels",
  resident: "residents", vehicle: "vehicles", trip: "trips", "daily trip": "daily trips", building: "buildings",
  signal: "signals", roundabout: "roundabouts", employee: "employees", job: "jobs", student: "students",
};

/** "5,208-acre" → value "5,208", unit "acres" (the unit is only re-inflected
 * for the label; the sentence shown underneath keeps the original words). */
function unitLabel(value: string, unit: string): string {
  const u = unit.toLowerCase().replace(/\s+/g, " ");
  return value === "1" ? u : (PLURAL_UNITS[u] ?? u);
}

function sentenceAround(text: string, start: number, end: number): [number, number] {
  // Sentence boundary: ". " followed by a capital/digit, not after a short abbreviation.
  const boundary = /(?<!\b(?:St|Rd|Dr|Ave|Blvd|Pkwy|Ln|Ct|No|Inc|Co|U\.S|Mr|Ms|Mrs|Dr|vs|approx|e\.g|i\.e))[.!?]\s+(?=["“(]?[A-Z0-9])/g;
  let s = 0;
  let e = text.length;
  for (const m of text.matchAll(boundary)) {
    const cut = m.index + 1;
    if (cut <= start) s = m.index + m[0].length;
    else if (cut >= end) {
      e = cut;
      break;
    }
  }
  return [s, e];
}

function metricContext(runs: InlineRun[], start: number, end: number): { context: string; refs: number[] } {
  const full = plainText(runs);
  const [s, e] = sentenceAround(full, start, end);
  // Rebuild the sentence without citation markers, keeping their refs.
  let pos = 0;
  let text = "";
  const refs: number[] = [];
  let valueAt = 0;
  for (const r of runs) {
    const rs = pos;
    const re = pos + r.text.length;
    pos = re;
    if (re <= s || rs >= e) continue;
    if (r.cite) {
      if (r.cite.ref && !refs.includes(r.cite.ref)) refs.push(r.cite.ref);
      continue;
    }
    if (rs <= start && start < re) valueAt = text.length + (start - Math.max(rs, s));
    text += r.text.slice(Math.max(0, s - rs), Math.min(r.text.length, e - rs));
  }
  // Narrow to the clause holding the figure ("…homes; Verdana is ~80% built
  // out…" → "Verdana is ~80% built out…"), keeping the clause before it when
  // the figure's own clause is too short to stand alone.
  const bounds = [0];
  for (const m of text.matchAll(/;\s+|\s+[—–]\s+|\s+-\s+/g)) bounds.push(m.index, m.index + m[0].length);
  bounds.push(text.length);
  const clauses: Array<[number, number]> = [];
  for (let i = 0; i < bounds.length; i += 2) clauses.push([bounds[i], bounds[i + 1]]);
  const ci = Math.max(0, clauses.findIndex(([a, b]) => valueAt >= a && valueAt < b));
  let [cs, ce] = clauses[ci] ?? [0, text.length];
  if (ce - cs < 45 && ci > 0) cs = clauses[ci - 1][0];
  valueAt -= cs;
  text = text.slice(cs, ce);
  text = text.replace(/\s+([,.;:!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
  if (text && /[a-z]/.test(text[0])) text = text[0].toUpperCase() + text.slice(1);
  const max = 150;
  if (text.length > max) {
    const from = Math.max(0, Math.min(valueAt - 50, text.length - max));
    let slice = clipText(text.slice(from), max);
    if (from > 0) slice = `…${slice.replace(/^\S*\s/, "")}`;
    text = slice;
  }
  return { context: text, refs };
}

/**
 * Figures for "At a Glance": dollar amounts, percentages, counts with a unit
 * ("4 lanes", "10,000 dwelling units") and bolded vote tallies — each copied
 * verbatim with the sentence it came from. At most one figure per sentence,
 * so no two cards share the same caption.
 */
function extractMetrics(paragraphs: InlineRun[][]): Metric[] {
  const found: Metric[] = [];
  const seenValues = new Set<string>();
  const usedSentences = new Set<string>();
  paragraphs.forEach((runs, pi) => {
    const fullText = plainText(runs);
    const candidates: Array<{ value: string; unit: string; start: number; end: number }> = [];
    let pos = 0;
    for (const r of runs) {
      const start = pos;
      pos += r.text.length;
      if (r.cite || r.href || r.code) continue;
      const t = r.text.trim();
      const s = start + (r.text.length - r.text.trimStart().length);
      const e = s + t.length;
      let m: RegExpExecArray | null;
      if (r.bold && (MONEY.test(t) || PERCENT.test(t))) candidates.push({ value: t, unit: "", start: s, end: e });
      else if (r.bold && (m = QUANTITY.exec(t))) candidates.push({ value: m[1], unit: unitLabel(m[1], m[2]), start: s, end: e });
      else if (r.bold && (m = VOTE.exec(t))) {
        const [ss, se] = sentenceAround(fullText, s, e);
        if (/\bvot(?:e|ed|ing)\b/i.test(fullText.slice(ss, se))) {
          candidates.push({ value: `${m[1]}–${m[2]}`, unit: "vote", start: s, end: e });
        }
      } else {
        for (const mm of r.text.matchAll(FIGURES_IN_TEXT)) {
          const g = mm.groups ?? {};
          const at = start + mm.index;
          if (g.money) candidates.push({ value: g.money.trim(), unit: "", start: at, end: at + mm[0].length });
          else if (g.pct) candidates.push({ value: g.pct.replace(/\s?percent$/i, "%"), unit: "", start: at, end: at + mm[0].length });
          else if (g.qty && g.num && g.unit) {
            candidates.push({ value: g.num, unit: unitLabel(g.num, g.unit), start: at, end: at + mm[0].length });
          }
        }
      }
    }
    candidates.sort((a, b) => a.start - b.start);
    for (const c of candidates) {
      const [ss] = sentenceAround(fullText, c.start, c.end);
      const sentenceKey = `${pi}:${ss}`;
      // "120 spaces" and "120 parking spaces" are the same figure.
      const headNoun = c.unit.split(" ").pop() ?? "";
      const valueKey = `${c.value}|${headNoun}`.toLowerCase();
      if (usedSentences.has(sentenceKey) || seenValues.has(valueKey)) continue;
      usedSentences.add(sentenceKey);
      seenValues.add(valueKey);
      found.push({ value: c.value, unit: c.unit, ...metricContext(runs, c.start, c.end) });
    }
  });
  return found;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

export function buildReport(message: ChatMessage, options: BuildReportOptions = {}): Report {
  const now = options.now ?? new Date();
  const question = cleanInline(options.question ?? message.question ?? "");
  const cards = message.cards ?? [];
  const timeline = (message.timeline ?? []).filter((t) => cleanInline(t.date) || cleanInline(t.event));
  const related = (message.related ?? []).filter((r) => cleanInline(r.oneLine));

  const registry = new SourceRegistry();
  registry.addCards(cards);

  const knownIds = new Set(
    [
      ...(message.usedRecordIds ?? []),
      ...cards.map((c) => c.id),
      ...timeline.map((t) => t.recordId),
      ...related.map((r) => r.recordId),
    ]
      .map((id) => cleanInline(id))
      .filter(Boolean),
  );
  const cites: CitationResolver = {
    isKnown: (id) => knownIds.has(id),
    refFor: (id) => registry.refForId(id),
  };

  // ── Summary + body ───────────────────────────
  const prose = message.prose ?? "";
  const { bottomLine, rest } = splitBottomLine(prose);
  const parsedSummary = bottomLine !== null ? parseMarkdown(bottomLine, cites) : null;
  const parsedBody = parseMarkdown(bottomLine !== null ? rest : prose, cites);
  let body = parsedBody.blocks;
  let summary: InlineRun[] | null = null;
  if (parsedSummary) {
    const paras = parsedSummary.blocks.filter((b) => b.type === "paragraph");
    summary = paras.length ? mergeRuns(paras.flatMap((p, i) => (i ? [{ text: " " }, ...p.runs] : p.runs))) : null;
  } else if (body[0]?.type === "paragraph") {
    summary = body[0].runs;
    body = body.slice(1);
  }
  for (const link of [...(parsedSummary?.links ?? []), ...parsedBody.links]) registry.addLink(link.href, link.label);
  registry.addSourceStrings(message.sources ?? []);

  // ── Part one: the answer ─────────────────────
  const answerSections: ReportSection[] = [];
  const glanceSource: InlineRun[][] = [];
  if (summary) glanceSource.push(summary);
  forEachRunList(body, (runs) => glanceSource.push(runs));
  const metrics = extractMetrics(glanceSource);
  if (metrics.length >= 2) {
    answerSections.push({ kind: "metrics", id: "at-a-glance", title: "At a Glance", items: metrics.slice(0, 4) });
  }

  const hasStructuredTimeline = timeline.length > 0;
  groupByHeading(body).forEach((group, gi) => {
    const heading = group.heading ? plainText(group.heading).trim() : "";
    const id = `section-${gi + 1}`;
    if (!group.blocks.length) return;
    const shape = listShape(group.blocks);
    if (shape) {
      const dated = hasStructuredTimeline ? null : datedItems(shape.list, now);
      if (dated) {
        if (shape.intro.length) answerSections.push({ kind: "details", id: `${id}-intro`, title: heading || "Key Details", blocks: shape.intro });
        const allFuture = dated.every((d) => d.tense === "future");
        answerSections.push({
          kind: "timeline",
          id,
          title: shape.intro.length || !heading ? (allFuture ? "Upcoming Schedule" : "Dated Items") : heading,
          subtitle: allFuture
            ? "As listed when the answer was generated. Confirm details with the organizer before attending."
            : "Dates as written in the answer.",
          items: dated,
          hasFuture: dated.some((d) => d.tense === "future"),
        });
        if (shape.outro.length) answerSections.push({ kind: "details", id: `${id}-outro`, title: "Key Details", blocks: shape.outro });
        return;
      }
      if (shape.list.items.length >= 2) {
        answerSections.push({
          kind: "findings",
          id,
          title: heading || "Key Findings",
          intro: shape.intro,
          items: shape.list.items.map(findingFromItem),
          outro: shape.outro,
        });
        return;
      }
    }
    answerSections.push({ kind: "details", id, title: heading || (gi === 0 ? "Key Details" : "Details"), blocks: group.blocks });
  });

  const followUps = (message.followUps ?? []).map(cleanInline).filter(Boolean);
  if (followUps.length) {
    answerSections.push({ kind: "followups", id: "follow-ups", title: "Questions to Explore Next", items: followUps.slice(0, 4) });
  }

  // ── Part two: evidence & context ─────────────
  const evidenceSections: ReportSection[] = [];
  const timelineUnlinked = new Set<string>();
  if (hasStructuredTimeline) {
    const dated = timeline.map((t, index) => {
      const citeId = cleanInline(t.recordId);
      const rawDate = cleanInline(t.date);
      const status = cleanInline(t.status);
      const span = rawDate ? parseDateExpression(rawDate, now) : null;
      const item: TimelineItem = {
        dateLabel: formatDateLabel(rawDate) || "Date not stated",
        tense: tenseOf(span, now),
        event: parseInline(t.event, cites),
        status,
        statusKind: statusKindOf(status),
        recordId: displayRecordId(citeId),
        ref: citeId ? registry.refForId(citeId) : null,
      };
      return { item, span, index, citeId };
    });
    // The answer model is asked for oldest→newest but doesn't always comply;
    // when every date parses, show them in true chronological order.
    if (dated.every((d) => d.span)) {
      dated.sort((a, b) => a.span!.start.getTime() - b.span!.start.getTime() || a.index - b.index);
    }
    for (const d of dated) if (d.citeId && d.item.ref === null && !isInternalRecordId(d.citeId)) timelineUnlinked.add(d.citeId);
    const items = dated.map((d) => d.item);
    const hasFuture = items.some((i) => i.tense === "future");
    evidenceSections.push({
      kind: "timeline",
      id: "timeline",
      title: "Timeline of Developments",
      subtitle: hasFuture
        ? `Entries dated after ${formatShortDate(now)} are scheduled or projected as reported, not guaranteed.`
        : "Dated milestones from the cited records.",
      items,
      hasFuture,
    });
  }

  const meetingRefs = registry.entries.filter((e) => isMeetingRecord(e.kind)).map((e) => e.n);
  if (meetingRefs.length) {
    const groups: Array<{ date: string; isMeeting: boolean; records: number[] }> = [];
    for (const n of meetingRefs) {
      const date = registry.get(n).date;
      const g = date ? groups.find((x) => x.date === date) : undefined;
      if (g) g.records.push(n);
      else groups.push({ date, isMeeting: false, records: [n] });
    }
    groups.forEach((g) => (g.isMeeting = !!g.date && g.records.length > 1));
    const kinds = meetingRefs.map((n) => registry.get(n).statusKind);
    const hasDecision = kinds.some((k) => k === "approved" || k === "denied" || k === "continued");
    const notes: string[] = [];
    // The structured (count) route returns the first matches only.
    const matched = Number(message.feedbackMeta?.matched_rows);
    if (Number.isFinite(matched) && matched > meetingRefs.length) {
      notes.push(`The answer lists ${meetingRefs.length} of ${matched.toLocaleString("en-US")} matching records; the rest are not included in this brief.`);
    }
    if (kinds.includes("nodecision")) {
      notes.push("“No decision recorded” means the cited minutes show no vote on the item. It is neither an approval nor a denial.");
    }
    evidenceSections.push({
      kind: "decisions",
      id: "meeting-records",
      title: hasDecision ? "Decisions on Record" : "Meeting Records",
      subtitle: "As recorded in the cited meeting records",
      note: notes.join(" "),
      groups,
      comparison: meetingRefs.length >= 3 ? meetingRefs : [],
    });
  }

  const evidenceRefs = registry.entries
    .filter((e) => e.kind === "article" || e.kind === "page" || e.kind === "event" || e.kind === "document")
    .map((e) => e.n);
  if (evidenceRefs.length) {
    evidenceSections.push({
      kind: "evidence",
      id: "evidence",
      title: "Supporting Evidence",
      subtitle: "Open the original reporting and documents",
      refs: evidenceRefs,
    });
  }

  if (related.length) {
    evidenceSections.push({
      kind: "related",
      id: "related",
      title: "Related Records",
      note: "Mentioned for context. These records were not cited as support for the answer above.",
      items: related.map((r) => {
        const citeId = cleanInline(r.recordId);
        return { recordId: displayRecordId(citeId), text: cleanInline(r.oneLine), ref: citeId ? registry.refForId(citeId) : null };
      }),
    });
  }

  // ── Citations that came without a source document ──
  const unlinked = new Set<string>(timelineUnlinked);
  const noteUnlinked = (runs: InlineRun[]) => {
    for (const r of runs) if (r.cite && r.cite.ref === null && !isInternalRecordId(r.cite.recordId)) unlinked.add(r.cite.recordId);
  };
  if (summary) noteUnlinked(summary);
  forEachRunList(body, noteUnlinked);
  for (const s of evidenceSections) if (s.kind === "timeline") s.items.forEach((item) => noteUnlinked(item.event));

  // ── Notices ──────────────────────────────────
  const notices: Notice[] = [];
  const basis = message.sourceType ?? "records";
  if (basis === "general") {
    notices.push({
      tone: "caution",
      title: "General information",
      text: "This answer was not drawn from Village meeting records or EsteroToday reporting. Confirm current details with the Village of Estero.",
    });
  } else if (basis === "mixed") {
    notices.push({
      tone: "info",
      title: "Mixed sources",
      text: "Parts of this answer add general context that does not come from the cited records.",
    });
  }
  // The backend's age warning is computed from the records it retrieved; only
  // repeat it when this answer actually cites records.
  const staleNotice = cleanInline(String(message.feedbackMeta?.stale_notice ?? ""));
  if (staleNotice && basis !== "general" && registry.entries.length > 0) {
    notices.push({ tone: "caution", title: "Older records", text: staleNotice });
  }

  return {
    title: reportTitle(question),
    kicker: reportKicker(question),
    designation: REPORT_DESIGNATION,
    question,
    generatedAt: now,
    generatedLabel: formatLongDate(now),
    filename: reportFilename(question),
    summary: summary && summary.length ? summary : null,
    notices,
    answerSections,
    evidenceSections,
    sources: registry.entries,
    unlinkedCitations: [...unlinked],
    answerBasis: basis,
  };
}
