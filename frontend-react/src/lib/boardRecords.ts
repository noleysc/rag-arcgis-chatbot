// The public feature layer behind the Instant App map. It's queryable on its
// own (CORS-enabled, no token), so the header count, Board Records table, and
// Meetings documents read it directly — same source the map draws from.
const LAYER_URL =
  "https://services2.arcgis.com/UzlfiFv8kzq0Q4vo/arcgis/rest/services/Estero_Board_Records_%E2%80%94_All_Categories/FeatureServer/0";

interface QueryResponse<T> {
  features?: Array<{ attributes: T; geometry?: { x: number; y: number } }>;
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

/** When the layer's records were last edited (epoch ms) — the header's
 * "updated" stamp. Falls back to the overall edit date, which also moves on
 * schema-only changes. */
export async function fetchLayerUpdated(): Promise<number> {
  const res = await fetch(`${LAYER_URL}?f=json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const info = (await res.json()) as { editingInfo?: { dataLastEditDate?: number; lastEditDate?: number } };
  const edited = info.editingInfo?.dataLastEditDate ?? info.editingInfo?.lastEditDate;
  if (typeof edited !== "number") throw new Error("No edit date on layer");
  return edited;
}

function countOf(data: QueryResponse<unknown>): number {
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
  // Location fields, requested only by fetchRecentProjects.
  Latitude?: number | null;
  Longitude?: number | null;
  GeocodeConfidence?: number | null;
  ParcelID?: string | null;
  LocationName?: string | null;
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

/** Headline numbers for the Home hero, all counted live on the layer. */
export interface LayerStats {
  /** Distinct minutes PDFs, i.e. meetings with minutes on file. */
  meetings: number;
  /** Distinct project names. */
  projects: number;
  /** Agenda items recording a formal board action. */
  decisions: number;
  /** Year of the earliest meeting on the layer. */
  firstYear: number;
}

export async function fetchLayerStats(): Promise<LayerStats> {
  const distinct = (where: string, field: string) =>
    queryLayer({ where, outFields: field, returnDistinctValues: true, returnCountOnly: true, returnGeometry: false });
  const [meetings, projects, decisions, range] = await Promise.all([
    distinct("Document_Link IS NOT NULL", "Document_Link"),
    distinct(PRIMARY_ONLY, "ProjectName"),
    queryLayer({ where: recordsWhere({ decisionsOnly: true }), returnCountOnly: true }),
    queryLayer<{ first: string | null }>({
      where: "1=1",
      outStatistics: JSON.stringify([
        { statisticType: "min", onStatisticField: "MeetingDate", outStatisticFieldName: "first" },
      ]),
    }),
  ]);
  const firstYear = Number(range.features?.[0]?.attributes.first?.slice(0, 4));
  if (!firstYear) throw new Error("No meeting dates on layer");
  return {
    meetings: countOf(meetings),
    projects: countOf(projects),
    decisions: countOf(decisions),
    firstYear,
  };
}

/** One point on the map layer. A located agenda item can have several. */
export interface MapPoint {
  id: number;
  title: string;
  category: string;
  /** YYYY-MM-DD */
  date: string;
  /** Web Mercator (EPSG:3857) meters, the layer's own spatial reference. */
  x: number;
  y: number;
}

/** Every point on the layer, newest meeting first (~800 today, so one
 * request under the layer's 1,000-row cap). */
export async function fetchMapPoints(): Promise<MapPoint[]> {
  const data = await queryLayer<LayerRow>({
    where: "1=1",
    outFields: "ObjectId,ProjectName,LayerCategory,MeetingDate",
    orderByFields: "MeetingDate DESC,ObjectId DESC",
    outSR: 3857,
    resultRecordCount: 1000,
  });
  const points: MapPoint[] = [];
  for (const { attributes: a, geometry: g } of data.features || []) {
    if (!g) continue;
    points.push({
      id: a.ObjectId,
      title: (a.ProjectName || "").trim() || "Untitled agenda item",
      category: a.LayerCategory || "",
      date: a.MeetingDate || "",
      x: g.x,
      y: g.y,
    });
  }
  return points;
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

/** Where an agenda item sits on the map, for the Recent Projects thumbnails. */
export interface MappedLocation {
  lat: number;
  lon: number;
  /** The pipeline's name for the place: an address, subdivision, corridor… */
  name: string;
  /** Lee County parcel (STRAP) when the point resolved to one, else "". */
  parcelId: string;
  /** The pipeline's GeocodeConfidence, 0–1. 0.5 means the point was
   * inherited from a related item (pipeline/eaglegis/location_propagation.py). */
  confidence: number;
}

export interface MappedRecord extends BoardRecord {
  /** null when the row has no usable coordinates. */
  location: MappedLocation | null;
}

// Lee County with a margin. A point outside it is a geocoding slip (0,0, or
// latitude and longitude swapped), not a place.
const LEE_COUNTY = { south: 26.2, north: 26.9, west: -82.4, east: -81.4 };

function toLocation(row: LayerRow): MappedLocation | null {
  const lat = row.Latitude;
  const lon = row.Longitude;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < LEE_COUNTY.south || lat > LEE_COUNTY.north || lon < LEE_COUNTY.west || lon > LEE_COUNTY.east) return null;
  return {
    lat,
    lon,
    name: (row.LocationName || "").trim(),
    parcelId: (row.ParcelID || "").trim(),
    // Unknown confidence is treated as approximate, the lowest mapped tier.
    confidence: row.GeocodeConfidence ?? 0.5,
  };
}

/** Latest mapped items, one per project name, newest meeting first. */
export async function fetchRecentProjects(opts: {
  category?: string;
  search?: string;
  limit: number;
}): Promise<MappedRecord[]> {
  const clauses = [PRIMARY_ONLY];
  if (opts.category) clauses.push(equalsClause("LayerCategory", opts.category));
  const search = opts.search ? searchClause(opts.search, ["ProjectName"]) : null;
  if (search) clauses.push(search);
  const data = await queryLayer<LayerRow>({
    where: clauses.join(" AND "),
    outFields: `${RECORD_FIELDS},Latitude,Longitude,GeocodeConfidence,ParcelID,LocationName`,
    orderByFields: "MeetingDate DESC,ObjectId DESC",
    // Over-fetch, since the same project often has several items per meeting.
    resultRecordCount: opts.limit * 6,
    returnGeometry: false,
  });
  const seen = new Set<string>();
  const out: MappedRecord[] = [];
  for (const f of data.features || []) {
    const rec = toRecord(f.attributes);
    const key = rec.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...rec, location: toLocation(f.attributes) });
    if (out.length === opts.limit) break;
  }
  return out;
}
