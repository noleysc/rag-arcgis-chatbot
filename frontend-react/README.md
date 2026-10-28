# Ask Engage Estero — React frontend

Vite + React + TypeScript frontend for the Engage Estero civic chatbot. Talks to the
existing FastAPI backend in `../backend` — that service is unchanged; only the UI moved.

## Run it

```bash
npm install
npm run dev
```

This starts the Vite dev server (default `http://localhost:5173`). Make sure the backend is
running separately:

```bash
cd ../backend
uvicorn app:app --reload
```

## Configuration

The backend base URL is read from the `VITE_API_BASE` env var at build time, falling back to
`http://localhost:8000` if unset. Copy `.env.example` to `.env.local` and edit as needed:

```bash
cp .env.example .env.local
```

```
VITE_API_BASE=http://localhost:8000       # local dev (default)
VITE_API_BASE=   # empty = same-origin (VPS / Docker production)
```

## Scripts

- `npm run dev` — start the dev server with HMR
- `npm run build` — type-check (`tsc -b`) and produce a production build in `dist/`
- `npm run preview` — serve the production build locally
- `npm run lint` — run oxlint

## Layout and routing

A left-sidebar app shell (`App.tsx`) with one page per route. Routes are **hash routes**
(`#/map`, `#/records?tab=minutes`) — production serves the SPA through FastAPI's
`StaticFiles`, which has no `index.html` fallback, so real paths would 404 on refresh.
`lib/router.ts` is a ~40-line `useSyncExternalStore` router; no router dependency.

| Route | Page | Data |
| --- | --- | --- |
| `#/` | `HomePage` | EsteroToday WP feed (`useNews`), quick search → chat |
| `#/map` | `MapPage` | ArcGIS Instant App iframe, webmap legend, map feature layer |
| `#/ask` | `AskPage` | `useChat` (`/chat/stream`, falls back to `/chat`) |
| `#/records` | `RecordsPage` | map feature layer (agenda items, decisions, minutes PDFs) |
| `#/meetings` | `MeetingsPage` | `public/meetings.json` + minutes PDFs from the feature layer |
| `#/pulse` | `PulsePage` | `/api/events`, `meetings.json`, EsteroToday feed |

Chat state lives in `App` so a conversation survives page changes; Home, Map and Records
send questions to it with `ask()` (navigate to `#/ask` + send). The map page is mounted on
first visit and then only hidden, never unmounted — reloading the Esri app is slow and
loses the visitor's pan/zoom.

Under 900px the sidebar becomes an off-canvas drawer (hamburger in the header); the rest
of the app is `inert` while it's open.

Theme tokens (shell navy, green accent, gold decision markers, card radius/shadow) live
in `src/index.css`.

## Structure

```
src/
  pages/            one component per route + pages.css (per-page layout)
  components/
    Sidebar/        nav, skyline art, mobile drawer
    TopBar/         title, admin link, live record-count pill
    PageHeader/     page title/subtitle/actions
    ChatPanel/      ChatEmptyState, MessageList, Message, ProjectCard, ArticleCard,
                    SourcesList, TypingIndicator, ChatInput, DatasetBar
    MapPanel/       Instant App + StoryMap iframes with Map | Story switch
    Dashboard/      NextMeetings, LatestNews, UpcomingEvents, MiniCalendar, RecentDecisions
    Icons/          inline SVG icons (no icon package)
  hooks/
    useChat.ts      send/streaming (SSE with fallback to /chat), message state
    useRecordCount.ts  live count from the map feature layer (header pill)
    useMeetings.ts  loads public/meetings.json (upcoming only, or all with includePast)
    useNews.ts      fetches latest 5 EsteroToday posts (direct browser fetch)
    useEvents.ts    GET /api/events
  lib/
    router.ts       hash routes
    boardRecords.ts queries the public "Estero Board Records — All Categories" layer
    mapLegend.ts    legend entries from the embedded webmap's renderer
    parseAnswer.ts  JSON-block card extraction, legacy delimiter fallback, prose cleanup
    mapViewStore.ts singleton access to a live MapView (no-ops with the iframe map)
    config.ts       API_BASE resolution
public/
  meetings.json     manually maintained meeting schedule — see the file's own _comment
                    field for the update process and source of truth
```

## Board records data

Board Records, Explore Map's project list and Meetings' documents read the public map
feature layer directly (CORS-enabled, no token), so they always match what the map draws.
One row per agenda item uses `IsPrimary = 'true'` (an item can have several locations).

The layer's `Status` field is **not** a board decision — it's the pipeline's
meeting-processing flag ("Accepted" = minutes PDF parsed, "Pending" = legacy CSV only; see
`pipeline/build.py`) — so the UI never shows it as one. Item type (`AgendaItemType`) and
the recorded action (`ActionTaken`) are shown instead; formal-action types get a gold tag.

## Community Pulse

- **Next Meetings** — reads `public/meetings.json`, a **manually maintained** file. Update it
  monthly: drop past dates, add the next occurrence(s), and verify against
  https://estero-fl.gov/agendas-minutes/. Cadence notes live in the file's `_comment` field.
  A gold dot shows on the sidebar's Meetings item when a meeting falls within 7 days.
- **Latest from Estero Today** — the 5 newest posts from EsteroToday's public WordPress
  REST API (`useNews.ts`). Also on Home.
- **Upcoming Events** — `GET /api/events` aggregates EsteroToday's Events Calendar (all
  categories), FGCU Athletics ICS (local games), Lee County Parks calendar, Visit Fort Myers
  tourism events, and optional `public/community-events.json`. Filter chips: All / Government /
  Music / Markets / Sports / Fairs / Community. Mini-calendar merges these with Village meetings.

Chat questions like "what's happening this weekend?" or "any concerts?" take a structured
**events** path (no RAG) and return short bullets from the same feed.

## Notes

- `POST /chat/stream` is called first; if the backend doesn't implement it (404/network error),
  it falls back to `POST /chat` transparently.
- Board cards include `lat`/`lng` when the source CSV has coordinates. When present, a
  "Show on map" button opens the map page. The map is a cross-origin Esri iframe, so it
  can't be panned to the record from here.
- The old vanilla frontend in `../frontend` is untouched and still works standalone.
