import { describe, expect, it } from "vitest";
import { matchLeadingDate, parseDateExpression, tenseOf } from "../dates";
import { hyphenate, MAX_UNBROKEN } from "../pdf/fonts";
import { clipText, formatDateLabel, isCovered, sanitizeText } from "../text";
import { reportFilename, reportKicker, reportTitle } from "../title";
import { breakUrl, displayUrl, isSafeHref, orgForUrl, textWidth } from "../urls";
import { NOW } from "./helpers";

describe("sanitizeText", () => {
  it("keeps Latin text, typographic quotes and symbols the fonts have", () => {
    const s = "Café “quoted” — Łódź ≤ 5 • €10 ™";
    expect(sanitizeText(s)).toBe(s);
  });
  it("translates characters the fonts lack and drops pictographs", () => {
    expect(sanitizeText("A → B")).toBe("A -> B");
    expect(sanitizeText("Approved ✅ today 🚗!")).toBe("Approved today!");
    expect(sanitizeText("25′ setback")).toBe("25' setback");
    expect(sanitizeText("zero\u{200b}width")).toBe("zerowidth");
    expect(sanitizeText("evil\u{202e}txt.exe")).toBe("eviltxt.exe"); // bidi override dropped
    expect(sanitizeText("ạ")).toBe("a"); // Vietnamese ạ → base letter
    expect(sanitizeText("中")).toBe("?"); // no glyph and no base letter
  });
  it("only ever outputs drawable characters", () => {
    const nasty = "\u{0}\u{7}\t\u{ad}\u{feff}\u{2028}\u{1f600}\u{1f1fa}\u{1f1f8}\u{2190}\u{2194}\u{21d2}\u{2713}\u{3000}\u{34f}\u{fe0f}\u{202e}x";
    for (const ch of sanitizeText(nasty)) expect(isCovered(ch.codePointAt(0)!)).toBe(true);
  });
});

describe("text helpers", () => {
  it("clips at a word boundary with an ellipsis", () => {
    expect(clipText("one two three four five", 12)).toBe("one two…");
    expect(clipText("short", 12)).toBe("short");
  });
  it("re-formats only numeric dates", () => {
    expect(formatDateLabel("2022-07-12")).toBe("Jul 12, 2022");
    expect(formatDateLabel("07/12/2022")).toBe("Jul 12, 2022");
    expect(formatDateLabel("2026-06")).toBe("Jun 2026");
    expect(formatDateLabel("Fall 2026")).toBe("Fall 2026");
    expect(formatDateLabel("2025")).toBe("2025");
    expect(formatDateLabel("2022-02-30")).toBe("2022-02-30"); // invalid stays as written
  });
});

describe("dates", () => {
  it("parses the date shapes answers use", () => {
    const span = (s: string) => parseDateExpression(s, NOW);
    expect(span("2022-07-12")?.precision).toBe("day");
    expect(span("December 2026")?.precision).toBe("month");
    expect(span("Spring 2027")?.precision).toBe("season");
    expect(span("Q3 2026")?.precision).toBe("quarter");
    expect(span("early 2027")?.precision).toBe("season");
    expect(span("2025")?.precision).toBe("year");
    expect(span("not a date")).toBeNull();
    expect(span("2025 traffic study")).toBeNull();
  });
  it("reads event-listing dates without a year as the next occurrence", () => {
    const hit = matchLeadingDate("Sat Nov 21 10:00 AM: Art Festival", NOW);
    expect(hit?.span.start.getFullYear()).toBe(2026);
    expect("Sat Nov 21 10:00 AM: Art Festival".slice(0, hit!.length)).toBe("Sat Nov 21 10:00 AM");
    const january = matchLeadingDate("Jan 5: something", NOW);
    expect(january?.span.start.getFullYear()).toBe(2027);
  });
  it("distinguishes past, current and future", () => {
    expect(tenseOf(parseDateExpression("2024-12-10", NOW), NOW)).toBe("past");
    expect(tenseOf(parseDateExpression("Fall 2026", NOW), NOW)).toBe("current");
    expect(tenseOf(parseDateExpression("2026-11-17", NOW), NOW)).toBe("current");
    expect(tenseOf(parseDateExpression("Spring 2027", NOW), NOW)).toBe("future");
    expect(tenseOf(null, NOW)).toBe("unknown");
  });
});

