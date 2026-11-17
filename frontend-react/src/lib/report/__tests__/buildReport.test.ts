import { describe, expect, it } from "vitest";
import { buildReport } from "../buildReport";
import type { Block, InlineRun, Report, ReportSection } from "../model";
import { isCovered, plainText } from "../text";
import { loadFixture, NOW, REAL_FIXTURES } from "./helpers";
import { SYNTHETIC } from "./synthetic";

const build = (name: (typeof REAL_FIXTURES)[number]) => buildReport(loadFixture(name), { now: NOW });
const sections = (r: Report) => [...r.answerSections, ...r.evidenceSections];
const ofKind = <K extends ReportSection["kind"]>(r: Report, kind: K) =>
  sections(r).filter((s): s is Extract<ReportSection, { kind: K }> => s.kind === kind);

/** Every string the renderer will draw. */
function allStrings(r: Report): string[] {
  const out: string[] = [r.title, r.kicker, r.designation, r.generatedLabel];
  const runs = (rs: InlineRun[] | null) => rs && out.push(plainText(rs));
  const blocks = (bs: Block[]) => {
    for (const b of bs) {
      if (b.type === "paragraph" || b.type === "heading") runs(b.runs);
      else if (b.type === "list") b.items.forEach((i) => blocks(i.blocks));
      else if (b.type === "quote") blocks(b.blocks);
      else if (b.type === "table") [b.header, ...b.rows].forEach((row) => row.forEach(runs));
      else if (b.type === "code") out.push(b.text);
    }
  };
  runs(r.summary);
  r.notices.forEach((n) => out.push(n.title, n.text));
  for (const s of sections(r)) {
    out.push(s.title);
    if (s.kind === "details") blocks(s.blocks);
    if (s.kind === "findings") s.items.forEach((f) => (runs(f.title), runs(f.body), blocks(f.extra)));
    if (s.kind === "timeline") s.items.forEach((i) => (out.push(i.dateLabel, i.status), runs(i.event)));
    if (s.kind === "metrics") s.items.forEach((m) => out.push(m.value, m.unit, m.context));
    if (s.kind === "related") s.items.forEach((i) => out.push(i.recordId, i.text));
    if (s.kind === "followups") out.push(...s.items);
  }
  r.sources.forEach((s) => out.push(s.title, s.org, s.date, s.recordId, s.location, s.status, s.summary, s.kindLabel));
  return out;
}

const normalize = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

describe("accuracy invariants on every captured answer", () => {
  it.each(REAL_FIXTURES)("%s: nothing is invented", (name) => {
    const msg = loadFixture(name);
    const r = buildReport(msg, { now: NOW });
    const answerText = normalize([msg.prose, ...(msg.timeline ?? []).map((t) => t.event)].join(" "));

    // Figures are copied verbatim from the answer.
    for (const s of ofKind(r, "metrics")) {
      for (const m of s.items) expect(answerText).toContain(m.value.toLowerCase());
      expect(s.items.length).toBeGreaterThanOrEqual(2);
    }

    // Every source comes from a card, a link in the answer, or a sources string.
    const cardUrls = (msg.cards ?? []).flatMap((c) => [c.articleUrl, c.documentUrl, c.pdfUrl]).filter(Boolean);
    for (const s of r.sources) {
      if (!s.url) continue;
      expect(cardUrls.includes(s.url) || (msg.prose ?? "").includes(s.url) || (msg.sources ?? []).includes(s.url)).toBe(true);
    }

    // Meeting outcomes and timeline statuses are exactly what the backend sent.
    const cardStatus = new Map((msg.cards ?? []).map((c) => [c.title.trim(), c.status]));
    for (const s of r.sources.filter((x) => x.kind === "board_record" || x.kind === "village_council")) {
      expect(s.status).toBe(cardStatus.get(s.title) ?? s.status);
    }
    const sentStatuses = (msg.timeline ?? []).map((t) => t.status).sort();
    const shownStatuses = ofKind(r, "timeline").filter((t) => t.id === "timeline").flatMap((t) => t.items.map((i) => i.status)).sort();
    if (msg.timeline?.length) expect(shownStatuses).toEqual(sentStatuses);

    // Internal IDs (row-N, URL keys) are never displayed.
    for (const s of r.sources) expect(s.recordId).not.toMatch(/^(row-\d+|https?:)/);

    // Citation numbers always point at a real source.
    const json = JSON.stringify(r);
    for (const m of json.matchAll(/"ref":(\d+)/g)) expect(Number(m[1])).toBeLessThanOrEqual(r.sources.length);

    // No empty sections, and every string is drawable by the embedded fonts.
    for (const s of sections(r)) {
      const size =
        s.kind === "details" ? s.blocks.length : s.kind === "evidence" ? s.refs.length : s.kind === "decisions" ? s.groups.length : s.items.length;
      expect(size).toBeGreaterThan(0);
    }
    for (const str of allStrings(r)) {
      for (const ch of str) expect(isCovered(ch.codePointAt(0)!), `U+${ch.codePointAt(0)!.toString(16)} in "${str}"`).toBe(true);
    }
  });
});

