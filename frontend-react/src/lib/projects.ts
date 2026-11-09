import { API_BASE } from "./config";

export interface ProjectSummary {
  projectId: string;
  name: string;
  status: string;
  category: string;
  categoryKey: string;
  lastDate: string | null;
  firstDate: string | null;
  board: string | null;
  applicationId: string | null;
  location: string | null;
  summary: string | null;
  documentUrl: string | null;
  lat: number | null;
  lng: number | null;
  parcelId: string | null;
  itemCount: number;
  distanceMiles?: number | null;
}

export interface RelatedProject {
  projectId: string;
  name: string;
  status: string | null;
  lastDate: string | null;
  location: string | null;
}

export interface ProjectTimelineEntry {
  date: string | null;
  event: string;
  status: string;
  board: string | null;
  applicationId: string | null;
  documentUrl: string | null;
  recordId: string;
}

export interface ProjectDetail extends ProjectSummary {
  timeline: ProjectTimelineEntry[];
  related: RelatedProject[];
}

export interface ActivityItem {
  projectId: string;
  name: string;
  date: string | null;
  status: string | null;
  board: string | null;
  summary: string | null;
  applicationId: string | null;
  location: string | null;
  category: string;
  documentUrl: string | null;
  lat: number | null;
  lng: number | null;
  distanceMiles: number | null;
}

export interface CategoryFilter {
  key: string;
  label: string;
}

export interface ProjectsPageResult {
  projects: ProjectSummary[];
  total: number;
  offset: number;
  limit: number;
  filters: { statuses: string[]; categories: CategoryFilter[] };
}

interface ApiProject {
  project_id: string;
  name: string;
  status: string;
  category: string;
  category_key: string;
  last_date: string | null;
  first_date: string | null;
  board: string | null;
  application_id: string | null;
  location: string | null;
  summary: string | null;
  document_url: string | null;
  lat: number | null;
  lng: number | null;
  parcel_id?: string | null;
  item_count: number;
  distance_miles?: number | null;
  timeline?: Array<{
    date: string | null;
    event: string;
    status: string;
    board: string | null;
    application_id: string | null;
    document_url: string | null;
    record_id: string;
  }>;
  related?: Array<{
    project_id: string;
    name: string;
    status: string | null;
    last_date: string | null;
    location: string | null;
  }>;
}

function mapProject(p: ApiProject): ProjectSummary {
  return {
    projectId: p.project_id,
    name: p.name,
    status: p.status,
    category: p.category,
    categoryKey: p.category_key,
    lastDate: p.last_date,
    firstDate: p.first_date,
    board: p.board,
    applicationId: p.application_id,
    location: p.location,
    summary: p.summary,
    documentUrl: p.document_url,
    lat: p.lat,
    lng: p.lng,
    parcelId: p.parcel_id ?? null,
    itemCount: p.item_count,
    distanceMiles: p.distance_miles ?? null,
  };
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return data as T;
}

export async function fetchProjects(params: {
  q?: string;
  status?: string;
  category?: string;
  sort?: string;
  offset?: number;
  limit?: number;
}): Promise<ProjectsPageResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  if (params.category) qs.set("category", params.category);
  if (params.sort) qs.set("sort", params.sort);
  qs.set("offset", String(params.offset ?? 0));
  qs.set("limit", String(params.limit ?? 25));
  const data = await getJson<{
    projects: ApiProject[];
    total: number;
    offset: number;
    limit: number;
    filters: { statuses: string[]; categories: Array<{ key: string; label: string }> };
  }>(`/api/projects?${qs}`);
  return {
    projects: data.projects.map(mapProject),
    total: data.total,
    offset: data.offset,
    limit: data.limit,
    filters: data.filters,
  };
}

export async function fetchProject(projectId: string): Promise<ProjectDetail> {
  const data = await getJson<ApiProject>(`/api/projects/${encodeURIComponent(projectId)}`);
  const base = mapProject(data);
  return {
    ...base,
    timeline: (data.timeline || []).map((t) => ({
      date: t.date,
      event: t.event,
      status: t.status,
      board: t.board,
      applicationId: t.application_id,
      documentUrl: t.document_url,
      recordId: t.record_id,
    })),
    related: (data.related || []).map((r) => ({
      projectId: r.project_id,
      name: r.name,
      status: r.status,
      lastDate: r.last_date,
      location: r.location,
    })),
  };
}

