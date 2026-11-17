/**
 * Report sections. Each component renders one ReportSection kind (or a
 * fixed part of the page: masthead, running header, footer) and returns
 * nothing when it has nothing to show.
 *
 * Pagination rules applied throughout:
 *   - cards are unbreakable unless unusually long;
 *   - a section label is always kept on the same page as its first item
 *     (KeepTogether), so no heading is ever stranded at the foot of a page;
 *   - the "Evidence & Context" band travels with the first item after it.
 */
import { Fragment, type ReactNode } from "react";
import { Circle, Link, Svg, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { Block, Finding, InlineRun, Metric, Notice, Report, ReportSection, SourceEntry, TimelineItem } from "../model";
import { clipText, plainText } from "../text";
import { hostOf } from "../urls";
import { bookmark, pad2, refAnchor } from "./anchors";
import {
  BrandMark,
  Dot,
  KeepTogether,
  LinkLine,
  NumberBadge,
  RichText,
  SectionLabel,
  StatusChip,
  TenseChip,
  UrlText,
} from "./primitives";
import { COLOR, CONTENT_WIDTH, FONT, PAGE, TYPE } from "./theme";

type Sources = SourceEntry[];
const src = (sources: Sources, n: number) => sources[n - 1];

/** Character budget below which a card (or label + first item) is kept
 * whole. Anything longer is allowed to break so it can never overflow a page. */
const WHOLE_LIMIT = 1100;
const keepWhole = (chars: number) => chars < WHOLE_LIMIT;

function blockChars(b: Block): number {
  switch (b.type) {
    case "paragraph":
    case "heading":
      return plainText(b.runs).length;
    case "list":
      return b.items.reduce((n, i) => n + i.blocks.reduce((m, x) => m + blockChars(x), 0) + 40, 0);
    case "table":
      return (b.rows.length + 1) * 120;
    case "quote":
      return b.blocks.reduce((n, x) => n + blockChars(x), 0);
    case "code":
      return b.text.length;
    case "rule":
      return 0;
  }
}

const findingChars = (f: Finding) =>
  plainText(f.body).length + plainText(f.title).length + f.extra.reduce((n, b) => n + blockChars(b), 0) + 80;

// ─────────────────────────────────────────────
// Masthead (ReportHeader) + executive summary
// ─────────────────────────────────────────────

function titleSize(title: string): number {
  const n = title.length;
  if (n <= 55) return 30;
  if (n <= 85) return 26;
  if (n <= 120) return 22;
  if (n <= 170) return 19;
  return 16;
}

/** Decorative rings centred off the top-right corner, with the accent dot
 * placed between the designation and the title so it never sits on text. */
function Rings() {
  return (
    <View style={{ position: "absolute", top: -103, right: -115 }}>
      <Svg width={330} height={330} viewBox="0 0 330 330">
        <Circle cx={165} cy={165} r={62} stroke={COLOR.bandRing} strokeWidth={0.9} fill="none" />
        <Circle cx={165} cy={165} r={98} stroke={COLOR.bandRing} strokeWidth={0.9} fill="none" />
        <Circle cx={165} cy={165} r={134} stroke={COLOR.bandRing} strokeWidth={0.9} fill="none" />
        <Circle cx={165} cy={165} r={164} stroke={COLOR.bandRing} strokeWidth={0.9} fill="none" />
        <Circle cx={124} cy={190} r={12} fill={COLOR.lime} />
      </Svg>
    </View>
  );
}

export function Masthead({ report }: { report: Report }) {
  const n = report.sources.length;
  const basis =
    report.answerBasis === "general"
      ? "General information, no records cited"
      : n > 0
        ? `Built from ${n} cited source${n === 1 ? "" : "s"}`
        : "No source documents were attached to this answer";
  return (
    <View
      style={{
        marginTop: -PAGE.marginTop,
        marginHorizontal: -PAGE.marginX,
        paddingHorizontal: PAGE.marginX,
        paddingTop: 38,
        paddingBottom: report.summary ? 74 : 34,
        backgroundColor: COLOR.navy,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Rings />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <BrandMark size={24} />
          <View style={{ marginLeft: 9 }}>
            <Text style={{ color: COLOR.white, fontSize: 11, fontWeight: 700, letterSpacing: 0.8 }}>ENGAGE ESTERO</Text>
            <Text style={{ color: COLOR.bandMuted, fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, marginTop: 2.5 }}>
              COMMUNITY INTELLIGENCE  /  INDEPENDENT COMMUNITY PROJECT
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: COLOR.limeText, fontSize: 7.6, fontWeight: 700, letterSpacing: 1.1 }}>
            {report.designation.toUpperCase()}
          </Text>
          <Text style={{ color: COLOR.bandMuted, fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, marginTop: 3 }}>
            {report.generatedLabel.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={{ color: COLOR.limeText, fontSize: 8.2, fontWeight: 700, letterSpacing: 1, marginTop: 40 }}>
        {report.kicker.toUpperCase()}
      </Text>
      <Text
        style={{
          fontFamily: FONT.serif,
          fontWeight: 700,
          color: COLOR.white,
          fontSize: titleSize(report.title),
          lineHeight: 1.16,
          marginTop: 9,
          maxWidth: CONTENT_WIDTH - 10,
        }}
      >
        {report.title}
      </Text>
      <Text style={{ color: COLOR.bandMuted, fontSize: 8, marginTop: 12 }}>{basis}</Text>
    </View>
  );
}

export function ExecutiveSummary({ report }: { report: Report }) {
  if (!report.summary) return null;
  return (
    <View
      style={{
        marginTop: -50,
        backgroundColor: COLOR.white,
        borderWidth: 0.8,
        borderColor: COLOR.cardBorder,
        borderRadius: 10,
        paddingVertical: 18,
        paddingLeft: 22,
        paddingRight: 20,
        position: "relative",
      }}
      wrap={keepWhole(plainText(report.summary).length) ? false : undefined}
      {...bookmark("The short answer")}
    >
      <View style={{ position: "absolute", left: -1, top: -0.5, bottom: -0.5, width: 4, backgroundColor: COLOR.teal, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }} />
      <Text style={{ fontSize: TYPE.label, fontWeight: 700, letterSpacing: 1.1, color: COLOR.teal, marginBottom: 7 }}>
        THE SHORT ANSWER
      </Text>
      <RichText runs={report.summary} style={{ fontSize: 12, lineHeight: 1.5, color: COLOR.navyText }} />
    </View>
  );
}

export function Notices({ notices }: { notices: Notice[] }) {
  if (!notices.length) return null;
  return (
    <View style={{ marginTop: 10 }}>
      {notices.map((n, i) => {
        const fg = n.tone === "caution" ? COLOR.caution : COLOR.info;
        const bg = n.tone === "caution" ? COLOR.cautionSoft : COLOR.infoSoft;
        return (
          <View key={i} wrap={false} style={{ flexDirection: "row", backgroundColor: bg, borderRadius: 6, marginTop: i ? 6 : 0 }}>
            <View style={{ width: 3, backgroundColor: fg, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} />
            <Text style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 10, fontSize: 8.4, lineHeight: 1.45, color: COLOR.ink }}>
              <Text style={{ fontWeight: 700, color: fg }}>{`${n.title}.  `}</Text>
              {n.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────
// Running header + footer (fixed on every page)
// ─────────────────────────────────────────────

export function RunningHeader({ report }: { report: Report }) {
  return (
    <View
      fixed
      style={{ position: "absolute", top: 26, left: PAGE.marginX, right: PAGE.marginX }}
      render={({ pageNumber }) =>
        pageNumber > 1 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.6, borderBottomColor: COLOR.rule, paddingBottom: 7 }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, color: COLOR.navyText }}>
              ENGAGE ESTERO
              <Text style={{ color: COLOR.faint }}>{`  /  ${report.designation.toUpperCase()}`}</Text>
            </Text>
            <Text style={{ fontSize: 6.8, color: COLOR.muted, maxWidth: 270, textAlign: "right" }}>{clipText(report.title, 70)}</Text>
          </View>
        ) : null
      }
    />
  );
}

export function Footer({ report }: { report: Report }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 26,
        left: PAGE.marginX,
        right: PAGE.marginX,
        borderTopWidth: 0.6,
        borderTopColor: COLOR.rule,
        paddingTop: 8,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 6.8, color: COLOR.muted }}>
        <Text style={{ fontWeight: 700, color: COLOR.navyText, letterSpacing: 0.8 }}>ENGAGE ESTERO</Text>
        {"  /  Independent community project — Not an official Village of Estero publication"}
      </Text>
      <Text
        style={{ fontSize: 6.8, color: COLOR.muted }}
        render={({ pageNumber, totalPages }) => `Generated ${report.generatedLabel}   |   ${pad2(pageNumber)} / ${pad2(totalPages)}`}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// Generic markdown blocks (Key Details)
// ─────────────────────────────────────────────

export function Blocks({ blocks, size = TYPE.body, offset = 0 }: { blocks: Block[]; size?: number; offset?: number }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} size={size} first={i + offset === 0} />
      ))}
    </>
  );
}