describe("titles and filenames", () => {
  it("keeps the question's wording", () => {
    expect(reportTitle("will estero sports park affect traffic on williams road")).toBe(
      "Will estero sports park affect traffic on williams road?",
    );
    expect(reportTitle("Summarize the latest updates about Estero.")).toBe("The latest updates about Estero");
    expect(reportTitle("Can you tell me what the council decided?")).toBe("What the council decided");
    expect(reportTitle("   ")).toBe("Community Question");
  });
  it("builds descriptive, safe filenames", () => {
    expect(reportFilename("Will Estero Sports Park affect traffic on Williams Road?")).toBe(
      "Engage-Estero-Sports-Park-Traffic-Williams-Road-Report.pdf",
    );
    expect(reportFilename("What did the Village Council decide at its last meeting?")).toBe("Engage-Estero-Council-Last-Meeting-Report.pdf");
    expect(reportFilename("What developments are planned near Corkscrew Road?")).toBe(
      "Engage-Estero-Developments-Planned-Corkscrew-Road-Report.pdf",
    );
    expect(reportFilename("Summarize the latest updates about Estero.")).toBe("Engage-Estero-Latest-Updates-Report.pdf");
    expect(reportFilename("Café <script>/../../etc?")).toBe("Engage-Estero-Cafe-Script-Etc-Report.pdf");
    expect(reportFilename("???")).toBe("Engage-Estero-Civic-Intelligence-Report.pdf");
  });
  it("labels the brief by subject without affecting its sections", () => {
    expect(reportKicker("Will Estero Sports Park affect traffic on Williams Road?")).toBe("A Community Mobility Brief");
    expect(reportKicker("What did the Village Council decide at its last meeting?")).toBe("A Public Meetings Brief");
    expect(reportKicker("What developments are planned near Corkscrew Road?")).toBe("A Development Brief");
    expect(reportKicker("Summarize the latest updates about Estero.")).toBe("A Community Brief");
  });
});

describe("URLs", () => {
  const long = "https://estero-fl.gov/wp-content/uploads/library-ada/minutes/2024%20Minutes/PZDB/12102024%20PZDB%20Minutes.pdf";
  it("breaks long URLs into lines that fit, without changing a character", () => {
    const lines = breakUrl(long, 200, 7.4);
    expect(lines.join("")).toBe(long);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(textWidth(line, 7.4)).toBeLessThanOrEqual(200);
  });
  it("hard-splits a token wider than the line", () => {
    const token = `https://example.org/${"x".repeat(200)}`;
    const lines = breakUrl(token, 120, 8);
    expect(lines.join("")).toBe(token);
    for (const line of lines) expect(textWidth(line, 8)).toBeLessThanOrEqual(120);
  });
  it("shortens URLs for running text so they never need hyphenating", () => {
    const d = displayUrl(long);
    expect(d).toMatch(/^estero-fl\.gov\/…\//);
    expect(d.length).toBeLessThanOrEqual(MAX_UNBROKEN);
    expect(hyphenate(d)).toEqual([d]);
  });
  it("only links http(s) and mailto", () => {
    expect(isSafeHref("https://esterotoday.com")).toBe(true);
    expect(isSafeHref("mailto:a@example.org")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("/relative")).toBe(false);
  });
  it("names well-known publishers by host", () => {
    expect(orgForUrl("https://estero-fl.gov/x.pdf")).toBe("Village of Estero");
    expect(orgForUrl("https://www.esterotoday.com/a")).toBe("EsteroToday");
    expect(orgForUrl("https://fgcuathletics.com/c")).toBe("fgcuathletics.com");
  });
});
