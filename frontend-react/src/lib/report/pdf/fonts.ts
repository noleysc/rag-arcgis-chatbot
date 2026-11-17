/**
 * Font registration for the report. The font files are passed in so the
 * same code works in the browser (Vite asset URLs, see ../renderBlob.ts)
 * and in Node tests (filesystem paths).
 *
 * Fonts (SIL Open Font License, texts in src/assets/fonts/report):
 *   Lato 2 — text face; PT Serif Bold — display headings.
 * Subset to Latin + typographic punctuation; text.ts keeps content within
 * that coverage.
 */
import { Font } from "@react-pdf/renderer";
import { FONT } from "./theme";

export interface ReportFontFiles {
  latoRegular: string;
  latoItalic: string;
  latoBold: string;
  latoBoldItalic: string;
  serifBold: string;
}

let registeredWith: ReportFontFiles | null = null;

/** react-pdf only breaks lines at spaces. Ordinary words are never
 * hyphenated (a hyphen inside a case number like "DOS2022-E016" or a URL
 * would be misleading) — they wrap whole. Only a pathological unbroken token
 * too long for any text column is split into chunks so it can't overflow
 * the page. Full URLs are pre-split by urls.breakUrl, and URLs inside
 * running text are shortened by urls.displayUrl (≤ 50 chars), so neither
 * reaches this fallback. */
export const MAX_UNBROKEN = 64;

export function hyphenate(word: string): string[] {
  if (word.length <= MAX_UNBROKEN) return [word];
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += 32) parts.push(word.slice(i, i + 32));
  return parts;
}

export function registerReportFonts(files: ReportFontFiles): void {
  if (registeredWith && JSON.stringify(registeredWith) === JSON.stringify(files)) return;
  Font.register({
    family: FONT.sans,
    fonts: [
      { src: files.latoRegular, fontWeight: 400, fontStyle: "normal" },
      { src: files.latoItalic, fontWeight: 400, fontStyle: "italic" },
      { src: files.latoBold, fontWeight: 700, fontStyle: "normal" },
      { src: files.latoBoldItalic, fontWeight: 700, fontStyle: "italic" },
    ],
  });
  Font.register({
    family: FONT.serif,
    fonts: [{ src: files.serifBold, fontWeight: 700, fontStyle: "normal" }],
  });
  Font.registerHyphenationCallback(hyphenate);
  registeredWith = files;
}
