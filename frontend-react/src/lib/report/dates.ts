/**
 * Loose date-expression parsing. Used only to tell past events from future
 * targets and to recognise date-led list items — what the report *shows* is
 * always the original wording (see text.formatDateLabel).
 */
import type { DateSpan, Tense } from "./model";

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const WEEKDAY_RE = "(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|rsday|urday|sday)?\\.?,?\\s+)?";
const TIME_RE = "(?:,?\\s+(?:at\\s+)?\\d{1,2}(?::\\d{2})?\\s*(?:[ap]\\.?m\\.?)(?:\\s*[-\\u2013]\\s*\\d{1,2}(?::\\d{2})?\\s*(?:[ap]\\.?m\\.?)?)?|\\s+\\(all day\\))?";

function day(y: number, m: number, d: number): DateSpan | null {
  const start = new Date(y, m, d);
  if (start.getMonth() !== m) return null;
  return { start, end: new Date(y, m, d, 23, 59, 59), precision: "day" };
}

function range(y1: number, m1: number, y2: number, m2: number, precision: DateSpan["precision"]): DateSpan {
  // m2 is inclusive: end = last moment of month m2.
  return { start: new Date(y1, m1, 1), end: new Date(y2, m2 + 1, 0, 23, 59, 59), precision };
}

const plausibleYear = (y: number) => y >= 1950 && y <= 2100;

/** A day/month given without a year (event listings: "Sat Nov 21") is read
 * as the nearest such date from roughly two months ago onward. */
function inferYear(month: number, dayOfMonth: number, now: Date): number {
  const y = now.getFullYear();
  const candidate = new Date(y, month, dayOfMonth);
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60);
  return candidate < cutoff ? y + 1 : y;
}

interface Rule {
  re: RegExp;
  build: (m: RegExpExecArray, now: Date) => DateSpan | null;
}

const SEASONS: Record<string, [number, number]> = {
  spring: [2, 4], summer: [5, 7], fall: [8, 10], autumn: [8, 10], winter: [11, 13],
};

const RULES: Rule[] = [
  // 2022-07-12 (optionally with a time)
  { re: /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?/, build: (m) => day(+m[1], +m[2] - 1, +m[3]) },
  // 2022-07
  { re: /^(\d{4})-(\d{2})(?![\d-])/, build: (m) => (+m[2] >= 1 && +m[2] <= 12 ? range(+m[1], +m[2] - 1, +m[1], +m[2] - 1, "month") : null) },
  // 07/12/2022 or 7/12/22
  {
    re: /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/,
    build: (m) => day(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]),
  },
  // (Sat) Nov 21(st)(, 2026)( 4:30 PM)
  {
    // (?!\d|:\d) — "Nov 5:" is a date, "Nov 5:30" is not a day.
    re: new RegExp(`^${WEEKDAY_RE}${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?!\\d|:\\d)${TIME_RE}`, "i"),
    build: (m, now) => {
      const month = MONTH_INDEX[m[1].toLowerCase().replace(".", "")];
      const d = +m[2];
      const y = m[3] ? +m[3] : inferYear(month, d, now);
      return day(y, month, d);
    },
  },
  // 12 July 2022
  {
    re: new RegExp(`^${WEEKDAY_RE}(\\d{1,2})\\s+${MONTH_RE},?\\s+(\\d{4})`, "i"),
    build: (m) => day(+m[3], MONTH_INDEX[m[2].toLowerCase().replace(".", "")], +m[1]),
  },
  // July 2022 / July of 2022
  {
    re: new RegExp(`^(?:(early|mid|late)[-\\s]+)?${MONTH_RE}(?:\\s+of)?,?\\s+(\\d{4})`, "i"),
    build: (m) => {
      const month = MONTH_INDEX[m[2].toLowerCase().replace(".", "")];
      return plausibleYear(+m[3]) ? range(+m[3], month, +m[3], month, "month") : null;
    },
  },
  // (early/late) Spring (of) 2027
  {
    re: /^(?:(early|mid|late)[-\s]+)?(spring|summer|fall|autumn|winter)(?:\s+of)?,?\s+(\d{4})/i,
    build: (m) => {
      const [a, b] = SEASONS[m[2].toLowerCase()];
      const y = +m[3];
      return plausibleYear(y) ? range(y, a, b > 11 ? y + 1 : y, b % 12, "season") : null;
    },
  },
  // Q3 2026 / 2026 Q3
  {
    re: /^(?:Q([1-4])\s+(\d{4})|(\d{4})\s+Q([1-4]))/i,
    build: (m) => {
      const q = +(m[1] || m[4]) - 1;
      const y = +(m[2] || m[3]);
      return plausibleYear(y) ? range(y, q * 3, y, q * 3 + 2, "quarter") : null;
    },
  },
  // early 2027 / mid-2026 / late 2025
  {
    re: /^(early|mid|late)[-\s]+(\d{4})/i,
    build: (m) => {
      const y = +m[2];
      if (!plausibleYear(y)) return null;
      const part = m[1].toLowerCase();
      return part === "early" ? range(y, 0, y, 3, "season") : part === "mid" ? range(y, 4, y, 7, "season") : range(y, 8, y, 11, "season");
    },
  },
  // 2025 (a bare year, not part of a larger number like "2025,000" or a range)
  {
    re: /^(\d{4})(?![\d,./-])/,
    build: (m) => (plausibleYear(+m[1]) ? range(+m[1], 0, +m[1], 11, "year") : null),
  },
];

/** Parse a date expression at the start of `text`. Returns the parsed span and
 * how many characters of `text` it consumed. */
export function matchLeadingDate(text: string, now: Date): { span: DateSpan; length: number } | null {
  const s = text.trimStart();
  const offset = text.length - s.length;
  for (const rule of RULES) {
    const m = rule.re.exec(s);
    if (!m) continue;
    const span = rule.build(m, now);
    if (span) return { span, length: offset + m[0].length };
  }
  return null;
}

/** Parse a whole string as a date expression ("2022-07-12", "Fall 2026"). */
export function parseDateExpression(text: string, now: Date): DateSpan | null {
  const hit = matchLeadingDate(text, now);
  if (!hit) return null;
  // Allow only trailing punctuation / whitespace after the date.
  return /^[\s.,;:)]*$/.test(text.slice(hit.length)) ? hit.span : null;
}

export function tenseOf(span: DateSpan | null, now: Date): Tense {
  if (!span) return "unknown";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  if (span.end < startOfToday) return "past";
  if (span.start > endOfToday) return "future";
  return "current";
}
