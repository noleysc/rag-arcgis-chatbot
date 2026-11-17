/**
 * Answer markdown → report blocks. Uses the same remark + GFM parser stack
 * as the chat bubble (react-markdown), so the report reads the answer the
 * way the UI renders it. Raw HTML is never interpreted — it stays text.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { PhrasingContent, Root, RootContent, TableRow } from "mdast";
import type { Block, InlineRun, StatusKind } from "./model";
import { sanitizeText } from "./text";
import { displayUrl, isSafeHref } from "./urls";

export interface CitationResolver {
  /** IDs the backend reported as citations (used/timeline/related/cards). */
  isKnown(recordId: string): boolean;
  /** Source number for a cited record, or null if no document came with it. */
  refFor(recordId: string): number | null;
}

export interface ParseResult {
  blocks: Block[];
  /** Every external link in the text (in order), for the reference list. */
  links: Array<{ href: string; label: string }>;
}

const processor = unified().use(remarkParse).use(remarkGfm);

interface Style {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  href?: string;
  status?: StatusKind;
}

const STATUS_WORDS: Array<[RegExp, StatusKind]> = [
  [/^approved$/i, "approved"],
  [/^denied$/i, "denied"],
  [/^continued$/i, "continued"],
  [/^no decision(?: was)? recorded$/i, "nodecision"],
];

export function statusKindOf(status: string | null | undefined): StatusKind | null {
  const s = (status || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "approved" || s === "accepted") return "approved";
  if (s === "denied") return "denied";
  if (s === "continued") return "continued";
  if (s === "no decision recorded") return "nodecision";
  if (s === "update") return "update";
  return "other";
}

/** `[ID]` or `[ID, ID2]` — only treated as a citation when every ID inside is
 * one the backend actually cited, so ordinary bracketed text stays text. */
const CITE_RE = /\[([^[\]\n]{1,160})\]/g;

function splitCitations(text: string, style: Style, cites: CitationResolver): InlineRun[] {
  const runs: InlineRun[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE_RE)) {
    const ids = m[1].split(/\s*[,;]\s*/).map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0 || !ids.every((id) => cites.isKnown(id))) continue;
    if (m.index > last) runs.push({ ...style, text: text.slice(last, m.index) });
    for (const id of ids) {
      runs.push({ text: `[${id}]`, cite: { recordId: id, ref: cites.refFor(id) } });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ ...style, text: text.slice(last) });
  return runs;
}

function flatten(node: PhrasingContent | RootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) return (node.children as Array<PhrasingContent | RootContent>).map(flatten).join("");
  return "";
}

function phrasing(
  nodes: PhrasingContent[],
  style: Style,
  cites: CitationResolver,
  links: ParseResult["links"],
): InlineRun[] {
  const out: InlineRun[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out.push(...splitCitations(sanitizeText(node.value).replace(/\s*\n\s*/g, " "), style, cites));
        break;
      case "strong": {
        const text = flatten(node).trim();
        const status = STATUS_WORDS.find(([re]) => re.test(text.replace(/[.:]$/, "")))?.[1];
        out.push(...phrasing(node.children, { ...style, bold: true, ...(status ? { status } : {}) }, cites, links));
        break;
      }
      case "emphasis":
        out.push(...phrasing(node.children, { ...style, italic: true }, cites, links));
        break;
      case "delete":
        out.push(...phrasing(node.children, { ...style, strike: true }, cites, links));
        break;
      case "inlineCode":
        out.push({ ...style, code: true, text: sanitizeText(node.value) });
        break;
      case "break":
        out.push({ ...style, text: "\n" });
        break;
      case "link": {
        const href = node.url.trim();
        if (!isSafeHref(href)) {
          // Unsafe or relative target: keep the words, drop the link.
          out.push(...phrasing(node.children, style, cites, links));
          break;
        }
        const label = flatten(node).trim();
        const isBareUrl = !label || label === href || label === href.replace(/^mailto:/i, "") || /^(https?:\/\/|www\.)/i.test(label);
        links.push({ href, label: isBareUrl ? "" : sanitizeText(label) });
        if (isBareUrl) {
          out.push({ ...style, href, text: sanitizeText(displayUrl(href)) });
        } else {
          out.push(...phrasing(node.children, { ...style, href }, cites, links));
        }
        break;
      }
      case "image":
        if (node.alt) out.push({ ...style, italic: true, text: sanitizeText(node.alt) });
        break;
      case "html":
        out.push({ ...style, text: sanitizeText(node.value) });
        break;
      case "footnoteReference":
        out.push({ ...style, text: `[^${node.label ?? node.identifier}]` });
        break;
      default: {
        const text = flatten(node);
        if (text) out.push({ ...style, text: sanitizeText(text) });
      }
    }
  }
  return mergeRuns(out);
}

