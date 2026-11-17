/**
 * Report title, eyebrow and filename — all derived from the user's question.
 * The title keeps the question's own wording (only tidied), so it can never
 * claim more than was asked.
 */
import { cleanInline } from "./text";

const QUESTION_START =
  /^(who|whom|whose|what|when|where|why|how|which|is|are|was|were|will|would|can|could|should|shall|do|does|did|has|have|had|may|might)\b/i;

/** Polite/imperative lead-ins that read awkwardly as a title. Only stripped
 * when at least two words remain. */
const REQUEST_PREFIX =
  /^(?:(?:hey|hi|hello)[,!]?\s+)?(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:summari[sz]e(?:\s+for\s+me)?|tell\s+me(?:\s+about)?|give\s+me(?:\s+an?\s+(?:overview|summary|update)\s+(?:of|on))?|show\s+me|explain|describe|list|provide|share|walk\s+me\s+through|i\s+(?:want|would\s+like)\s+to\s+know(?:\s+about)?)\s+/i;

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function reportTitle(question: string | null | undefined): string {
  let q = cleanInline(question).replace(/\s+([?.!])/g, "$1");
  if (!q) return "Community Question";
  const stripped = q.replace(REQUEST_PREFIX, "");
  const wasRequest = stripped !== q && stripped.split(/\s+/).length >= 2;
  if (wasRequest) {
    q = stripped.replace(/\s*(?:please|thanks?(?: you)?)[.!?]*$/i, "");
    // "Tell me what X is" → "What X is" is a phrase, not a question.
    q = q.replace(/[?.!]+$/, "");
  }
  q = capitalize(q.replace(/^[,:;\s]+/, ""));
  if (!wasRequest && QUESTION_START.test(q)) {
    q = q.replace(/[.!]+$/, "");
    if (!q.endsWith("?")) q += "?";
  } else {
    q = q.replace(/\.+$/, "");
  }
  return q;
}

/** Eyebrow above the title, picked from the question's subject. Purely a
 * label — which sections the report contains is decided by the answer data,
 * never by these keywords. */
const TOPICS: Array<[RegExp, string]> = [
  [/\b(traffic|roundabouts?|intersections?|lanes?|widen\w*|transportation|transit|bike|bicycl\w*|sidewalks?|pedestrians?|commut\w*|parking|congestion|signals?|road\s?(?:work|projects?|construction|improvements?)|i-?75|us[- ]?41)\b/i, "A Community Mobility Brief"],
  [/\b(council|board|pzdb|vote[sd]?|voting|decid\w*|decisions?|motions?|ordinances?|resolutions?|meetings?|agendas?|minutes|hearings?|approv\w*|denied|denials?)\b/i, "A Public Meetings Brief"],
  [/\b(develop\w*|construct\w*|build\w*|projects?|rezon\w*|zoning|permits?|apartments?|housing|homes?|commercial|retail|stores?|restaurants?|mixed[- ]use|site plans?|land use|subdivisions?)\b/i, "A Development Brief"],
  [/\b(parks?|preserves?|river|environment\w*|water|flood\w*|storm\w*|trees?|wildlife|conservation)\b/i, "An Environment & Parks Brief"],
  [/\b(events?|festivals?|markets?|concerts?|weekend|things to do|games?)\b/i, "A Community Events Brief"],
  [/\b(budget\w*|tax\w*|fees?|fund\w*|costs?|spend\w*|millage|financ\w*)\b/i, "A Budget & Finance Brief"],
];

export function reportKicker(question: string | null | undefined): string {
  const q = cleanInline(question);
  return TOPICS.find(([re]) => re.test(q))?.[1] ?? "A Community Brief";
}

const FILENAME_STOPWORDS = new Set(
  (
    "a an the and or but of in on at to for from by with about into near over under between " +
    "is are was were be been being am will would can could should shall may might must do does did " +
    "has have had what which who whom whose when where why how there here this that these those it its " +
    "i me my we our you your they their them he she his her any some all more most much many " +
    "tell show give list explain describe summarize summarise please provide share know want like " +
    "happening happen happened going get got make made decide decided affect affects add adds " +
    "estero village s"
  ).split(" "),
);

/** "Will Estero Sports Park affect traffic on Williams Road?" →
 * "Engage-Estero-Sports-Park-Traffic-Williams-Road-Report.pdf". ASCII only,
 * safe on every OS. */
export function reportFilename(question: string | null | undefined): string {
  const ascii = cleanInline(question)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  const words = ascii
    .split(/\s+/)
    .filter((w) => w && !FILENAME_STOPWORDS.has(w.toLowerCase()))
    .slice(0, 6)
    .map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : capitalize(w.toLowerCase())));
  const slug = words.join("-").slice(0, 60).replace(/-+$/, "");
  return `Engage-Estero-${slug || "Civic-Intelligence"}-Report.pdf`;
}
