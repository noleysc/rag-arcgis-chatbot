/**
 * Composes a Report into a paginated, text-selectable PDF:
 *
 *   page 1   navy masthead → "The short answer" card → part one sections
 *   then     "Evidence & Context" band → timeline, meeting records,
 *            supporting evidence, related records → references
 *   always   closing "About this brief" note; running header (pages 2+)
 *            and footer with page numbers on every page.
 *
 * Cards are kept whole across page breaks, section labels carry
 * minPresenceAhead so they never sit orphaned at the foot of a page, and
 * every section is a PDF bookmark.
 */
import { Document, Page } from "@react-pdf/renderer";
import type { Report } from "../model";
import {
  AboutThisBrief,
  EvidenceBand,
  ExecutiveSummary,
  Footer,
  Masthead,
  Notices,
  ReferenceList,
  RunningHeader,
  Section,
} from "./sections";
import { COLOR, FONT, PAGE, TYPE } from "./theme";

export function ReportDocument({ report }: { report: Report }) {
  const hasPartTwo = report.evidenceSections.length > 0 || report.sources.length > 0;
  return (
    <Document
      title={`${report.title} — Engage Estero ${report.designation}`}
      author="Engage Estero"
      subject={`${report.designation}: ${report.question || report.title}`}
      keywords="Engage Estero, Estero, civic brief, community"
      creator="Engage Estero"
      producer="Engage Estero"
      language="en-US"
      creationDate={report.generatedAt}
    >
      <Page
        size="LETTER"
        style={{
          paddingTop: PAGE.marginTop,
          paddingBottom: PAGE.marginBottom,
          paddingHorizontal: PAGE.marginX,
          fontFamily: FONT.sans,
          fontSize: TYPE.body,
          color: COLOR.body,
          backgroundColor: COLOR.white,
        }}
      >
        <RunningHeader report={report} />
        <Footer report={report} />
        <Masthead report={report} />
        <ExecutiveSummary report={report} />
        <Notices notices={report.notices} />
        {report.answerSections.map((s, i) => (
          <Section key={s.id} section={s} sources={report.sources} first={i === 0} />
        ))}
        {/* Sections render as fragments so every card and row is a direct
            child of the page — react-pdf paginates those reliably. The band
            travels with the first item after it (see KeepTogether). */}
        {hasPartTwo ? (
          <>
            {report.evidenceSections.map((s, i) => (
              <Section key={s.id} section={s} sources={report.sources} first={i === 0} lead={i === 0 ? <EvidenceBand /> : undefined} />
            ))}
            <ReferenceList report={report} lead={report.evidenceSections.length ? undefined : <EvidenceBand />} />
          </>
        ) : null}
        <AboutThisBrief report={report} />
      </Page>
    </Document>
  );
}
