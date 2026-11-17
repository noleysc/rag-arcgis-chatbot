import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseStructuredResponse } from "../../parseAnswer";
import type { ChatApiResponse, ChatMessage } from "../../../types";

/** Fixed clock so reports (dates, past/future tags) are reproducible. The
 * real fixtures were captured on this date. */
export const NOW = new Date(2026, 10, 17, 12, 0, 0);

export const REAL_FIXTURES = [
  "sports-park-traffic",
  "council-last-meeting",
  "corkscrew-developments",
  "latest-updates",
  "wawa-corkscrew",
  "weekend-events",
  "approved-2024-count",
  "special-exception",
] as const;

export type RealFixture = (typeof REAL_FIXTURES)[number];

interface FixtureFile {
  question: string;
  response: ChatApiResponse & { meta?: Record<string, unknown> };
}

/** Same normalization as useChat's non-streaming path. */
export function messageFromApi(response: ChatApiResponse, question: string): ChatMessage {
  const p = parseStructuredResponse(response);
  return {
    id: "fixture",
    role: "bot",
    timestamp: NOW.getTime(),
    question,
    prose: p.prose,
    cards: p.cards,
    sources: response.sources || [],
    streaming: false,
    route: response.route,
    feedbackMeta: response.meta,
    timeline: p.timeline,
    related: p.related,
    usedRecordIds: p.usedRecordIds,
    followUps: p.followUps,
    sourceType: p.sourceType,
  };
}

/** Real chatbot responses captured from the local backend (see fixtures/). */
export function loadFixture(name: RealFixture): ChatMessage {
  const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  const file = JSON.parse(readFileSync(path, "utf-8")) as FixtureFile;
  return messageFromApi(file.response, file.question);
}

export function fontFiles() {
  const p = (f: string) => fileURLToPath(new URL(`../../../assets/fonts/report/${f}`, import.meta.url));
  return {
    latoRegular: p("Lato-Regular.ttf"),
    latoItalic: p("Lato-Italic.ttf"),
    latoBold: p("Lato-Bold.ttf"),
    latoBoldItalic: p("Lato-BoldItalic.ttf"),
    serifBold: p("PTSerif-Bold.ttf"),
  };
}
