/**
 * Browser entry for PDF rendering. Imported lazily (see download.ts) so
 * react-pdf, the markdown parser and the fonts load only when someone
 * actually exports a report.
 */
import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import latoRegular from "../../assets/fonts/report/Lato-Regular.ttf?url";
import latoItalic from "../../assets/fonts/report/Lato-Italic.ttf?url";
import latoBold from "../../assets/fonts/report/Lato-Bold.ttf?url";
import latoBoldItalic from "../../assets/fonts/report/Lato-BoldItalic.ttf?url";
import serifBold from "../../assets/fonts/report/PTSerif-Bold.ttf?url";
import type { ChatMessage } from "../../types";
import { buildReport } from "./buildReport";
import { registerReportFonts, type ReportFontFiles } from "./pdf/fonts";
import { ReportDocument } from "./pdf/ReportDocument";

const FONT_URLS: ReportFontFiles = { latoRegular, latoItalic, latoBold, latoBoldItalic, serifBold };

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font request failed (${response.status}): ${url}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read font"));
    reader.readAsDataURL(blob);
  });
}

let fontData: Promise<ReportFontFiles> | null = null;

/**
 * Fetch the fonts ourselves and hand react-pdf base64 data URLs. react-pdf
 * memoises each font's load promise forever — a failed fetch (flaky network)
 * would make every later export fail too. Here a failure is discarded, so
 * the next click simply tries again; a success is kept for the session.
 */
function loadFonts(): Promise<ReportFontFiles> {
  fontData ??= (async () => {
    const entries = await Promise.all(
      Object.entries(FONT_URLS).map(async ([key, url]) => [key, await toDataUrl(url)] as const),
    );
    return Object.fromEntries(entries) as unknown as ReportFontFiles;
  })().catch((err: unknown) => {
    fontData = null;
    throw err;
  });
  return fontData;
}

export async function renderReportBlob(
  message: ChatMessage,
  question: string | undefined,
): Promise<{ blob: Blob; filename: string }> {
  registerReportFonts(await loadFonts());
  const report = buildReport(message, { question });
  // createElement keeps this module .ts (no JSX) for a lean lazy chunk.
  const blob = await pdf(createElement(ReportDocument, { report }) as Parameters<typeof pdf>[0]).toBlob();
  return { blob, filename: report.filename };
}
