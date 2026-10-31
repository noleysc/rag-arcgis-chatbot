import type { ComponentType } from "react";
import heroBg from "../assets/hero-bg.jpg";
import villageEmblem from "../assets/village-emblem.png";
import LatestNews from "../components/Dashboard/LatestNews";
import NextMeetings from "../components/Dashboard/NextMeetings";
import MapPreview from "../components/MapPreview/MapPreview";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChatIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalIcon,
  MapIcon,
  MapPinIcon,
  RecordsIcon,
  SparklesIcon,
} from "../components/Icons/Icons";
import { useLayerData } from "../hooks/useLayerData";
import { useMeetings } from "../hooks/useMeetings";
import { fetchLayerStats, type LayerStats } from "../lib/boardRecords";
import { routeHref, type Route } from "../lib/router";

type Tone = "green" | "blue" | "purple" | "amber";

const ACTIONS: Array<{
  route: Route;
  query?: string;
  title: string;
  text: string;
  tone: Tone;
  Icon: ComponentType<{ size?: number }>;
}> = [
  {
    route: "ask",
    title: "Ask about Estero",
    text: "Search projects, votes, locations, and meeting records.",
    tone: "green",
    Icon: ChatIcon,
  },
  {
    route: "map",
    title: "Explore the map",
    text: "View project locations and linked board records.",
    tone: "blue",
    Icon: MapIcon,
  },
  {
    route: "meetings",
    title: "Meeting activity",
    text: "Find upcoming meetings and recent meeting minutes.",
    tone: "amber",
    Icon: CalendarIcon,
  },
  {
    route: "records",
    query: "?tab=decisions",
    title: "Recent decisions",
    text: "See the latest board actions and open the original minutes.",
    tone: "purple",
    Icon: RecordsIcon,
  },
];

const STATS: Array<{
  label: string;
  value: (s: LayerStats) => number;
  Icon: ComponentType<{ size?: number }>;
}> = [
  { label: "Meetings", value: (s) => s.meetings, Icon: CalendarIcon },
  { label: "Projects", value: (s) => s.projects, Icon: MapPinIcon },
  { label: "Decisions", value: (s) => s.decisions, Icon: RecordsIcon },
  { label: "Years of records", value: (s) => new Date().getFullYear() - s.firstYear, Icon: ClockIcon },
];

/** Starter questions — each checked against the live backend to return a
 * grounded answer, not just a "no records" fallback. */
const HOME_SAMPLE_QUESTIONS = [
  "What happened with Corkscrew Road?",
  "What rezonings has the Village Council approved?",
  "What has been approved on Via Coconut Point?",
  "Find meetings about traffic safety",
];

const VILLAGE_URL = "https://estero-fl.gov/";

interface HomePageProps {
  onAsk: (question: string) => void;
}

export default function HomePage({ onAsk }: HomePageProps) {
  const stats = useLayerData(fetchLayerStats);
  const { meetings, loading: meetingsLoading, error: meetingsError } = useMeetings(3);

  return (
    <div className="home-grid">
      <div className="home-main">
        <section className="home-hero" style={{ backgroundImage: `url(${heroBg})` }} aria-labelledby="home-title">
          <div className="home-hero-body">
            <h1 id="home-title">
              <span className="home-hero-kicker">Welcome to</span>
              <span className="home-hero-name">
                Engage <span>Estero</span>
              </span>
            </h1>
            <p>Explore planning and zoning decisions, board records, and meeting information for the Village of Estero.</p>
            {/* Layer unreachable: drop the row rather than show four dashes. */}
            {stats !== null && (
              <ul className="home-stats" aria-busy={stats === undefined}>
                {STATS.map(({ label, value, Icon }) => (
                  <li key={label}>
                    <span className="home-stat-icon">
                      <Icon size={22} />
                    </span>
                    <span className="home-stat-text">
                      <strong>{stats ? value(stats).toLocaleString() : "…"}</strong>
                      <span>{label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="home-hero-motto">A stronger community through transparency and engagement.</p>
        </section>

        <ul className="home-actions">
          {ACTIONS.map(({ route, query, title, text, tone, Icon }) => (
            <li key={route}>
              <a className={`card action-card tone-${tone}`} href={routeHref(route) + (query || "")}>
                <span className="action-watermark">
                  <Icon size={92} />
                </span>
                <span className="action-icon">
                  <Icon size={26} />
                </span>
                <span className="action-title">{title}</span>
                <span className="action-text">{text}</span>
                <span className="action-arrow">
                  <ArrowRightIcon size={16} />
                </span>
              </a>
            </li>
          ))}
        </ul>

        <div className="home-split">
          <MapPreview onAsk={onAsk} />
          <LatestNews />
        </div>
      </div>

      <aside className="home-rail" aria-label="Get started">
        {/* The one "ask" panel on Home: starter questions to show what the
            assistant can answer. Typing your own goes through the header
            search, so there's no second input box here. */}
        <section className="card card-pad home-ask" aria-labelledby="home-ask-title">
          <div className="home-card-head">
            <span className="home-card-icon">
              <SparklesIcon size={20} />
            </span>
            <div className="home-card-titles">
              <h2 id="home-ask-title">Ask Estero</h2>
              <p>AI answers from Village board records and meeting minutes, with links to the sources.</p>
            </div>
          </div>
          <p className="home-try-label" id="home-try-label">
            Try asking:
          </p>
          <ul className="home-ask-list" aria-labelledby="home-try-label">
            {HOME_SAMPLE_QUESTIONS.map((q) => (
              <li key={q}>
                <button type="button" onClick={() => onAsk(q)}>
                  <span>{q}</span>
                  <ChevronRightIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
          <a className="home-ask-cta" href={routeHref("ask")}>
            Ask your own question <ArrowRightIcon size={16} />
          </a>
        </section>

        <NextMeetings meetings={meetings} loading={meetingsLoading} error={meetingsError} title="Upcoming meetings" />

        <section className="home-community" aria-labelledby="home-community-title">
          <div className="home-community-brand">
            <span className="home-community-emblem">
              <img src={villageEmblem} alt="" />
            </span>
            Village of Estero
          </div>
          <h2 id="home-community-title">Our Community</h2>
          <p>Stay informed, get involved, and help shape the future of Estero.</p>
          <a className="home-community-btn" href={VILLAGE_URL} target="_blank" rel="noopener noreferrer">
            Visit estero-fl.gov <ExternalIcon size={14} />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </section>
      </aside>
    </div>
  );
}
