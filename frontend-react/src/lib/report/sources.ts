/**
 * Source entries for the report, built only from metadata that came with the
 * answer: the record cards (backend rag_path.build_cards — already filtered to
 * records the answer cited, in citation order), links written in the answer
 * text, and any plain `sources` strings. Missing fields stay empty; nothing
 * is guessed.
 */
import type { NormalizedCard } from "../../types";
import type { SourceEntry, SourceKind } from "./model";
import { statusKindOf } from "./markdown";
import { cleanInline, formatDateLabel } from "./text";
import { displayUrl, hostOf, isSafeHref, orgForUrl } from "./urls";

function kindOfCard(card: NormalizedCard): SourceKind {
  const t = String(card.sourceType || "");
  if (t === "village_council") return "village_council";
  if (t === "board_record") return "board_record";
  if (t === "website_article") return "article";
  if (t === "website_page") return "page";
  if (t === "event") return "event";
  if (t === "document") return "document";
  // Same fallback as parseAnswer.isArticle: an article link without minutes.
  return card.articleUrl && !card.documentUrl ? "article" : "board_record";
}

function kindLabel(kind: SourceKind, org: string): string {
  switch (kind) {
    case "board_record":
      return "Board record";
    case "village_council":
      return "Village Council record";
    case "article":
      return org === "EsteroToday" ? "EsteroToday article" : "News article";
    case "page":
      return "Web page";
    case "event":
      return "Event listing";
    case "document":
      return "Document";
    case "link":
      return "Linked page";
    case "note":
      return "Source note";
  }
}

export const isMeetingRecord = (kind: SourceKind) => kind === "board_record" || kind === "village_council";

/** Same rule as backend retrieval.is_internal_record_id: synthetic "row-N"
 * keys and the URLs legacy articles are keyed by mean nothing to a reader,
 * so they are used for citation matching but never displayed. */
export function isInternalRecordId(id: string | null | undefined): boolean {
  const rid = String(id ?? "");
  return rid.startsWith("row-") || rid.startsWith("http://") || rid.startsWith("https://");
}

/** A record ID as shown to readers ("" for internal IDs). */
export function displayRecordId(id: string | null | undefined): string {
  const rid = cleanInline(id);
  return isInternalRecordId(rid) ? "" : rid;
}

function linkLabel(kind: SourceKind, url: string): string {
  if (!url) return "";
  const pdf = /\.pdf(?:$|[?#])/i.test(url);
  switch (kind) {
    case "board_record":
    case "village_council":
      return pdf ? "Open minutes (PDF)" : "View minutes";
    case "article":
      return "Read article";
    case "event":
      return "View event";
    case "document":
      return pdf ? "Open document (PDF)" : "Open document";
    default:
      return pdf ? "Open PDF" : "Open page";
  }
}

function fromCard(card: NormalizedCard): Omit<SourceEntry, "n"> {
  const kind = kindOfCard(card);
  const meeting = isMeetingRecord(kind);
  const candidates = meeting
    ? [card.pdfUrl, card.documentUrl, card.articleUrl]
    : [card.articleUrl, card.documentUrl, card.pdfUrl];
  const url = candidates.find((u) => isSafeHref(u)) || "";
  const org = url ? orgForUrl(url) : "";
  const recordId = displayRecordId(card.id);
  const status = meeting ? cleanInline(card.status) : "";
  return {
    kind,
    kindLabel: kindLabel(kind, org),
    title: cleanInline(card.title) || (recordId ? `Record ${recordId}` : url ? displayUrl(url) : "Untitled source"),
    org,
    date: formatDateLabel(meeting ? card.date || card.publishDate : card.publishDate || card.date),
    recordId,
    location: cleanInline(card.location),
    status,
    statusKind: statusKindOf(status),
    summary: cleanInline(card.summary),
    url,
    linkLabel: linkLabel(kind, url),
  };
}

function fromLink(href: string, label: string): Omit<SourceEntry, "n"> {
  const org = orgForUrl(href);
  return {
    kind: "link",
    kindLabel: kindLabel("link", org),
    title: cleanInline(label) || displayUrl(href, 70),
    org,
    date: "",
    recordId: "",
    location: "",
    status: "",
    statusKind: null,
    summary: "",
    url: href,
    linkLabel: linkLabel("link", href),
  };
}

function fromNote(text: string): Omit<SourceEntry, "n"> {
  return {
    kind: "note",
    kindLabel: kindLabel("note", ""),
    title: cleanInline(text),
    org: "",
    date: "",
    recordId: "",
    location: "",
    status: "",
    statusKind: null,
    summary: "",
    url: "",
    linkLabel: "",
  };
}

const normUrl = (u: string) => u.trim().replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();

export class SourceRegistry {
  readonly entries: SourceEntry[] = [];
  private byId = new Map<string, number>();
  private byKey = new Map<string, number>();
  private urls = new Set<string>();

  /** Several agenda items from one meeting share the same minutes PDF, so a
   * meeting record without an ID is keyed by URL *and* title. */
  private keyOf(entry: Omit<SourceEntry, "n">): string {
    if (!entry.url) return `note:${entry.title.toLowerCase()}`;
    return isMeetingRecord(entry.kind) ? `${normUrl(entry.url)}|${entry.title.toLowerCase()}` : normUrl(entry.url);
  }

  /** `citeId` is the raw ID the answer cites (may be internal); the entry's
   * own recordId is the display form. */
  private add(entry: Omit<SourceEntry, "n">, citeId = entry.recordId): number {
    const key = this.keyOf(entry);
    const existing = (citeId ? this.byId.get(citeId) : undefined) ?? this.byKey.get(key);
    if (existing) {
      if (citeId && !this.byId.has(citeId)) this.byId.set(citeId, existing);
      return existing;
    }
    const n = this.entries.length + 1;
    this.entries.push({ ...entry, n });
    if (citeId) this.byId.set(citeId, n);
    this.byKey.set(key, n);
    if (entry.url) this.urls.add(normUrl(entry.url));
    return n;
  }

  addCards(cards: NormalizedCard[]): void {
    for (const card of cards) {
      const entry = fromCard(card);
      const citeId = cleanInline(card.id);
      // A card with neither a title, an ID nor a link identifies nothing.
      if (!citeId && !entry.url && entry.title === "Untitled source") continue;
      this.add(entry, citeId);
    }
  }

  addLink(href: string, label: string): void {
    if (!isSafeHref(href) || !hostOf(href)) return;
    if (this.urls.has(normUrl(href))) return; // already listed via a record card
    this.add(fromLink(href, label));
  }

  addSourceStrings(sources: string[]): void {
    for (const raw of sources) {
      const s = cleanInline(raw);
      if (!s) continue;
      if (isSafeHref(s)) this.addLink(s, "");
      else this.add(fromNote(s));
    }
  }

  refForId(recordId: string): number | null {
    return this.byId.get(recordId) ?? null;
  }

  get(n: number): SourceEntry {
    return this.entries[n - 1];
  }
}
