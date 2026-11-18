import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBoards, fetchMinutesDocs, fetchRecordsPage, fetchRecordsSummary } from "./recordsApi";

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    void input;
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const calledUrl = (fn: ReturnType<typeof mockFetch>) => new URL(String(fn.mock.calls[0][0]));

afterEach(() => vi.unstubAllGlobals());

describe("recordsApi", () => {
  it("requests a page of records and maps them to BoardRecord", async () => {
    const fn = mockFetch({
      total: 3075,
      records: [
        {
          id: 3074,
          title: "  Sandy Lane Extension ",
          date: "2026-10-07",
          board: "Village Council",
          item_type: "Resolution",
          action: "Adopted Resolution 2026-11 ",
          application_id: "",
          minutes_url: "https://estero-fl.gov/minutes/10072026.pdf",
        },
        { id: 1, title: "", date: "2018-01-03", board: "Village Council", item_type: "", action: "", application_id: "", minutes_url: "" },
      ],
    });
    const res = await fetchRecordsPage({
      decisionsOnly: true,
      board: "Village Council",
      search: " sandy ",
      sort: "newest",
      offset: 25,
      pageSize: 25,
    });
    const url = calledUrl(fn);
    expect(url.pathname).toBe("/api/records");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: "decisions",
      board: "Village Council",
      q: "sandy",
      sort: "newest",
      offset: "25",
      limit: "25",
    });
    expect(res.total).toBe(3075);
    expect(res.records[0]).toEqual({
      id: 3074,
      title: "Sandy Lane Extension",
      category: "",
      date: "2026-10-07",
      board: "Village Council",
      itemType: "Resolution",
      action: "Adopted Resolution 2026-11",
      applicationId: "",
      minutesUrl: "https://estero-fl.gov/minutes/10072026.pdf",
    });
    expect(res.records[1].title).toBe("Untitled agenda item");
  });

  it("omits empty filters from the query string", async () => {
    const fn = mockFetch({ docs: [{ date: "2026-10-07", board: "Village Council", url: "https://x/a.pdf" }] });
    const docs = await fetchMinutesDocs({});
    expect(calledUrl(fn).pathname).toBe("/api/records/minutes");
    expect(calledUrl(fn).search).toBe("");
    expect(docs).toEqual([{ date: "2026-10-07", board: "Village Council", url: "https://x/a.pdf" }]);
  });

  it("reads boards and the summary", async () => {
    mockFetch({ boards: ["Planning Zoning & Design Board", "Village Council"] });
    expect(await fetchBoards()).toEqual(["Planning Zoning & Design Board", "Village Council"]);
    vi.unstubAllGlobals();
    mockFetch({ total: 3075, latest_meeting: "2026-10-07", first_meeting: "2016-01-06" });
    expect(await fetchRecordsSummary()).toEqual({ total: 3075, latestMeeting: "2026-10-07" });
  });

  it("rejects on an HTTP error so the page can show its retry message", async () => {
    mockFetch({ detail: "No board data loaded yet." }, 503);
    await expect(fetchBoards()).rejects.toThrow("HTTP 503");
  });
});
