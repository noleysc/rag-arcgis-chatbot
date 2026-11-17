/**
 * SYNTHETIC test answers for edge cases the captured real answers don't
 * cover. Not real Estero information: IDs are "TEST-…", links point at
 * example.org, and they are never used outside the test suite.
 */
import { messageFromApi } from "./helpers";

/** No dates, no figures, no citations — a general explainer. */
export const noDatesNoNumbers = messageFromApi(
  {
    summary:
      "**Bottom line:** Residents can comment on agenda items during the public comment portion of a meeting, usually after filling out a speaker card.\n\n" +
      "- Speaker cards are typically collected before the item is called.\n" +
      "- Comments are limited to the item being discussed.\n" +
      "- Written comments can usually be sent ahead of time instead.",
    projects: [],
    timeline: [],
    related: [],
    used_record_ids: [],
    follow_ups: ["How do I find the agenda for the next meeting?"],
    source_type: "general",
    route: "rag",
  },
  "How do I speak at a public meeting?",
);

/** Special characters, emoji, long words/titles, nested lists, a table,
 * headings, raw HTML and an unsafe link. */
export const specialCharacters = messageFromApi(
  {
    summary:
      "**Bottom line:** The “Café & Piñata Plaza” proposal → was **approved** ✅ with conditions [TEST-0001]; parking ≥ 120 spaces 🚗 was required.\n\n" +
      "## Conditions & Requirements\n\n" +
      "| Condition | Detail |\n|---|---|\n| Parking | **120 parking spaces** minimum |\n| Height | No more than **3 stories** (≈45′) |\n\n" +
      "### Notes\n\n" +
      "- **Applicant:** Łukasz Nowak & Associates — represented by counsel\n" +
      "  - Nested detail with `code-ish` text and <script>alert(1)</script> literal\n" +
      "- **Budget:** **$4.2 million** total, with 35% from impact fees [TEST-0001]\n" +
      "- Supercalifragilisticexpialidociouslylongunbrokentokenthatshouldnotoverflowthepage\n\n" +
      "See [the plan](javascript:alert(1)) or https://example.org/planning/applications/2026/very/long/path/to/a/document/that/keeps/going/and/going/final-site-plan-with-all-exhibits-and-appendices.pdf",
    projects: [
      {
        title:
          "Café & Piñata Plaza — Mixed-Use Development Order with Deviations for Parking, Landscape Buffers, Signage, Lighting and an Extremely Long Title That Keeps Going",
        id: "TEST-0001",
        location: "123 Example Way",
        summary: "Development order approved with conditions on parking, lighting and signage.",
        status: "Approved",
        date: "2026-03-10",
        document_url:
          "https://example.org/wp-content/uploads/library-ada/minutes/2026%20Minutes/03102026-Planning-Zoning-and-Design-Board-Minutes-Final-Approved-Version-With-All-Attachments.pdf",
        source_type: "board_record",
      },
    ],
    timeline: [{ date: "2026-03-10", event: "Board approved the plaza with conditions ✔", status: "Approved", record_id: "TEST-0001" }],
    related: [],
    used_record_ids: ["TEST-0001"],
    follow_ups: [],
    source_type: "records",
    route: "rag",
  },
  "Was the Café & Piñata Plaza (with 120+ parking spaces → “deviations”) approved?? 🤔 It's a really long question that goes on and on about parking, lighting, signage, landscaping, and traffic on the nearby roads",
);

/** Incomplete citation metadata: cards missing URLs/titles/dates, citations
 * with no card, related records with no card, plain `sources` strings. */
export const missingMetadata = messageFromApi(
  {
    summary:
      "**Bottom line:** The item was discussed but **no decision recorded** [TEST-0100], and a later article mentions it [TEST-0200] [TEST-0300].\n\n" +
      "- The board discussed the request [TEST-0100].\n" +
      "- A follow-up meeting has not been scheduled [TEST-0999].",
    projects: [
      { title: "", id: "TEST-0100", location: "", summary: "", status: "No decision recorded", date: "", document_url: "", source_type: "board_record" },
      { title: "Article with no date", id: "TEST-0200", summary: "", source_type: "website_article", article_url: "https://example.org/news/article" },
      { title: "", id: "", summary: "", source_type: "website_article" },
    ],
    timeline: [
      { date: "", event: "Discussed at a meeting (date not given)", status: "No decision recorded", record_id: "TEST-0100" },
      { date: "Spring 2027", event: "Possible return to the board", status: "Update", record_id: "TEST-0999" },
    ],
    related: [{ record_id: "TEST-0400", one_line: "A different request on the same street" }],
    used_record_ids: ["TEST-0100", "TEST-0200", "TEST-0300", "TEST-0999"],
    follow_ups: [],
    source_type: "mixed",
    route: "rag",
    sources: ["https://example.org/extra-source", "Staff memo (no link)"],
  },
  "What happened with request TEST-0100?",
);

/** A very long answer: many findings, multiple sections, many sources. */
export const longAnswer = messageFromApi(
  {
    summary:
      "**Bottom line:** Several test projects are in different stages [TEST-1001] [TEST-1002].\n\n" +
      Array.from({ length: 4 }, (_, s) =>
        `**Group ${s + 1}:**\n\n` +
        Array.from(
          { length: 5 },
          (_, i) =>
            `- **Project ${s + 1}.${i + 1}** — ${"This is a long descriptive sentence about a synthetic project used only to test pagination and card breaking. ".repeat(3)}[TEST-${1001 + ((s * 5 + i) % 12)}]`,
        ).join("\n"),
      ).join("\n\n"),
    projects: Array.from({ length: 12 }, (_, i) => ({
      title: `Synthetic record ${i + 1}`,
      id: `TEST-${1001 + i}`,
      summary: "Synthetic summary text for pagination testing. ".repeat(4),
      status: ["Approved", "Denied", "Continued", "No decision recorded"][i % 4],
      date: `2025-0${(i % 9) + 1}-1${i % 9}`,
      document_url: `https://example.org/minutes/${i + 1}.pdf`,
      source_type: i % 3 === 0 ? "website_article" : "board_record",
      article_url: i % 3 === 0 ? `https://example.org/news/${i + 1}` : "",
    })),
    timeline: Array.from({ length: 10 }, (_, i) => ({
      date: i < 8 ? `202${4 + (i % 2)}-0${(i % 9) + 1}-15` : i === 8 ? "Fall 2027" : "2028",
      event: `Synthetic milestone ${i + 1}`,
      status: ["Approved", "Update", "Continued", "No decision recorded", "Denied"][i % 5],
      record_id: `TEST-${1001 + (i % 12)}`,
    })),
    related: [],
    used_record_ids: Array.from({ length: 12 }, (_, i) => `TEST-${1001 + i}`),
    follow_ups: ["Follow-up one?", "Follow-up two?", "Follow-up three?"],
    source_type: "records",
    route: "rag",
  },
  "Give me an overview of all the test projects",
);

export const SYNTHETIC = { noDatesNoNumbers, specialCharacters, missingMetadata, longAnswer };
