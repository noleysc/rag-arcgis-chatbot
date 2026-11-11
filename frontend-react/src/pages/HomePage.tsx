import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import heroBg from "../assets/hero-bg.jpg";
import villageEmblem from "../assets/village-emblem.png";
import NextMeetings from "../components/Dashboard/NextMeetings";
import {
  ArrowRightIcon,
  ChatIcon,
  ChevronRightIcon,
  ExternalIcon,
  MapIcon,
  MapPinIcon,
  ProjectsIcon,
  SparklesIcon,
} from "../components/Icons/Icons";
import { useMeetings } from "../hooks/useMeetings";
import { formatShortDate } from "../lib/dates";
import { statusClass } from "../lib/parseAnswer";
import { fetchTrackerHome, type ProjectSummary } from "../lib/projects";
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
    route: "projects",
    title: "All projects",
    text: "Browse every tracked development with status and category filters.",
    tone: "green",
    Icon: ProjectsIcon,
  },
  {
    route: "projects",
    query: "?tab=nearby",
    title: "Near where I live",
    text: "Enter your address and subscribe to board updates nearby.",
    tone: "blue",
    Icon: MapPinIcon,
  },
  {
    route: "map",
    title: "Explore the map",
    text: "See project locations and open the full board records map.",
    tone: "amber",
    Icon: MapIcon,
  },
  {
    route: "ask",
    title: "Ask about a project",
    text: "Search votes, locations, and meeting minutes in plain language.",
    tone: "purple",
    Icon: ChatIcon,
  },
];

const HOME_SAMPLE_QUESTIONS = [
  "What happened with Corkscrew Road?",
  "What rezonings has the Village Council approved?",
  "What has been approved on Via Coconut Point?",
  "Any continued cases still under review?",
];

const ESTEROTODAY_URL = "https://esterotoday.com/";

interface HomePageProps {
  onAsk: (question: string) => void;
}

export default function HomePage({ onAsk }: HomePageProps) {
  const { meetings, loading: meetingsLoading, error: meetingsError } = useMeetings(3);
  const [tracker, setTracker] = useState<{
    underReview: ProjectSummary[];
    recentlyDecided: ProjectSummary[];
    totals: { underReview: number; recentlyDecided: number; projects: number };
  } | null>(null);
  const [trackerError, setTrackerError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTrackerHome({ reviewLimit: 5, recentLimit: 5 })
      .then((data) => {
        if (!cancelled) setTracker(data);
      })
      .catch(() => {
        if (!cancelled) setTrackerError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="home-grid">
      <div className="home-main">
        <section className="home-hero home-hero-tracker" style={{ backgroundImage: `url(${heroBg})` }} aria-labelledby="home-title">
          <div className="home-hero-body">
            <h1 id="home-title">
              <span className="home-hero-kicker">Development tracker</span>
              <span className="home-hero-name">
                Engage <span>Estero</span>
              </span>
            </h1>
            <p>Follow Village land-use cases — under review, recently decided, and near where you live.</p>
            <div className="home-hero-ctas">
              <a className="home-ask-cta" href={routeHref("projects")}>
                Browse projects <ArrowRightIcon size={16} />
              </a>
              <a className="home-hero-secondary" href={`${routeHref("projects")}?tab=nearby`}>
                Alerts near me
              </a>
            </div>
          </div>
          <p className="home-hero-motto">A stronger community through transparency and engagement.</p>
        </section>

        <section className="tracker-panels" aria-label="Development status">
          <TrackerColumn
            title="Under review"
            subtitle="Continued, tabled, or pending board items"
            href={routeHref("projects")}
            empty="No open review items right now."
            error={trackerError}
            loading={!tracker && !trackerError}
            count={tracker?.totals.underReview}
            projects={tracker?.underReview || []}
          />
          <TrackerColumn
            title="Recently decided"
            subtitle="Approved, denied, or withdrawn"
            href={`${routeHref("projects")}?tab=recent`}
            empty="No recent decisions found."
            error={trackerError}
            loading={!tracker && !trackerError}
            count={tracker?.totals.recentlyDecided}
            projects={tracker?.recentlyDecided || []}
          />
          <aside className="tracker-column tracker-near">
            <div className="tracker-column-head">
              <h2>Near you</h2>
              <p>Get email alerts when boards act near your home.</p>
            </div>
            <p className="tracker-near-copy">
              Enter your Estero address, preview nearby projects, and subscribe in one step.
            </p>
            <a className="btn-primary" href={`${routeHref("projects")}?tab=nearby`}>
              Set my address <ArrowRightIcon size={16} />
            </a>
            <a className="tracker-near-link" href={`${routeHref("projects")}?tab=recent`}>
              Or see what’s happening village-wide
            </a>
          </aside>
        </section>

        <ul className="home-actions">
          {ACTIONS.map(({ route, query, title, text, tone, Icon }) => (
            <li key={`${route}:${query || ""}:${title}`}>
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
      </div>

      <aside className="home-rail" aria-label="Get started">
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
            EsteroToday
          </div>
          <h2 id="home-community-title">Local news &amp; meetings</h2>
          <p>Read EsteroToday coverage, then jump to meetings and community events.</p>
          <div className="home-community-links">
            <a className="home-community-btn" href={ESTEROTODAY_URL} target="_blank" rel="noopener noreferrer">
              Visit esterotoday.com <ExternalIcon size={14} />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a className="home-community-btn home-community-btn-ghost" href={routeHref("meetings")}>
              Meeting schedule <ArrowRightIcon size={14} />
            </a>
            <a className="home-community-btn home-community-btn-ghost" href={routeHref("pulse")}>
              Community events
            </a>
          </div>
        </section>
      </aside>
    </div>
  );
}

function TrackerColumn({
  title,
  subtitle,
  href,
  projects,
  loading,
  error,
  empty,
  count,
}: {
  title: string;
  subtitle: string;
  href: string;
  projects: ProjectSummary[];
  loading: boolean;
  error: boolean;
  empty: string;
  count?: number;
}) {
  return (
    <section className="tracker-column">
      <div className="tracker-column-head">
        <h2>
          {title}
          {typeof count === "number" && <span className="tracker-count">{count}</span>}
        </h2>
        <p>{subtitle}</p>
      </div>
      {loading && <p className="empty-note">Loading…</p>}
      {error && <p className="empty-note">Couldn’t load projects.</p>}
      {!loading && !error && projects.length === 0 && <p className="empty-note">{empty}</p>}
      {!loading && !error && projects.length > 0 && (
        <ul className="tracker-list">
          {projects.map((p) => (
            <li key={p.projectId}>
              <a href={`${routeHref("projects")}?tab=browse&id=${encodeURIComponent(p.projectId)}`}>
                <span className="tracker-list-title">{p.name}</span>
                <span className="tracker-list-meta">
                  {[p.lastDate ? formatShortDate(p.lastDate) : null, p.location].filter(Boolean).join(" · ")}
                </span>
                {p.status && <span className={`proj-status-chip ${statusClass(p.status)}`}>{p.status}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
      <a className="tracker-column-more" href={href}>
        View all <ArrowRightIcon size={14} />
      </a>
    </section>
  );
}
