// The public feature layer behind the Instant App map. It's queryable on its
// own (CORS-enabled, no token), so the header count, Board Records table, and
// Meetings documents read it directly — same source the map draws from.
const LAYER_URL =
  "https://services2.arcgis.com/UzlfiFv8kzq0Q4vo/arcgis/rest/services/Estero_Board_Records_%E2%80%94_All_Categories/FeatureServer/0";

interface QueryResponse<T> {
  features?: Array<{ attributes: T }>;
  count?: number;
  error?: { message?: string };
}

async function queryLayer<T>(params: Record<string, string | number | boolean>): Promise<QueryResponse<T>> {
  const qs = new URLSearchParams({ f: "json" });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${LAYER_URL}/query?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as QueryResponse<T>;
  // ArcGIS reports query errors with a 200 and an `error` body.
  if (data.error) throw new Error(data.error.message || "ArcGIS query failed");
  return data;
}

/** Total point count on the map layer — what the header's live badge shows. */
export async function fetchRecordCount(): Promise<number> {
  const data = await queryLayer({ where: "1=1", returnCountOnly: true });
  if (typeof data.count !== "number") throw new Error("No count in response");
  return data.count;
}

interface LayerRow {
  ObjectId: number;
  ProjectName: string | null;
  LayerCategory: string | null;
  MeetingDate: string | null;
  Board: string | null;
  AgendaItemType: string | null;
  ActionTaken: string | null;
  ApplicationID: string | null;
  Document_Link: string | null;
}

/** One agenda item as the UI uses it. Note the layer's own `Status` field is
 * left out on purpose: it's the pipeline's meeting-processing flag
 * ("Accepted" = minutes PDF parsed, "Pending" = legacy CSV only — see
 * pipeline/build.py), not the board's decision. */
export interface BoardRecord {
  id: number;
  title: string;
  category: string;
  /** YYYY-MM-DD */
  date: string;
  board: string;
  itemType: string;
  action: string;
  applicationId: string;
  minutesUrl: string;
}

const RECORD_FIELDS =
  "ObjectId,ProjectName,LayerCategory,MeetingDate,Board,AgendaItemType,ActionTaken,ApplicationID,Document_Link";

function toRecord(row: LayerRow): BoardRecord {
  return {
    id: row.ObjectId,
    title: (row.ProjectName || "").trim() || "Untitled agenda item",
    category: row.LayerCategory || "",
    date: row.MeetingDate || "",
    board: row.Board || "",
    itemType: row.AgendaItemType && row.AgendaItemType !== "Unknown" ? row.AgendaItemType : "",
    action: (row.ActionTaken || "").trim(),
    applicationId: row.ApplicationID || "",
    minutesUrl: row.Document_Link || "",
  };
}

/** Quote a value for an ArcGIS SQL-92 where clause. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Case-insensitive "contains" across the given fields. LIKE wildcards in
 * the visitor's text are dropped rather than escaped (ArcGIS Online's
 * standardized queries don't support ESCAPE). */
export function searchClause(term: string, fields: string[]): string | null {
  const cleaned = term.replace(/[%_]/g, " ").trim().toUpperCase();
  if (!cleaned) return null;
  const pattern = sqlString(`%${cleaned}%`);
  return `(${fields.map((f) => `UPPER(${f}) LIKE ${pattern}`).join(" OR ")})`;
}

export function equalsClause(field: string, value: string): string {
  return `${field} = ${sqlString(value)}`;
}

/** A located agenda item can appear once per location; IsPrimary keeps one
 * row per item so lists don't repeat. */
const PRIMARY_ONLY = "IsPrimary = 'true'";

/** Agenda item types that record a formal board action — the "Decisions"
 * tab, and the gold decision tag in the records table. */
export const DECISION_ITEM_TYPES = ["Vote", "Ordinance", "Resolution", "Contract Approval", "Budget", "Consent Agenda"];

export function isDecisionType(itemType: string): boolean {
  return DECISION_ITEM_TYPES.includes(itemType);
}

export type RecordSort = "newest" | "oldest" | "title";

const SORT_FIELDS: Record<RecordSort, string> = {
  newest: "MeetingDate DESC,ObjectId DESC",
  oldest: "MeetingDate ASC,ObjectId ASC",
  title: "ProjectName ASC,MeetingDate DESC",
};

const SEARCH_FIELDS = ["ProjectName", "ActionTaken", "ApplicationID"];