function BlockView({ block, size, first }: { block: Block; size: number; first: boolean }) {
  const text: Style = { fontSize: size, lineHeight: TYPE.lineHeight, color: COLOR.body };
  const gap = first ? 0 : 7;
  switch (block.type) {
    case "paragraph":
      return (
        <View style={{ marginTop: gap }}>
          <RichText runs={block.runs} style={text} />
        </View>
      );
    case "heading":
      return (
        <View style={{ marginTop: first ? 0 : 14, marginBottom: 2 }}>
          <RichText runs={block.runs} style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: block.depth <= 2 ? 13 : 11.5, color: COLOR.navyText, lineHeight: 1.3 }} />
        </View>
      );
    case "list":
      return (
        <View style={{ marginTop: gap }}>
          {block.items.map((item, i) => (
            <View key={i} style={{ flexDirection: "row", flexShrink: 0, marginTop: i ? 4 : 0 }} wrap={false}>
              <Text style={{ width: block.ordered ? 16 : 11, fontSize: size, lineHeight: TYPE.lineHeight, color: COLOR.teal, fontWeight: 700 }}>
                {block.ordered ? `${block.start + i}.` : "•"}
              </Text>
              <View style={{ flex: 1 }}>
                <Blocks blocks={item.blocks} size={size} />
              </View>
            </View>
          ))}
        </View>
      );
    case "table":
      return <TableView block={block} size={size} gap={gap} />;
    case "quote":
      return (
        <View style={{ marginTop: gap, borderLeftWidth: 2, borderLeftColor: COLOR.ruleStrong, paddingLeft: 10 }}>
          <Blocks blocks={block.blocks} size={size} />
        </View>
      );
    case "code":
      return (
        <View style={{ marginTop: gap, backgroundColor: COLOR.card, borderRadius: 4, padding: 8 }}>
          <Text style={{ fontSize: size - 1, color: COLOR.navyText, lineHeight: 1.4 }}>{block.text}</Text>
        </View>
      );
    case "rule":
      return <View style={{ marginTop: 10, marginBottom: 4, borderBottomWidth: 0.6, borderBottomColor: COLOR.rule }} />;
  }
}

