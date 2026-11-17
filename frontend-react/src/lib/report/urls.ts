/**
 * URL helpers for the PDF.
 *
 * react-pdf only breaks lines at spaces (or at hyphenation points, where it
 * inserts a misleading "-"), so a long URL would run straight off the page.
 * Instead URLs are pre-split into lines that fit, measured with Lato's real
 * advance widths. The visible text then reads exactly like the URL (no
 * invisible break characters to corrupt a copy/paste) and the link target
 * always stays the full original URL.
 */

// Lato advance widths for U+0020..U+007E in font units (unitsPerEm 2000),
// read from src/assets/fonts/report/Lato-*.ttf (hmtx).
const LATO_REGULAR = [
  512, 538, 741, 1160, 1160, 1603, 1424, 408, 534, 534, 850, 1160, 454, 743, 472, 904, 1160, 1160, 1160, 1160, 1160,
  1160, 1160, 1160, 1160, 1160, 500, 523, 1160, 1160, 1160, 895, 1673, 1354, 1293, 1336, 1521, 1155, 1131, 1461, 1527,
  560, 845, 1325, 1027, 1857, 1527, 1601, 1201, 1601, 1253, 1085, 1181, 1471, 1354, 2071, 1298, 1248, 1204, 612, 904,
  612, 1160, 918, 800, 994, 1120, 955, 1120, 1056, 701, 1040, 1116, 480, 480, 1016, 472, 1645, 1116, 1134, 1121, 1120,
  728, 866, 717, 1115, 1032, 1571, 996, 1031, 904, 602, 501, 602, 1160,
];
const LATO_BOLD = [
  486, 562, 791, 1160, 1160, 1639, 1447, 423, 549, 549, 850, 1160, 468, 746, 475, 932, 1160, 1160, 1160, 1160, 1160,
  1160, 1160, 1160, 1160, 1160, 515, 541, 1160, 1160, 1160, 920, 1687, 1389, 1317, 1323, 1521, 1150, 1132, 1452, 1541,
  593, 859, 1371, 1039, 1890, 1541, 1616, 1238, 1616, 1286, 1097, 1200, 1485, 1389, 2102, 1341, 1296, 1211, 627, 932,
  627, 1160, 933, 800, 1015, 1135, 964, 1135, 1068, 717, 1056, 1128, 508, 508, 1069, 497, 1675, 1128, 1149, 1136,
  1135, 746, 879, 744, 1128, 1056, 1605, 1044, 1055, 919, 612, 522, 612, 1160,
];
const UNITS_PER_EM = 2000;
/** Width assumed for any non-ASCII character — the widest Latin glyph. */
const FALLBACK = 2102;

/** Width of `text` in points when set in Lato at `fontSize`. */
export function textWidth(text: string, fontSize: number, bold = false): number {
  const table = bold ? LATO_BOLD : LATO_REGULAR;
  let units = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    units += cp >= 0x20 && cp <= 0x7e ? table[cp - 0x20] : FALLBACK;
  }
  return (units / UNITS_PER_EM) * fontSize;
}

/** Characters after which a URL may be broken onto a new line. */
const BREAK_AFTER = /[/?&=#._~-]/;

/**
 * Split a URL into lines no wider than `maxWidth` points. Prefers breaking
 * after "/" (and other URL punctuation), and only splits mid-token when a
 * single token is wider than the whole line.
 */
export function breakUrl(url: string, maxWidth: number, fontSize: number): string[] {
  const limit = maxWidth * 0.96; // headroom for kerning/rounding
  const tokens: string[] = [];
  let token = "";
  for (const ch of url) {
    token += ch;
    if (BREAK_AFTER.test(ch)) {
      tokens.push(token);
      token = "";
    }
  }
  if (token) tokens.push(token);

  const lines: string[] = [];
  let line = "";
  for (const t of tokens) {
    if (textWidth(line + t, fontSize) <= limit) {
      line += t;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    // Hard-split a token that cannot fit on a line of its own.
    let rest = t;
    while (textWidth(rest, fontSize) > limit) {
      let cut = 1;
      while (cut < rest.length && textWidth(rest.slice(0, cut + 1), fontSize) <= limit) cut += 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

export function isSafeHref(href: string | null | undefined): href is string {
  return !!href && /^(https?:\/\/|mailto:)/i.test(href.trim());
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Compact label for a raw URL shown inside running text:
 * "esterotoday.com/news/…/sports-park-update". The full URL stays the link
 * target and is listed in full under References.
 */
export function displayUrl(url: string, maxChars = 46): string {
  let s = url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  if (/^mailto:/i.test(s)) return s.replace(/^mailto:/i, "");
  try {
    s = decodeURI(s);
  } catch {
    // keep as-is when the URL isn't valid percent-encoding
  }
  if (s.length <= maxChars) return s;
  const [host, ...segments] = s.split("/");
  const last = segments.filter(Boolean).pop() || "";
  const tail = last.length > 24 ? `${last.slice(0, 23)}…` : last;
  const candidate = tail ? `${host}/…/${tail}` : host;
  return candidate.length <= maxChars + 4 ? candidate : `${s.slice(0, maxChars - 1)}…`;
}

/** Friendly publisher name for well-known hosts; otherwise the bare host. */
export function orgForUrl(url: string): string {
  const host = hostOf(url);
  if (!host) return "";
  if (host === "estero-fl.gov" || host.endsWith(".estero-fl.gov")) return "Village of Estero";
  if (host === "esterotoday.com" || host.endsWith(".esterotoday.com")) return "EsteroToday";
  if (host === "leegov.com" || host.endsWith(".leegov.com")) return "Lee County";
  if (host.endsWith("fdot.gov")) return "Florida Department of Transportation";
  if (host === "fgcu.edu" || host.endsWith(".fgcu.edu")) return "Florida Gulf Coast University";
  return host;
}