function recordsWhere(opts: { decisionsOnly?: boolean; board?: string; search?: string }): string {
  const clauses = [PRIMARY_ONLY];
  if (opts.decisionsOnly) {
    clauses.push(`AgendaItemType IN (${DECISION_ITEM_TYPES.map(sqlString).join(",")})`);
  }
  if (opts.board) clauses.push(equalsClause("Board", opts.board));
  const search = opts.search ? searchClause(opts.search, SEARCH_FIELDS) : null;
  if (search) clauses.push(search);
  return clauses.join(" AND ");
}

/** One page of agenda items plus the total matching count. */
export async function fetchRecordsPage(opts: {
  decisionsOnly: boolean;
  board: string;
  search: string;
  sort: RecordSort;
  offset: number;
  pageSize: number;
}): Promise<{ records: BoardRecord[]; total: number }> {
  const where = recordsWhere(opts);
  const [countRes, pageRes] = await Promise.all([
    queryLayer({ where, returnCountOnly: true }),
    queryLayer<LayerRow>({
      where,
      outFields: RECORD_FIELDS,
      orderByFields: SORT_FIELDS[opts.sort],
      resultOffset: opts.offset,
      resultRecordCount: opts.pageSize,
      returnGeometry: false,
    }),
  ]);
  return {
    records: (pageRes.features || []).map((f) => toRecord(f.attributes)),
    total: countRes.count ?? 0,
  };
}

/** Distinct board names on the layer, for the board filter. */
export async function fetchBoards(): Promise<string[]> {
  const data = await queryLayer<{ Board: string | null }>({
    where: "1=1",
    outFields: "Board",
    returnDistinctValues: true,
    orderByFields: "Board ASC",
    returnGeometry: false,
  });
  return (data.features || []).map((f) => f.attributes.Board || "").filter(Boolean);
}

/** A meeting's minutes PDF, as linked from its agenda items. */
export interface MinutesDoc {
  /** YYYY-MM-DD */
  date: string;
  board: string;
  url: string;
}

/** Every distinct minutes PDF (newest first), optionally narrowed to
 * meetings with an agenda item matching `search`. Fetched whole — a few
 * hundred rows — because the layer can't count distinct values for paging. */
export async function fetchMinutesDocs(opts: { board?: string; search?: string } = {}): Promise<MinutesDoc[]> {
  const clauses = ["Document_Link IS NOT NULL"];
  if (opts.board) clauses.push(equalsClause("Board", opts.board));
  const search = opts.search ? searchClause(opts.search, SEARCH_FIELDS) : null;
  if (search) clauses.push(search);
  const data = await queryLayer<{ MeetingDate: string | null; Board: string | null; Document_Link: string | null }>({
    where: clauses.join(" AND "),
    outFields: "MeetingDate,Board,Document_Link",
    returnDistinctValues: true,
    orderByFields: "MeetingDate DESC",
    returnGeometry: false,
  });
  const seen = new Set<string>();
  const docs: MinutesDoc[] = [];
  for (const { attributes: a } of data.features || []) {
    if (!a.Document_Link || seen.has(a.Document_Link)) continue;
    seen.add(a.Document_Link);
    docs.push({ date: a.MeetingDate || "", board: a.Board || "", url: a.Document_Link });
  }
  return docs;
}

/** Latest mapped items, one per project name, newest meeting first. */
export async function fetchRecentProjects(opts: {
  category?: string;
  search?: string;
  limit: number;
}): Promise<BoardRecord[]> {
  const clauses = [PRIMARY_ONLY];
  if (opts.category) clauses.push(equalsClause("LayerCategory", opts.category));
  const search = opts.search ? searchClause(opts.search, ["ProjectName"]) : null;
  if (search) clauses.push(search);
  const data = await queryLayer<LayerRow>({
    where: clauses.join(" AND "),
    outFields: RECORD_FIELDS,
    orderByFields: "MeetingDate DESC,ObjectId DESC",
    // Over-fetch, since the same project often has several items per meeting.
    resultRecordCount: opts.limit * 6,
    returnGeometry: false,
  });
  const seen = new Set<string>();
  const out: BoardRecord[] = [];
  for (const f of data.features || []) {
    const rec = toRecord(f.attributes);
    const key = rec.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rec);
    if (out.length === opts.limit) break;
  }
  return out;
}