const sameStyle = (a: InlineRun, b: InlineRun) =>
  !a.cite && !b.cite && a.bold === b.bold && a.italic === b.italic && a.code === b.code &&
  a.strike === b.strike && a.href === b.href && a.status === b.status;

export function mergeRuns(runs: InlineRun[]): InlineRun[] {
  const out: InlineRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = out[out.length - 1];
    if (prev && sameStyle(prev, r)) prev.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

/** Trim leading/trailing whitespace across a run list. */
export function trimRuns(runs: InlineRun[]): InlineRun[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length && !out[0].cite && !out[0].text.trim()) out.shift();
  while (out.length && !out[out.length - 1].cite && !out[out.length - 1].text.trim()) out.pop();
  if (out.length && !out[0].cite) out[0].text = out[0].text.trimStart();
  if (out.length && !out[out.length - 1].cite) out[out.length - 1].text = out[out.length - 1].text.trimEnd();
  return out.filter((r) => r.text);
}

function blocks(nodes: RootContent[], cites: CitationResolver, links: ParseResult["links"]): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "paragraph": {
        const runs = trimRuns(phrasing(node.children, {}, cites, links));
        if (runs.length) out.push({ type: "paragraph", runs });
        break;
      }
      case "heading": {
        const runs = trimRuns(phrasing(node.children, {}, cites, links));
        if (runs.length) out.push({ type: "heading", depth: node.depth, runs });
        break;
      }
      case "list":
        out.push({
          type: "list",
          ordered: !!node.ordered,
          start: node.start ?? 1,
          items: node.children.map((item) => {
            const inner = blocks(item.children, cites, links);
            if (typeof item.checked === "boolean" && inner[0]?.type === "paragraph") {
              inner[0].runs.unshift({ text: item.checked ? "[x] " : "[ ] " });
            }
            return { blocks: inner };
          }),
        });
        break;
      case "table": {
        const [head, ...body] = node.children;
        const cells = (row: TableRow | undefined) =>
          (row?.children || []).map((cell) => trimRuns(phrasing(cell.children, {}, cites, links)));
        out.push({ type: "table", align: node.align || [], header: cells(head), rows: body.map(cells) });
        break;
      }
      case "blockquote":
        out.push({ type: "quote", blocks: blocks(node.children, cites, links) });
        break;
      case "code":
        out.push({ type: "code", text: sanitizeText(node.value) });
        break;
      case "thematicBreak":
        out.push({ type: "rule" });
        break;
      case "html": {
        const text = sanitizeText(node.value).trim();
        if (text) out.push({ type: "paragraph", runs: [{ text }] });
        break;
      }
      case "footnoteDefinition":
        out.push(...blocks(node.children, cites, links));
        break;
      default:
        break; // definitions, yaml etc. carry nothing to show
    }
  }
  return out;
}

export function parseMarkdown(markdown: string, cites: CitationResolver): ParseResult {
  const links: ParseResult["links"] = [];
  if (!markdown.trim()) return { blocks: [], links };
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  return { blocks: blocks(tree.children, cites, links), links };
}

/** Parse a single line of (possibly markdown) text into runs. */
export function parseInline(text: string, cites: CitationResolver): InlineRun[] {
  const { blocks: parsed } = parseMarkdown(text, cites);
  const runs: InlineRun[] = [];
  for (const b of parsed) {
    if (b.type === "paragraph" || b.type === "heading") {
      if (runs.length) runs.push({ text: " " });
      runs.push(...b.runs);
    }
  }
  // Text that markdown treats as block syntax ("1. ", "- ") — keep it literal.
  return runs.length ? mergeRuns(runs) : [{ text: sanitizeText(text).trim() }].filter((r) => r.text);
}