describe("composition follows the answer's content", () => {
  it("sports park: summary-only answer → no findings; evidence carries the detail", () => {
    const r = build("sports-park-traffic");
    expect(plainText(r.summary)).toMatch(/^Yes, traffic on Williams Road is expected to increase/);
    expect(ofKind(r, "findings")).toHaveLength(0);
    expect(ofKind(r, "metrics")).toHaveLength(0);
    expect(r.kicker).toBe("A Community Mobility Brief");
    expect(r.filename).toBe("Engage-Estero-Sports-Park-Traffic-Williams-Road-Report.pdf");

    // Timeline re-ordered chronologically (the model sent Apr 2025 before Feb 2025).
    const tl = ofKind(r, "timeline")[0];
    expect(tl.items.map((i) => i.dateLabel)).toEqual(["Dec 10, 2024", "Feb 5, 2025", "Apr 2, 2025", "Oct 22, 2026"]);

    // Two board records with no vote → "Meeting Records", never "Decisions".
    const meetings = ofKind(r, "decisions")[0];
    expect(meetings.title).toBe("Meeting Records");
    expect(meetings.note).toMatch(/neither an approval nor a denial/);
    expect(meetings.groups.flatMap((g) => g.records).map((n) => r.sources[n - 1].status)).toEqual([
      "No decision recorded",
      "No decision recorded",
    ]);
    expect(ofKind(r, "evidence")[0].refs.map((n) => r.sources[n - 1].kindLabel)).toEqual(["EsteroToday article", "EsteroToday article"]);
  });

  it("corkscrew: label paragraphs become topic sections; figures with their clause", () => {
    const r = build("corkscrew-developments");
    expect(ofKind(r, "findings").map((s) => s.title)).toEqual(["Residential & Mixed-Use", "Infrastructure & Services"]);
    const first = ofKind(r, "findings")[0].items[0];
    expect(plainText(first.title)).toBe("River Creek, Wild Blue, The Preserve at Corkscrew, The Place at Corkscrew, Verdana Village");
    expect(plainText(first.body)).toMatch(/^Master-planned communities/);

    const glance = ofKind(r, "metrics")[0].items;
    expect(glance.map((m) => [m.value, m.unit])).toEqual([
      ["80%", ""],
      ["10,000", "dwelling units"],
      ["5,208", "acres"],
    ]);
    expect(glance[0].context).toBe("Verdana is approximately 80% built out as of January 2026.");

    // [post-222997] citations resolve to that article's reference number.
    const ref = r.sources.findIndex((s) => s.url.includes("east-corkscrew-road-development-infrastructure")) + 1;
    const infra = ofKind(r, "findings")[1].items[0];
    expect(infra.refs).toEqual([ref]);

    // Past vs current vs future targets.
    const tl = ofKind(r, "timeline")[0];
    const tense = Object.fromEntries(tl.items.map((i) => [i.dateLabel, i.tense]));
    expect(tense).toMatchObject({ "Feb 21, 2024": "past", "Jun 2026": "past", "Fall 2026": "current", "December 2026": "future" });
    expect(tl.hasFuture).toBe(true);
    expect(tl.subtitle).toMatch(/not guaranteed/);
  });

  it("weekend events: date-led bullets become an upcoming schedule; links become references", () => {
    const r = build("weekend-events");
    expect(r.summary).toBeNull();
    const schedule = ofKind(r, "timeline")[0];
    expect(schedule.title).toBe("Upcoming Schedule");
    expect(schedule.items.map((i) => i.dateLabel)).toEqual([
      "Sat Nov 21 (all day)",
      "Sat Nov 21 10:00 AM",
      "Sat Nov 21 10:00 AM",
      "Sun Nov 22 1:00 PM",
    ]);
    expect(schedule.items.every((i) => i.tense === "future")).toBe(true);
    expect(plainText(schedule.items[0].event)).toMatch(/^Adopt-a-Highway Pickup at US 41/);
    expect(r.sources.map((s) => s.org)).toEqual(["EsteroToday", "EsteroToday", "EsteroToday", "fgcuathletics.com"]);
    expect(ofKind(r, "evidence")).toHaveLength(0);
  });

  it("structured count: meeting groups, comparison table and an honest partial-list note", () => {
    const r = build("approved-2024-count");
    expect(plainText(r.summary)).toBe("Found 138 matching records in the official dataset.");
    expect(r.kicker).toBe("A Public Meetings Brief");
    const d = ofKind(r, "decisions")[0];
    expect(d.title).toBe("Decisions on Record");
    expect(d.note).toContain("10 of 138 matching records");
    expect(d.comparison).toHaveLength(10);
    expect(d.groups.map((g) => [g.date, g.isMeeting, g.records.length])).toEqual([
      ["Jan 3, 2024", true, 5],
      ["Jan 24, 2024", true, 5],
    ]);
    // Items sharing one minutes PDF stay separate sources.
    expect(new Set(r.sources.map((s) => s.url)).size).toBeLessThan(r.sources.length);
    expect(r.sources).toHaveLength(10);
  });

  it("general answer: caution notice, no sources, stale warning suppressed", () => {
    const r = build("council-last-meeting");
    expect(r.answerBasis).toBe("general");
    expect(r.notices.map((n) => n.title)).toEqual(["General information"]);
    expect(r.sources).toHaveLength(0);
    expect(ofKind(r, "related")[0].items.map((i) => i.recordId)).toEqual(["", "page-26679"]);
  });

  it("special exception: findings keep intro/outro text; no-decision is never an approval", () => {
    const r = build("special-exception");
    const f = ofKind(r, "findings")[0];
    expect(f.title).toBe("Examples from Estero");
    expect(f.items).toHaveLength(2);
    expect(plainText((f.outro[0] as Extract<Block, { type: "paragraph" }>).runs)).toMatch(/^Unlike a variance/);
    const d = ofKind(r, "decisions")[0];
    expect(d.comparison.map((n) => r.sources[n - 1].status)).toEqual(["Approved", "No decision recorded", "No decision recorded"]);
    expect(r.notices.map((n) => n.title)).toEqual(["Older records"]);
  });

  it("wawa: short answer stays short — one source, no filler sections", () => {
    const r = build("wawa-corkscrew");
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0]).toMatchObject({ recordId: "DOS2022-E016", status: "Approved", date: "Aug 22, 2023", org: "Village of Estero" });
    expect(sections(r).map((s) => s.kind)).toEqual(["details", "followups", "timeline", "decisions"]);
    const cite = r.summary!.find((x) => x.cite);
    expect(cite?.cite).toEqual({ recordId: "DOS2022-E016", ref: 1 });
  });
});

