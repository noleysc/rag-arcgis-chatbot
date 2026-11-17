/** The system prompt always opens answer_markdown with a "**Bottom line:**"
 * paragraph — split it off so it can render in its own highlighted box,
 * separate from the rest of the answer. Falls back to no special box for
 * anything that doesn't follow that convention (e.g. the plain-text JSON
 * -parse-failure fallback in rag_path.generate_answer).
 *
 * Shared by the chat bubble (Message.tsx) and the PDF report builder
 * (lib/report) so both treat the same paragraph as the short answer. */
export function splitBottomLine(markdown: string): { bottomLine: string | null; rest: string } {
  const breakIdx = markdown.indexOf("\n\n");
  const firstPara = (breakIdx === -1 ? markdown : markdown.slice(0, breakIdx)).trim();
  if (!/^\*\*Bottom line:?\*\*/i.test(firstPara)) {
    return { bottomLine: null, rest: markdown };
  }
  return {
    bottomLine: firstPara.replace(/^\*\*Bottom line:?\*\*:?\s*/i, ""),
    rest: breakIdx === -1 ? "" : markdown.slice(breakIdx + 2),
  };
}