function TableView({ block, size, gap }: { block: Extract<Block, { type: "table" }>; size: number; gap: number }) {
  const cols = Math.max(block.header.length, ...block.rows.map((r) => r.length));
  const cell = (runs: InlineRun[] | undefined, c: number, header: boolean) => (
    <View key={c} style={{ flex: 1, paddingVertical: 5, paddingHorizontal: 6 }}>
      <RichText
        runs={runs || []}
        style={{
          fontSize: header ? size - 2.2 : size - 1.4,
          fontWeight: header ? 700 : 400,
          color: header ? COLOR.navyText : COLOR.body,
          lineHeight: 1.35,
          textAlign: block.align[c] === "right" ? "right" : block.align[c] === "center" ? "center" : "left",
          letterSpacing: header ? 0.3 : 0,
        }}
      />
    </View>
  );
  return (
    <View style={{ marginTop: gap + 2 }}>
      <View style={{ flexDirection: "row", backgroundColor: COLOR.card, borderRadius: 4 }} wrap={false}>
        {Array.from({ length: cols }, (_, c) => cell(block.header[c], c, true))}
      </View>
      {block.rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: COLOR.rule }} wrap={false}>
          {Array.from({ length: cols }, (_, c) => cell(row[c], c, false))}
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────
// Section renderers
// ─────────────────────────────────────────────

interface SectionProps<K extends ReportSection["kind"]> {
  section: Extract<ReportSection, { kind: K }>;
  sources: Sources;
  first: boolean;
  /** Rendered above the label, on the same page (the Evidence band). */
  lead?: ReactNode;
}

function RefLinks({ refs, sources, size = 7.4 }: { refs: number[]; sources: Sources; size?: number }) {
  if (!refs.length) return null;
  return (
    <Text style={{ fontSize: size, color: COLOR.faint, marginTop: 6, lineHeight: 1.4 }}>
      {"Cited: "}
      {refs.map((n, i) => {
        const s = src(sources, n);
        const detail = [s.kindLabel, s.date].filter(Boolean).join(", ");
        return (
          <Text key={n}>
            {i ? "   " : ""}
            <Link src={refAnchor(n)} style={{ color: COLOR.blue, fontWeight: 700, textDecoration: "none" }}>{`[${n}]`}</Link>
            {` ${detail}`}
            {s.status && s.statusKind ? <Text style={{ color: COLOR.muted }}>{` · ${s.status}`}</Text> : null}
          </Text>
        );
      })}
    </Text>
  );
}

/** InformationGrid of key-figure cards ("At a Glance"). */
function MetricsSection({ section, first, lead }: SectionProps<"metrics">) {
  return (
    <KeepTogether>
      {lead}
      <SectionLabel title={section.title} first={first} />
      <View style={{ flexDirection: "row" }}>
        {section.items.map((m, i) => (
          <MetricCard key={i} metric={m} index={i} last={i === section.items.length - 1} />
        ))}
      </View>
    </KeepTogether>
  );
}

function MetricCard({ metric, index, last }: { metric: Metric; index: number; last: boolean }) {
  const v = metric.value;
  const size = v.length <= 6 ? 25 : v.length <= 10 ? 20 : 15;
  return (
    <View
      style={{
        flex: 1,
        marginRight: last ? 0 : 10,
        borderWidth: 0.8,
        borderColor: COLOR.cardBorder,
        borderRadius: 10,
        paddingVertical: 14,
        paddingHorizontal: 14,
        backgroundColor: COLOR.white,
      }}
    >
      <Text style={{ fontSize: size, fontWeight: 700, color: index === 0 ? COLOR.blue : COLOR.navyText, lineHeight: 1.1 }}>{v}</Text>
      {metric.unit ? (
        <Text style={{ fontSize: TYPE.label, fontWeight: 700, letterSpacing: 0.9, color: "#476077", marginTop: 6 }}>
          {metric.unit.toUpperCase()}
        </Text>
      ) : null}
      <Text style={{ fontSize: 7.9, color: COLOR.muted, lineHeight: 1.4, marginTop: 6 }}>
        {metric.context}
        {metric.refs.map((n) => (
          <Link key={n} src={refAnchor(n)} style={{ color: COLOR.blue, fontWeight: 700, textDecoration: "none" }}>{` [${n}]`}</Link>
        ))}
      </Text>
    </View>
  );
}

/** Numbered key-finding cards. */
function FindingsSection({ section, sources, first, lead }: SectionProps<"findings">) {
  const [head, ...rest] = section.items;
  const introChars = section.intro.reduce((n, b) => n + blockChars(b), 0);
  return (
    <>
      <KeepTogether enabled={keepWhole(introChars + (head ? findingChars(head) : 0))}>
        {lead}
        <SectionLabel title={section.title} first={first} />
        {section.intro.length ? (
          <View style={{ marginBottom: 10 }}>
            <Blocks blocks={section.intro} />
          </View>
        ) : null}
        {head ? <FindingCard finding={head} n={1} sources={sources} /> : null}
      </KeepTogether>
      {rest.map((f, i) => (
        <FindingCard key={i} finding={f} n={i + 2} sources={sources} />
      ))}
      {section.outro.length ? (
        <View style={{ marginTop: 5 }}>
          <Blocks blocks={section.outro} />
        </View>
      ) : null}
    </>
  );
}

function FindingCard({ finding, n, sources }: { finding: Finding; n: number; sources: Sources }) {
  return (
    <View
      wrap={keepWhole(findingChars(finding)) ? false : undefined}
      style={{ flexDirection: "row", flexShrink: 0, backgroundColor: COLOR.card, borderRadius: 9, paddingVertical: 12, paddingHorizontal: 13, marginBottom: 7 }}
    >
      <NumberBadge n={n} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        {finding.title ? (
          <RichText runs={finding.title} style={{ fontSize: 10.8, fontWeight: 700, color: COLOR.navyText, lineHeight: 1.35, marginBottom: 2 }} />
        ) : null}
        {finding.body.length ? (
          <RichText runs={finding.body} style={{ fontSize: 9.6, lineHeight: 1.5, color: COLOR.body, marginTop: finding.title ? 0 : 2.5 }} />
        ) : null}
        {finding.extra.length ? (
          <View style={{ marginTop: 5 }}>
            <Blocks blocks={finding.extra} size={9.2} />
          </View>
        ) : null}
        <RefLinks refs={finding.refs} sources={sources} />
      </View>
    </View>
  );
}

function DetailsSection({ section, first, lead }: SectionProps<"details">) {
  const [head, ...rest] = section.blocks;
  return (
    <>
      <KeepTogether enabled={!!head && keepWhole(blockChars(head))}>
        {lead}
        <SectionLabel title={section.title} first={first} />
        {head ? <Blocks blocks={[head]} /> : null}
      </KeepTogether>
      <Blocks blocks={rest} offset={1} />
    </>
  );
}

/** Vertical timeline. Past entries are solid; future-dated entries are
 * hollow, joined by a dashed line, and tagged FUTURE DATE (unless every
 * entry is upcoming, which the section note already says). */
function TimelineSection({ section, sources, first, lead }: SectionProps<"timeline">) {
  const allFuture = section.items.every((i) => i.tense === "future");
  const row = (item: TimelineItem, i: number) => (
    <TimelineRow
      key={i}
      item={item}
      last={i === section.items.length - 1}
      nextFuture={section.items[i + 1]?.tense === "future"}
      showTense={!allFuture}
      sources={sources}
    />
  );
  const [head, ...rest] = section.items;
  return (
    <>
      <KeepTogether>
        {lead}
        <SectionLabel title={section.title} note={section.subtitle} first={first} />
        <View style={{ marginTop: 4 }}>{head ? row(head, 0) : null}</View>
      </KeepTogether>
      {rest.map((item, i) => row(item, i + 1))}
    </>
  );
}

function TimelineRow({
  item,
  last,
  nextFuture,
  showTense,
  sources,
}: {
  item: TimelineItem;
  last: boolean;
  nextFuture: boolean;
  showTense: boolean;
  sources: Sources;
}) {
  const future = item.tense === "future";
  const s = item.ref ? src(sources, item.ref) : null;
  // Decision outcomes get a chip; "Update" is simply "not a decision", so it
  // stays quiet — the dot style and FUTURE DATE tag carry past vs. future.
  const showChip = !!item.statusKind && item.statusKind !== "update";
  const showRecordId = !!item.recordId && (!s || s.kind === "board_record" || s.kind === "village_council");
  const sourceText = [s?.kindLabel ?? "", showRecordId ? `Record ${item.recordId}` : ""].filter(Boolean).join(" · ");
  return (
    <View wrap={false} style={{ flexDirection: "row", flexShrink: 0 }}>
      <View style={{ width: 24, alignItems: "center" }}>
        <View style={{ marginTop: 1.5 }}>
          <Dot filled={!future} />
        </View>
        {last ? null : (
          <View
            style={{
              flexGrow: 1,
              width: 0,
              marginTop: 3,
              marginBottom: -1,
              borderLeftWidth: 1.4,
              borderLeftColor: nextFuture ? COLOR.teal : COLOR.ruleStrong,
              borderLeftStyle: nextFuture ? "dashed" : "solid",
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, marginLeft: 8, paddingBottom: last ? 4 : 15 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 8.2, fontWeight: 700, color: COLOR.teal, letterSpacing: 0.6 }}>{item.dateLabel.toUpperCase()}</Text>
          {showTense ? <TenseChip tense={item.tense} /> : null}
        </View>
        <RichText runs={item.event} style={{ fontSize: 9.8, lineHeight: 1.45, color: COLOR.ink, marginTop: 3 }} />
        {showChip || sourceText || item.ref ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}>
            {showChip && item.statusKind ? <StatusChip kind={item.statusKind} text={item.status} /> : null}
            {item.ref || sourceText ? (
              <Text style={{ fontSize: 7.4, color: COLOR.muted, marginLeft: showChip ? 7 : 0 }}>
                {item.ref ? (
                  <Link src={refAnchor(item.ref)} style={{ color: COLOR.blue, fontWeight: 700, textDecoration: "none" }}>{`[${item.ref}] `}</Link>
                ) : null}
                {sourceText}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const STATUS_STRIPE: Record<string, string> = {
  approved: "#2f8a5d",
  denied: "#c0392b",
  continued: "#c98a1a",
  nodecision: "#9aa7b6",
  update: COLOR.blue,
  other: "#9aa7b6",
};

/** Meeting summaries (items grouped by meeting date) of decision-record
 * cards, preceded by a project-status comparison table for ≥3 records. */
function DecisionsSection({ section, sources, first, lead }: SectionProps<"decisions">) {
  const label = <SectionLabel title={section.title} tag={section.subtitle} note={section.note || undefined} first={first} />;
  const table = section.comparison.length > 0;
  return (
    <>
      {table ? (
        <ProjectStatusTable refs={section.comparison} sources={sources} lead={<>{lead}{label}</>} />
      ) : null}
      {section.groups.map((g, gi) => {
        const [head, ...rest] = g.records;
        const groupHeader = g.isMeeting ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: gi || table ? 10 : 2, marginBottom: 7 }}>
            <Text style={{ fontSize: 7.6, fontWeight: 700, letterSpacing: 0.9, color: COLOR.navyText }}>{`MEETING OF ${g.date.toUpperCase()}`}</Text>
            <Text style={{ fontSize: 7.6, color: COLOR.faint, marginLeft: 6 }}>{`${g.records.length} cited items`}</Text>
            <View style={{ flex: 1, marginLeft: 8, borderBottomWidth: 0.6, borderBottomColor: COLOR.rule }} />
          </View>
        ) : null;
        const headSource = src(sources, head);
        return (
          <Fragment key={gi}>
            <KeepTogether enabled={keepWhole(headSource.summary.length + 200)}>
              {gi === 0 && !table ? (
                <>
                  {lead}
                  {label}
                </>
              ) : null}
              {groupHeader}
              <DecisionCard source={headSource} showDate={!g.isMeeting} />
            </KeepTogether>
            {rest.map((n) => (
              <DecisionCard key={n} source={src(sources, n)} showDate={!g.isMeeting} />
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

function DecisionCard({ source: s, showDate }: { source: SourceEntry; showDate: boolean }) {
  const stripe = s.statusKind ? STATUS_STRIPE[s.statusKind] : COLOR.ruleStrong;
  const meta = [s.kindLabel, s.recordId ? `Record ${s.recordId}` : "", s.location, showDate ? s.date : ""].filter(Boolean).join("  ·  ");
  return (
    <View wrap={keepWhole(s.summary.length + 200) ? false : undefined} style={{ flexDirection: "row", flexShrink: 0, backgroundColor: COLOR.card, borderRadius: 8, marginBottom: 7 }}>
      <View style={{ width: 3.5, backgroundColor: stripe, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }} />
      <View style={{ flex: 1, paddingVertical: 11, paddingLeft: 12, paddingRight: 13 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {s.statusKind ? (
            <StatusChip kind={s.statusKind} text={s.status} />
          ) : (
            <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 0.5, color: COLOR.faint }}>OUTCOME NOT STATED</Text>
          )}
          <Link src={refAnchor(s.n)} style={{ textDecoration: "none" }}>
            <Text style={{ fontSize: 7.4, fontWeight: 700, color: COLOR.blue }}>{`[${s.n}]`}</Text>
          </Link>
        </View>
        <Text style={{ fontSize: 10.4, fontWeight: 700, color: COLOR.navyText, lineHeight: 1.35, marginTop: 6 }}>{s.title}</Text>
        {meta ? <Text style={{ fontSize: 7.8, color: COLOR.muted, marginTop: 3, lineHeight: 1.35 }}>{meta}</Text> : null}
        {s.summary ? <Text style={{ fontSize: 8.9, color: COLOR.body, lineHeight: 1.45, marginTop: 5 }}>{s.summary}</Text> : null}
        {s.url ? <LinkLine href={s.url} label={s.linkLabel} detail={hostOf(s.url)} /> : null}
      </View>
    </View>
  );
}

function ProjectStatusTable({ refs, sources, lead }: { refs: number[]; sources: Sources; lead: ReactNode }) {
  const head: Style = { fontSize: 6.8, fontWeight: 700, letterSpacing: 0.7, color: COLOR.navyText };
  const row = (n: number) => {
    const s = src(sources, n);
    return (
      <View key={n} wrap={false} style={{ flexDirection: "row", flexShrink: 0, alignItems: "center", borderBottomWidth: 0.6, borderBottomColor: COLOR.rule, paddingVertical: 6, paddingHorizontal: 8 }}>
        <Link src={refAnchor(n)} style={{ width: 28, textDecoration: "none" }}>
          <Text style={{ fontSize: 8, fontWeight: 700, color: COLOR.blue }}>{`[${n}]`}</Text>
        </Link>
        <Text style={{ flex: 1, fontSize: 8.4, color: COLOR.ink, lineHeight: 1.35, paddingRight: 8 }}>{clipText(s.title, 110)}</Text>
        <View style={{ width: 112 }}>
          {s.statusKind ? <StatusChip kind={s.statusKind} text={s.status} size={6.2} /> : <Text style={{ fontSize: 7.6, color: COLOR.faint }}>Not stated</Text>}
        </View>
        <Text style={{ width: 74, fontSize: 8, color: COLOR.muted }}>{s.date || "—"}</Text>
      </View>
    );
  };
  const [first, ...rest] = refs;
  return (
    <View style={{ marginBottom: 12 }}>
      <KeepTogether>
        {lead}
        <View style={{ flexDirection: "row", backgroundColor: COLOR.card, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ ...head, width: 28 }}>REF</Text>
          <Text style={{ ...head, flex: 1 }}>ITEM</Text>
          <Text style={{ ...head, width: 112 }}>RECORDED OUTCOME</Text>
          <Text style={{ ...head, width: 74 }}>DATE</Text>
        </View>
        {row(first)}
      </KeepTogether>
      {rest.map(row)}
    </View>
  );
}

/** Source cards for articles, pages and documents. */
function EvidenceSection({ section, sources, first, lead }: SectionProps<"evidence">) {
  const [head, ...rest] = section.refs;
  return (
    <>
      <KeepTogether>
        {lead}
        <SectionLabel title={section.title} tag={section.subtitle} first={first} />
        <SourceCard source={src(sources, head)} />
      </KeepTogether>
      {rest.map((n) => (
        <SourceCard key={n} source={src(sources, n)} />
      ))}
    </>
  );
}

function SourceCard({ source: s }: { source: SourceEntry }) {
  const meta = [s.kind === "article" && s.org === "EsteroToday" ? "" : s.org, s.date, s.location].filter(Boolean).join("  ·  ");
  return (
    <View wrap={false} style={{ flexDirection: "row", flexShrink: 0, backgroundColor: COLOR.card, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8 }}>
      <NumberBadge n={s.n} size={30} fontSize={11.5} />
      <View style={{ flex: 1, marginLeft: 13 }}>
        <Text style={{ fontSize: 7, fontWeight: 700, letterSpacing: 0.9, color: COLOR.teal }}>{s.kindLabel.toUpperCase()}</Text>
        {s.url ? (
          <Link src={s.url} style={{ textDecoration: "none", marginTop: 3 }}>
            <Text style={{ fontSize: 10.6, fontWeight: 700, color: COLOR.navyText, lineHeight: 1.35 }}>{s.title}</Text>
          </Link>
        ) : (
          <Text style={{ fontSize: 10.6, fontWeight: 700, color: COLOR.navyText, lineHeight: 1.35, marginTop: 3 }}>{s.title}</Text>
        )}
        {meta ? <Text style={{ fontSize: 7.8, color: COLOR.muted, marginTop: 2.5 }}>{meta}</Text> : null}
        {s.summary ? <Text style={{ fontSize: 8.6, color: COLOR.body, lineHeight: 1.45, marginTop: 5 }}>{clipText(s.summary, 420)}</Text> : null}
        {s.url ? <LinkLine href={s.url} label={s.linkLabel} detail={hostOf(s.url)} /> : null}
      </View>
    </View>
  );
}

function RelatedSection({ section, first, lead }: SectionProps<"related">) {
  const row = (r: (typeof section.items)[number], i: number) => (
    <View key={i} wrap={false} style={{ flexDirection: "row", flexShrink: 0, paddingVertical: 5, borderTopWidth: i ? 0.6 : 0, borderTopColor: COLOR.rule }}>
      <Text style={{ width: 12, fontSize: 8.8, color: COLOR.teal, fontWeight: 700 }}>{"•"}</Text>
      <Text style={{ flex: 1, fontSize: 8.8, color: COLOR.body, lineHeight: 1.4 }}>
        {r.recordId ? <Text style={{ fontWeight: 700, color: COLOR.navyText }}>{`${r.recordId}  `}</Text> : null}
        {r.text}
        {r.ref ? <Link src={refAnchor(r.ref)} style={{ color: COLOR.blue, fontWeight: 700, textDecoration: "none" }}>{` [${r.ref}]`}</Link> : null}
      </Text>
    </View>
  );
  const [head, ...rest] = section.items;
  return (
    <>
      <KeepTogether>
        {lead}
        <SectionLabel title={section.title} note={section.note} first={first} />
        {row(head, 0)}
      </KeepTogether>
      {rest.map((r, i) => row(r, i + 1))}
    </>
  );
}

function FollowUpsSection({ section, first, lead }: SectionProps<"followups">) {
  return (
    <KeepTogether>
      {lead}
      <SectionLabel title={section.title} tag="Suggested by the chatbot" first={first} />
      <View style={{ flexDirection: "row" }}>
        {section.items.map((q, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              marginRight: i === section.items.length - 1 ? 0 : 8,
              borderWidth: 0.8,
              borderColor: COLOR.cardBorder,
              borderRadius: 9,
              paddingVertical: 11,
              paddingHorizontal: 12,
            }}
          >
            <View style={{ width: 15, height: 15, borderRadius: 7.5, backgroundColor: COLOR.tealSoft, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
              <Text style={{ fontSize: 8, fontWeight: 700, color: COLOR.teal }}>?</Text>
            </View>
            <Text style={{ fontSize: 8.8, color: COLOR.navyText, lineHeight: 1.4 }}>{q}</Text>
          </View>
        ))}
      </View>
    </KeepTogether>
  );
}

export function Section({ section, sources, first, lead }: { section: ReportSection; sources: Sources; first: boolean; lead?: ReactNode }) {
  switch (section.kind) {
    case "metrics":
      return <MetricsSection section={section} sources={sources} first={first} lead={lead} />;
    case "findings":
      return <FindingsSection section={section} sources={sources} first={first} lead={lead} />;
    case "details":
      return <DetailsSection section={section} sources={sources} first={first} lead={lead} />;
    case "timeline":
      return <TimelineSection section={section} sources={sources} first={first} lead={lead} />;
    case "decisions":
      return <DecisionsSection section={section} sources={sources} first={first} lead={lead} />;
    case "evidence":
      return <EvidenceSection section={section} sources={sources} first={first} lead={lead} />;
    case "related":
      return <RelatedSection section={section} sources={sources} first={first} lead={lead} />;
    case "followups":
      return <FollowUpsSection section={section} sources={sources} first={first} lead={lead} />;
  }
}

// ─────────────────────────────────────────────
// Part two band, references, closing note
// ─────────────────────────────────────────────

export function EvidenceBand() {
  return (
    <View
      wrap={false}
      style={{
        marginTop: 30,
        marginHorizontal: -PAGE.marginX,
        paddingHorizontal: PAGE.marginX,
        paddingVertical: 22,
        backgroundColor: COLOR.navy,
      }}
      {...bookmark("Evidence & context")}
    >
      <Text style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 21, color: COLOR.white, letterSpacing: 0.4 }}>EVIDENCE & CONTEXT</Text>
      <Text style={{ fontSize: 9, color: COLOR.bandMuted, marginTop: 5 }}>The source trail behind this brief, with links to the original records</Text>
    </View>
  );
}

export function ReferenceList({ report, lead }: { report: Report; lead?: ReactNode }) {
  if (!report.sources.length && !report.unlinkedCitations.length) return lead ? <View>{lead}</View> : null;
  const urlWidth = CONTENT_WIDTH - 30;
  const entry = (s: SourceEntry) => {
    const showOrg = s.org && !s.kindLabel.toLowerCase().includes(s.org.toLowerCase());
    const meeting = s.kind === "board_record" || s.kind === "village_council";
    const meta = [s.kindLabel, showOrg ? s.org : "", s.date, meeting && s.recordId ? `Record ID ${s.recordId}` : ""].filter(Boolean).join("  ·  ");
    return (
      <View key={s.n} id={`ref-${s.n}`} wrap={false} style={{ flexDirection: "row", flexShrink: 0, paddingVertical: 6, borderTopWidth: 0.6, borderTopColor: COLOR.rule }}>
        <Text style={{ width: 30, fontSize: 8.4, fontWeight: 700, color: COLOR.blue }}>{`[${s.n}]`}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8.8, fontWeight: 700, color: COLOR.navyText, lineHeight: 1.35 }}>{s.title}</Text>
          {meta ? <Text style={{ fontSize: 7.6, color: COLOR.muted, marginTop: 2, lineHeight: 1.35 }}>{meta}</Text> : null}
          {s.url ? (
            <View style={{ marginTop: 2.5 }}>
              <UrlText url={s.url} width={urlWidth} />
            </View>
          ) : (
            <Text style={{ fontSize: 7.4, color: COLOR.faint, marginTop: 2.5 }}>No link was provided with this source.</Text>
          )}
        </View>
      </View>
    );
  };
  const [head, ...rest] = report.sources;
  return (
    <>
      <KeepTogether>
        {lead}
        <SectionLabel title="References" tag="Cited sources" />
        {head ? entry(head) : null}
      </KeepTogether>
      {rest.map(entry)}
      {report.unlinkedCitations.length ? (
        <Text style={{ fontSize: 7.8, color: COLOR.muted, marginTop: 8, lineHeight: 1.4 }}>
          {`Also cited in the answer without an attached source document: ${report.unlinkedCitations.map((id) => `Record ID ${id}`).join(", ")}.`}
        </Text>
      ) : null}
    </>
  );
}

export function AboutThisBrief({ report }: { report: Report }) {
  const verify = report.sources.some((s) => s.url)
    ? "Confirm important details in the original records linked above before relying on them."
    : "Confirm important details with the Village of Estero before relying on them.";
  return (
    <View wrap={false} style={{ marginTop: 24, borderWidth: 0.6, borderColor: COLOR.ruleStrong, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 13 }}>
      <Text style={{ fontSize: 7.4, fontWeight: 700, letterSpacing: 1, color: COLOR.navyText }}>ABOUT THIS BRIEF</Text>
      <Text style={{ fontSize: 7.8, color: COLOR.muted, lineHeight: 1.5, marginTop: 4 }}>
        {`Generated ${report.generatedLabel} by Engage Estero from a single answer of its community chatbot, using only that answer and the sources it cited. Engage Estero is an independent community project; this is not an official Village of Estero publication. Answers are AI-assisted and may contain errors or omissions. ${verify}`}
      </Text>
      {report.question ? (
        <Text style={{ fontSize: 7.8, color: COLOR.muted, lineHeight: 1.5, marginTop: 4 }}>
          <Text style={{ fontWeight: 700, color: COLOR.ink }}>Question as asked: </Text>
          {`“${report.question}”`}
        </Text>
      ) : null}
    </View>
  );
}