describe("edge cases", () => {
  it("no dates or numbers → no glance figures, no timeline", () => {
    const r = buildReport(SYNTHETIC.noDatesNoNumbers, { now: NOW });
    expect(sections(r).map((s) => s.kind)).toEqual(["findings", "followups"]);
    expect(r.notices[0].title).toBe("General information");
  });

  it("special characters are kept where drawable and translated otherwise", () => {
    const r = buildReport(SYNTHETIC.specialCharacters, { now: NOW });
    const summary = plainText(r.summary);
    expect(summary).toContain("“Café & Piñata Plaza”");
    expect(summary).toContain("->");
    expect(summary).toContain("≥ 120");
    expect(summary).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(r.title.startsWith("Was the Café & Piñata Plaza")).toBe(true);
    expect(r.filename).toMatch(/^Engage-Estero-[A-Za-z0-9-]+-Report\.pdf$/);
    // The javascript: link is dropped (its words kept); the long URL is shortened in text.
    const json = JSON.stringify(r);
    expect(json).not.toContain("javascript:");
    expect(r.sources.some((s) => s.url.startsWith("https://example.org/planning/applications/2026"))).toBe(true);
    // "120 spaces" and "120 parking spaces" are one figure.
    expect(ofKind(r, "metrics")[0].items.filter((m) => m.value === "120")).toHaveLength(1);
  });

  it("incomplete citation metadata is reported, never filled in", () => {
    const r = buildReport(SYNTHETIC.missingMetadata, { now: NOW });
    expect(r.sources.map((s) => [s.title, s.url, s.date])).toEqual([
      ["Record TEST-0100", "", ""],
      ["Article with no date", "https://example.org/news/article", ""],
      ["example.org/extra-source", "https://example.org/extra-source", ""],
      ["Staff memo (no link)", "", ""],
    ]);
    expect(r.unlinkedCitations.sort()).toEqual(["TEST-0300", "TEST-0999"]);
    const summaryCites = r.summary!.filter((x) => x.cite).map((x) => x.cite);
    expect(summaryCites).toEqual([
      { recordId: "TEST-0100", ref: 1 },
      { recordId: "TEST-0200", ref: 2 },
      { recordId: "TEST-0300", ref: null },
    ]);
    const tl = ofKind(r, "timeline")[0];
    expect(tl.items.map((i) => [i.dateLabel, i.tense])).toEqual([
      ["Date not stated", "unknown"],
      ["Spring 2027", "future"],
    ]);
    expect(r.notices.map((n) => n.title)).toEqual(["Mixed sources"]);
  });

  it("bracketed text that is not a cited ID stays ordinary text", () => {
    const msg = { ...SYNTHETIC.noDatesNoNumbers, prose: "**Bottom line:** See [Section 3] of the code [TEST-9]." };
    const r = buildReport(msg, { now: NOW });
    expect(r.summary!.some((x) => x.cite)).toBe(false);
    expect(plainText(r.summary)).toBe("See [Section 3] of the code [TEST-9].");
  });

  it("an answer without a Bottom line uses its lead paragraph as the summary", () => {
    const msg = { ...SYNTHETIC.noDatesNoNumbers, prose: "First paragraph answer.\n\nSecond paragraph detail." };
    const r = buildReport(msg, { now: NOW });
    expect(plainText(r.summary)).toBe("First paragraph answer.");
    expect(ofKind(r, "details")[0].blocks).toHaveLength(1);
  });

  it("a long answer keeps every bullet", () => {
    const r = buildReport(SYNTHETIC.longAnswer, { now: NOW });
    const findings = ofKind(r, "findings");
    expect(findings.map((f) => f.title)).toEqual(["Group 1", "Group 2", "Group 3", "Group 4"]);
    expect(findings.reduce((n, f) => n + f.items.length, 0)).toBe(20);
  });
});
