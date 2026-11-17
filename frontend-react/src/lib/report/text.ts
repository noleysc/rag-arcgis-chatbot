/**
 * Text clean-up for the PDF: keep every character the embedded fonts can
 * draw, translate the common ones they can't into plain equivalents, and
 * drop invisible / pictographic characters that would otherwise render as
 * empty boxes. Meaningful text is never removed silently — an unknown
 * character becomes "?" so the gap stays visible.
 *
 * Special characters are written as code points / `\u{…}` escapes on
 * purpose: no invisible or bidi-control characters live in this source.
 */
import type { InlineRun } from "./model";

type Range = [number, number];

const inRanges = (cp: number, ranges: Range[]) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/** Code points shared by every embedded face (Lato Regular/Italic/Bold/
 * BoldItalic and PT Serif Bold) — measured from the subset TTFs in
 * src/assets/fonts/report with fontTools; re-measure if those files change. */
const COVERED_RANGES: Range[] = [
  [0x20, 0x7e], [0xa0, 0x109], [0x10c, 0x113], [0x116, 0x11f], [0x122, 0x127], [0x12a, 0x12b],
  [0x12e, 0x131], [0x134, 0x137], [0x139, 0x13e], [0x141, 0x148], [0x14c, 0x14d], [0x150, 0x165],
  [0x16a, 0x173], [0x178, 0x17f], [0x218, 0x21b], [0x2c6, 0x2c7], [0x2c9, 0x2c9], [0x2d8, 0x2dd],
  [0x2013, 0x2014], [0x2018, 0x201a], [0x201c, 0x201e], [0x2020, 0x2022], [0x2026, 0x2026],
  [0x2030, 0x2030], [0x2039, 0x203a], [0x2044, 0x2044], [0x20ac, 0x20ac], [0x2116, 0x2116],
  [0x2122, 0x2122], [0x2212, 0x2212], [0x2215, 0x2215], [0x2248, 0x2248], [0x2260, 0x2260],
  [0x2264, 0x2265], [0x25ca, 0x25ca], [0xfb01, 0xfb02],
];

export function isCovered(cp: number): boolean {
  if (cp === 0x0a) return true; // hard line break inside a Text
  if (cp === 0xad) return false; // soft hyphen: drawn as nothing, handled below
  return inRanges(cp, COVERED_RANGES);
}

/** Spaces of other widths → a regular space. */
const SPACE_RANGES: Range[] = [[0x2000, 0x200a], [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000]];

/** Control, zero-width, joiner and bidi-control characters → removed. */
const DROP_RANGES: Range[] = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c],
  [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff],
];

/** Emoji modifiers, flags, keycaps and check/cross dingbats — dropped when the
 * fonts can't draw them (as are all \p{Extended_Pictographic} characters). */
const PICTOGRAPH_RANGES: Range[] = [
  [0x1f1e6, 0x1f1ff], [0x1f3fb, 0x1f3ff], [0xfe0e, 0xfe0f], [0x20e3, 0x20e3], [0x2713, 0x2714], [0x2716, 0x2718],
];
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/** Substitutions for characters the fonts lack. */
const REPLACEMENTS = new Map<number, string>([
  [0x2010, "-"], [0x2011, "-"], [0x2012, "\u{2013}"], [0x2015, "\u{2014}"],
  [0x2032, "'"], [0x2033, '"'], [0x2035, "'"], [0x2036, '"'],
  [0x2023, "\u{2022}"], [0x2043, "-"], [0x25cf, "\u{2022}"], [0x25aa, "\u{2022}"], [0x25e6, "\u{2022}"], [0x2219, "\u{2022}"],
  [0x2024, "."], [0x2025, ".."],
  [0x2190, "<-"], [0x2192, "->"], [0x2194, "<->"], [0x21d2, "=>"], [0x2191, "up"], [0x2193, "down"],
]);

/** Make a string safe for the report fonts. Newlines are preserved. */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return "";
  const s = String(input).normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (inRanges(cp, SPACE_RANGES)) {
      out += " ";
      continue;
    }
    if (inRanges(cp, DROP_RANGES)) continue;
    if (isCovered(cp)) {
      out += ch;
      continue;
    }
    const mapped = REPLACEMENTS.get(cp);
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    // Checked after coverage, so drawable symbols Unicode also classes as
    // pictographic (© ® ™) are kept.
    if (EXTENDED_PICTOGRAPHIC.test(ch) || inRanges(cp, PICTOGRAPH_RANGES)) continue;
    // Accented letters outside the subset (Vietnamese "ạ") → base letter ("a").
    const base = ch.normalize("NFKD").replace(/\p{M}/gu, "");
    out += base && [...base].every((c) => isCovered(c.codePointAt(0)!)) ? base : "?";
  }
  // Dropped emoji can leave doubled spaces or a space before punctuation.
  return out.replace(/ {2,}/g, " ").replace(/ +([,.;:!?])/g, "$1");
}

/** Sanitize and collapse all whitespace (including newlines) to single spaces. */
export function cleanInline(input: string | null | undefined): string {
  return sanitizeText(input).replace(/\s+/g, " ").trim();
}

export function plainText(runs: InlineRun[] | null | undefined): string {
  return (runs || []).map((r) => r.text).join("");
}

const ELLIPSIS = "\u{2026}";

/** Clip to at most `max` characters at a word boundary, adding an ellipsis. */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space >= max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:.\u{2013}\u{2014}-]+$/u, "")}${ELLIPSIS}`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "November 17, 2026" — locale-independent so reports are reproducible. */
export function formatLongDate(d: Date): string {
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatShortDate(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Reformat purely numeric dates for readability without changing them:
 * "2022-07-12" / "07/12/2022" → "Jul 12, 2022", "2022-07" → "Jul 2022".
 * Anything else ("Fall 2026", "2025") is returned as written.
 */
export function formatDateLabel(raw: string | null | undefined): string {
  const s = cleanInline(raw);
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/.exec(s);
  if (m) return validDay(+m[1], +m[2], +m[3]) ?? s;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return validDay(+m[3], +m[1], +m[2]) ?? s;
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${MONTHS_SHORT[+m[2] - 1]} ${m[1]}`;
  return s;
}

function validDay(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  if (date.getMonth() !== mo - 1) return null;
  return formatShortDate(date);
}
