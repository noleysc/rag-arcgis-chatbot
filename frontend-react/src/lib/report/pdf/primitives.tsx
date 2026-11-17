/**
 * Small drawing primitives shared by the report sections: inline rich text,
 * status chips, section labels, number badges and vector glyphs. All
 * vector — no raster images — so everything stays crisp in print.
 */
import type { ReactNode } from "react";
import { Link, Path, Svg, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { InlineRun, StatusKind, Tense } from "../model";
import { breakUrl } from "../urls";
import { bookmark, pad2, refAnchor } from "./anchors";
import { COLOR, FONT, STATUS_COLORS, TYPE } from "./theme";


// ─────────────────────────────────────────────
// Inline text
// ─────────────────────────────────────────────

function runStyle(r: InlineRun, base: Style): Style {
  const s: Style = {};
  if (r.bold) s.fontWeight = 700;
  if (r.italic) s.fontStyle = "italic";
  if (r.strike) s.textDecoration = "line-through";
  if (r.status) s.color = STATUS_COLORS[r.status].fg;
  if (r.code) {
    s.backgroundColor = COLOR.card;
    s.color = COLOR.navyText;
  }
  if (r.href) {
    s.color = COLOR.blue;
    s.textDecoration = "underline";
  }
  if (base.fontFamily === FONT.serif) s.fontWeight = 700;
  return s;
}

/** Inline runs as nested <Text>/<Link>. Must be placed inside a <Text>. */
export function Runs({ runs, base = {} }: { runs: InlineRun[]; base?: Style }) {
  return (
    <>
      {runs.map((r, i) => {
        if (r.cite) {
          const citeStyle: Style = { fontSize: 0.78 * Number(base.fontSize ?? TYPE.body), fontWeight: 700 };
          return r.cite.ref ? (
            <Link key={i} src={refAnchor(r.cite.ref)} style={{ ...citeStyle, color: COLOR.blue, textDecoration: "none" }}>
              {`[${r.cite.ref}]`}
            </Link>
          ) : (
            <Text key={i} style={{ ...citeStyle, color: COLOR.faint }}>
              {r.text}
            </Text>
          );
        }
        if (r.href) {
          return (
            <Link key={i} src={r.href} style={runStyle(r, base)}>
              {r.text}
            </Link>
          );
        }
        return (
          <Text key={i} style={runStyle(r, base)}>
            {r.text}
          </Text>
        );
      })}
    </>
  );
}

export function RichText({ runs, style }: { runs: InlineRun[]; style: Style }) {
  return (
    <Text style={style} orphans={2} widows={2}>
      <Runs runs={runs} base={style} />
    </Text>
  );
}

// ─────────────────────────────────────────────
// Labels, chips, badges
// ─────────────────────────────────────────────

export function SectionLabel({
  title,
  tag,
  note,
  first = false,
}: {
  title: string;
  tag?: string;
  note?: string;
  first?: boolean;
}) {
  return (
    // No minPresenceAhead here: labels sit inside KeepTogether groups, and
    // react-pdf mis-paginates when that hint is nested in an unbreakable view.
    <View style={{ marginTop: first ? 18 : 26, marginBottom: note ? 6 : 11 }} {...bookmark(title)}>
      <Text style={{ fontSize: TYPE.label, fontWeight: 700, letterSpacing: 1.1, color: "#476077" }}>
        {title.toUpperCase()}
        {tag ? <Text style={{ color: COLOR.faint }}>{`  /  ${tag.toUpperCase()}`}</Text> : null}
      </Text>
      {note ? (
        <Text style={{ fontSize: TYPE.small - 0.4, color: COLOR.muted, marginTop: 4, lineHeight: 1.4 }}>{note}</Text>
      ) : null}
    </View>
  );
}

export function StatusChip({ kind, text, size = 6.8 }: { kind: StatusKind; text: string; size?: number }) {
  const c = STATUS_COLORS[kind];
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ fontSize: size, fontWeight: 700, color: c.fg, letterSpacing: 0.5 }}>
        {c.label(text).toUpperCase()}
      </Text>
    </View>
  );
}