export async function fetchTrackerHome(limits?: {
  reviewLimit?: number;
  recentLimit?: number;
}): Promise<{
  underReview: ProjectSummary[];
  recentlyDecided: ProjectSummary[];
  totals: { underReview: number; recentlyDecided: number; projects: number };
}> {
  const qs = new URLSearchParams();
  qs.set("review_limit", String(limits?.reviewLimit ?? 6));
  qs.set("recent_limit", String(limits?.recentLimit ?? 6));
  const data = await getJson<{
    under_review: ApiProject[];
    recently_decided: ApiProject[];
    totals: { under_review: number; recently_decided: number; projects: number };
  }>(`/api/tracker/home?${qs}`);
  return {
    underReview: data.under_review.map(mapProject),
    recentlyDecided: data.recently_decided.map(mapProject),
    totals: {
      underReview: data.totals.under_review,
      recentlyDecided: data.totals.recently_decided,
      projects: data.totals.projects,
    },
  };
}

export async function fetchRecentActivity(params: {
  days?: number;
  limit?: number;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
}): Promise<{ activity: ActivityItem[]; total: number; days: number }> {
  const qs = new URLSearchParams();
  qs.set("days", String(params.days ?? 180));
  qs.set("limit", String(params.limit ?? 40));
  if (params.lat != null) qs.set("lat", String(params.lat));
  if (params.lng != null) qs.set("lng", String(params.lng));
  if (params.radiusMiles != null) qs.set("radius_miles", String(params.radiusMiles));
  const data = await getJson<{
    activity: Array<{
      project_id: string;
      name: string;
      date: string | null;
      status: string | null;
      board: string | null;
      summary: string | null;
      application_id: string | null;
      location: string | null;
      category: string;
      document_url: string | null;
      lat: number | null;
      lng: number | null;
      distance_miles: number | null;
    }>;
    total: number;
    days: number;
  }>(`/api/activity/recent?${qs}`);
  return {
    days: data.days,
    total: data.total,
    activity: data.activity.map((a) => ({
      projectId: a.project_id,
      name: a.name,
      date: a.date,
      status: a.status,
      board: a.board,
      summary: a.summary,
      applicationId: a.application_id,
      location: a.location,
      category: a.category,
      documentUrl: a.document_url,
      lat: a.lat,
      lng: a.lng,
      distanceMiles: a.distance_miles,
    })),
  };
}

export interface NearbyPreviewResult {
  ok: boolean;
  error: string | null;
  geocode?: {
    lat: number;
    lng: number;
    display_name: string;
    source: string;
    confidence: number;
  };
  radius_miles?: number;
  projects: ProjectSummary[];
  activity: ActivityItem[];
}

export async function previewNearby(body: {
  address: string;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
}): Promise<NearbyPreviewResult> {
  const raw = await postJson<{
    ok: boolean;
    error: string | null;
    geocode?: NearbyPreviewResult["geocode"];
    radius_miles?: number;
    projects: ApiProject[];
    activity: Array<{
      project_id: string;
      name: string;
      date: string | null;
      status: string | null;
      board: string | null;
      summary: string | null;
      application_id: string | null;
      location: string | null;
      category: string;
      document_url: string | null;
      lat: number | null;
      lng: number | null;
      distance_miles: number | null;
    }>;
  }>("/api/nearby/preview", {
    address: body.address,
    lat: body.lat,
    lng: body.lng,
    radius_miles: body.radiusMiles ?? 2,
  });
  return {
    ok: raw.ok,
    error: raw.error,
    geocode: raw.geocode,
    radius_miles: raw.radius_miles,
    projects: (raw.projects || []).map(mapProject),
    activity: (raw.activity || []).map((a) => ({
      projectId: a.project_id,
      name: a.name,
      date: a.date,
      status: a.status,
      board: a.board,
      summary: a.summary,
      applicationId: a.application_id,
      location: a.location,
      category: a.category,
      documentUrl: a.document_url,
      lat: a.lat,
      lng: a.lng,
      distanceMiles: a.distance_miles,
    })),
  };
}

export async function subscribeNearby(body: {
  email: string;
  address: string;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
}): Promise<{ message: string; subscription: { id: string; unsubscribe_token: string } }> {
  return postJson("/api/nearby/subscribe", {
    email: body.email,
    address: body.address,
    lat: body.lat,
    lng: body.lng,
    radius_miles: body.radiusMiles ?? 2,
  });
}
