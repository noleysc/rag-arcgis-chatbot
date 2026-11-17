/**
 * End-to-end PDF generation: every captured real answer and every synthetic
 * edge case is rendered through the same ReportDocument the browser uses.
 *
 *   npm test                 — renders in memory and checks the output
 *   npm run report:samples   — also writes the PDFs to ./report-samples
 *                              (synthetic edge cases to ./report-samples/edge-cases)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { renderToBuffer } from "@react-pdf/renderer";
import { beforeAll, describe, expect, it } from "vitest";
import { buildReport } from "../buildReport";
import type { Report } from "../model";
import { registerReportFonts } from "../pdf/fonts";
import { ReportDocument } from "../pdf/ReportDocument";
import { fontFiles, loadFixture, NOW, REAL_FIXTURES } from "./helpers";
import { SYNTHETIC } from "./synthetic";

const SAMPLES_DIR = import.meta.env.MODE === "samples" ? resolve(process.cwd(), "report-samples") : null;

async function render(report: Report): Promise<Buffer> {
  return renderToBuffer(<ReportDocument report={report} />);
}

/** Minimal structural read of a PDF: page count, link targets, outline. */
function inspect(pdf: Buffer) {
  const raw = pdf.toString("latin1");
  const pages = (raw.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  const uris = [...raw.matchAll(/\/URI\s*\(((?:\\.|[^\\)])*)\)/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
  // Internal links (citations → references) are written as GoTo actions or /Dest entries.
  const internalLinks = (raw.match(/\/S\s*\/GoTo|\/Dest\s*[([/]/g) || []).length;
  const outlineTitles = (raw.match(/\/Title\s*[(<]/g) || []).length;
  // Content streams are Flate-compressed; make sure they decode (not corrupt).
  let streams = 0;
  for (const m of raw.matchAll(/\/FlateDecode[\s\S]*?stream\r?\n/g)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    inflateSync(pdf.subarray(start, end));
    streams += 1;
  }
  return { pages, uris, internalLinks, outlineTitles, streams };
}

/** Read an Info-dictionary string. Values may be direct or indirect
 * ("/Author 39 0 R"), literal "(…)" or UTF-16BE hex "<FEFF…>". */
function pdfString(pdf: Buffer, key: string): string {
  const raw = pdf.toString("latin1");
  const objectBody = (num: string) => {
    const at = raw.indexOf(`\n${num} 0 obj`);
    return at === -1 ? "" : raw.slice(at, raw.indexOf("endobj", at));
  };
  const info = /\/Info\s+(\d+)\s+0\s+R/.exec(raw);
  let value = info ? objectBody(info[1]) : raw;
  const ref = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(value);
  value = ref ? objectBody(ref[1]) : value.slice(value.indexOf(`/${key}`) + key.length + 1);
  const decode = (bytes: Buffer) =>
    bytes[0] === 0xfe && bytes[1] === 0xff ? Buffer.from(bytes.subarray(2)).swap16().toString("utf16le") : bytes.toString("latin1");
  const hex = /^[^<(]*<([0-9A-Fa-f\s]+)>/.exec(value.replace(/^\n\d+ 0 obj\s*/, ""));
  if (hex) return decode(Buffer.from(hex[1].replace(/\s+/g, ""), "hex"));
  const lit = /\(((?:\\[\s\S]|[^\\)])*)\)/.exec(value);
  if (!lit) return "";
  // PDF literal-string escapes: \n \r \t \b \f \( \) \\ and octal \ddd.
  const ESC: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
  const unescaped = lit[1].replace(/\\([0-7]{1,3}|[\s\S])/g, (_, c: string) =>
    /^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : (ESC[c] ?? c),
  );
  return decode(Buffer.from(unescaped, "latin1"));
}

beforeAll(() => {
  registerReportFonts(fontFiles());
  if (SAMPLES_DIR) mkdirSync(SAMPLES_DIR, { recursive: true });
});

const cases: Array<[string, () => Report]> = [
  ...REAL_FIXTURES.map((name): [string, () => Report] => [name, () => buildReport(loadFixture(name), { now: NOW })]),
  ...Object.entries(SYNTHETIC).map(([name, msg]): [string, () => Report] => [`synthetic-${name}`, () => buildReport(msg, { now: NOW })]),
];

describe("PDF rendering", () => {
  it.each(cases)("renders %s as a valid, linked, paginated PDF", async (name, make) => {
    const report = make();
    const pdf = await render(report);
    if (SAMPLES_DIR) {
      // Real captured answers at the top level; synthetic test data kept apart.
      const synthetic = name.startsWith("synthetic-");
      const dir = synthetic ? resolve(SAMPLES_DIR, "edge-cases") : SAMPLES_DIR;
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, synthetic ? `${name}.pdf` : report.filename), pdf);
    }
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-1024).toString("latin1")).toContain("%%EOF");

    const info = inspect(pdf);
    expect(info.pages).toBeGreaterThanOrEqual(1);
    expect(info.pages).toBeLessThanOrEqual(12);
    expect(info.streams).toBeGreaterThan(0);

    // Every source with a link is clickable, with its exact original URL.
    for (const s of report.sources) {
      if (s.url) expect(info.uris).toContain(s.url);
    }
    // Every clickable URL in the PDF came from the answer or its sources.
    const allowed = new Set(report.sources.map((s) => s.url).filter(Boolean));
    const fromText = JSON.stringify(report).match(/"href":"([^"]+)"/g)?.map((h) => JSON.parse(`{${h}}`).href) ?? [];
    fromText.forEach((u: string) => allowed.add(u));
    for (const uri of info.uris) expect(allowed.has(uri)).toBe(true);

    // Citations jump to the reference list.
    const cited = JSON.stringify(report).includes('"ref":');
    if (cited && report.sources.length) expect(info.internalLinks).toBeGreaterThan(0);

    // Document metadata + section bookmarks.
    expect(pdfString(pdf, "Author")).toBe("Engage Estero");
    expect(pdfString(pdf, "Title")).toContain(report.title);
    expect(info.outlineTitles).toBeGreaterThan(1);
  });

  it("keeps a short answer short", async () => {
    const pdf = await render(buildReport(loadFixture("wawa-corkscrew"), { now: NOW }));
    expect(inspect(pdf).pages).toBeLessThanOrEqual(2);
  });

  it("paginates a long answer across several pages", async () => {
    const pdf = await render(buildReport(SYNTHETIC.longAnswer, { now: NOW }));
    expect(inspect(pdf).pages).toBeGreaterThanOrEqual(3);
  });
});