export function TenseChip({ tense }: { tense: Tense }) {
  if (tense !== "future") return null;
  return (
    <View
      style={{
        borderWidth: 0.8,
        borderColor: COLOR.teal,
        borderRadius: 3,
        paddingHorizontal: 4,
        paddingVertical: 1.2,
        marginLeft: 6,
      }}
    >
      <Text style={{ fontSize: 6.2, fontWeight: 700, color: COLOR.teal, letterSpacing: 0.5 }}>FUTURE DATE</Text>
    </View>
  );
}

export function NumberBadge({ n, size = 22, fontSize = 9 }: { n: number; size?: number; fontSize?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: COLOR.navy,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: COLOR.white, fontSize, fontWeight: 700 }}>{pad2(n)}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Vector glyphs
// ─────────────────────────────────────────────

/** The Engage Estero hexagon mark (same paths as Icons.EngageMarkIcon). */
export function BrandMark({ size = 22, primary = COLOR.white, accent = "#7fb2f0" }: { size?: number; primary?: string; accent?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 3.5H6.2L2.5 9.5l3.7 6H10M2.5 9.5H8" stroke={primary} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M11 8.5h6.8l3.7 6-3.7 6H14M21.5 14.5H16" stroke={accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Small inline glyphs are text/Views, not <Svg>: react-pdf can lay a tiny
 * SVG out at zero height at a page split, which crashes its aspect-ratio
 * maths. Lato has "→" (PT Serif doesn't — never use this in the serif). */
export function ArrowGlyph({ size = 9, color = COLOR.blue }: { size?: number; color?: string }) {
  return <Text style={{ fontFamily: FONT.sans, fontSize: size, fontWeight: 700, color, lineHeight: 1 }}>{"→"}</Text>;
}

export function Dot({ size = 10, filled, color = COLOR.teal }: { size?: number; filled: boolean; color?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.6,
        borderColor: color,
        backgroundColor: filled ? color : COLOR.white,
      }}
    />
  );
}

// ─────────────────────────────────────────────
// Links
// ─────────────────────────────────────────────

/** A labelled outbound link with an arrow ("Read article  esterotoday.com →"). */
export function LinkLine({ href, label, detail, fontSize = 8 }: { href: string; label: string; detail?: string; fontSize?: number }) {
  return (
    <Link src={href} style={{ textDecoration: "none", marginTop: 7 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize, fontWeight: 700, color: COLOR.blue }}>{label}</Text>
        {detail ? <Text style={{ fontSize: fontSize - 0.6, color: COLOR.muted, marginLeft: 7 }}>{detail}</Text> : null}
        <View style={{ marginLeft: 6 }}>
          <ArrowGlyph size={fontSize + 1} />
        </View>
      </View>
    </Link>
  );
}

/** Keeps a section label (or group header) on the same page as the first
 * item under it. react-pdf's minPresenceAhead is unreliable with nested
 * views, so the pair is simply made unbreakable. */
export function KeepTogether({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  // flexShrink 0: never let the paginator squeeze the group to "fit" the
  // space left on a page (it would overlap its own text).
  return (
    <View wrap={enabled ? false : undefined} style={{ flexShrink: 0 }}>
      {children}
    </View>
  );
}

/** A full URL, pre-broken into lines that fit `width` points. */
export function UrlText({ url, width, fontSize = TYPE.micro }: { url: string; width: number; fontSize?: number }) {
  const lines = breakUrl(url, width, fontSize);
  return (
    <Link src={url} style={{ textDecoration: "none" }}>
      <Text style={{ fontSize, color: COLOR.blue, lineHeight: 1.35 }}>{lines.join("\n")}</Text>
    </Link>
  );
}
