/**
 * Design tokens for the Civic Intelligence Brief — modelled on the reference
 * brief (navy masthead, teal labels, blue figures, soft grey cards, serif
 * display type over a Lato text face) and Engage Estero's brand navy/green.
 * All measurements are PDF points (1/72 in) on US Letter.
 */
import type { StatusKind } from "../model";

export const PAGE = {
  width: 612,
  height: 792,
  marginX: 50,
  marginTop: 66,
  marginBottom: 70,
} as const;

export const CONTENT_WIDTH = PAGE.width - PAGE.marginX * 2;

export const COLOR = {
  navy: "#13294b",
  navyDeep: "#0f2140",
  navyText: "#16294a",
  ink: "#26364a",
  body: "#33445a",
  muted: "#5b6b7e",
  faint: "#8695a6",
  rule: "#dde4ec",
  ruleStrong: "#c9d3de",
  card: "#f3f6f9",
  cardBorder: "#e1e7ee",
  white: "#ffffff",
  teal: "#13806f",
  tealSoft: "#e5f2ef",
  blue: "#1f63b0",
  blueSoft: "#e8f0fa",
  lime: "#cfe39b",
  limeText: "#d6e8a6",
  bandRing: "#2a4166",
  bandMuted: "#a9b8cc",
  caution: "#9a5b06",
  cautionSoft: "#fdf3e1",
  info: "#1f63b0",
  infoSoft: "#eaf1fb",
} as const;

export const STATUS_COLORS: Record<StatusKind, { fg: string; bg: string; label: (s: string) => string }> = {
  approved: { fg: "#1d6f48", bg: "#e4f2ea", label: () => "Approved" },
  denied: { fg: "#a8261b", bg: "#fbe9e7", label: () => "Denied" },
  continued: { fg: "#8f5404", bg: "#fcf0da", label: () => "Continued" },
  nodecision: { fg: "#4f5d6e", bg: "#eaeef3", label: () => "No decision recorded" },
  update: { fg: "#1f5ea6", bg: "#e7effa", label: () => "Update" },
  other: { fg: "#4f5d6e", bg: "#eaeef3", label: (s) => s },
};

export const FONT = {
  sans: "Lato",
  serif: "PTSerif",
} as const;

export const TYPE = {
  body: 10,
  small: 8.6,
  micro: 7.4,
  label: 7.8,
  lineHeight: 1.5,
} as const;
