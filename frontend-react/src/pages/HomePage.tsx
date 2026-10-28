import { useState } from "react";
import type { ComponentType, FormEvent } from "react";
import heroBg from "../assets/hero-bg.jpg";
import LatestNews from "../components/Dashboard/LatestNews";
import { ArrowRightIcon, CalendarIcon, ChatIcon, MapIcon, RecordsIcon, SearchIcon } from "../components/Icons/Icons";
import { routeHref, type Route } from "../lib/router";

const ACTIONS: Array<{
  route: Route;
  query?: string;
  title: string;
  text: string;
  Icon: ComponentType<{ size?: number }>;
}> = [
  {
    route: "ask",
    title: "Ask about Estero",
    text: "Search projects, votes, locations, and meeting records.",
    Icon: ChatIcon,
  },
  {
    route: "map",
    title: "Explore the map",
    text: "View project locations and linked board records.",
    Icon: MapIcon,
  },
  {
    route: "records",
    query: "?tab=decisions",
    title: "Recent decisions",
    text: "See the latest board actions and open the original minutes.",
    Icon: RecordsIcon,
  },
  {
    route: "meetings",
    title: "Meeting activity",
    text: "Find upcoming meetings and recent meeting minutes.",
    Icon: CalendarIcon,
  },
];

/** Starter questions — each checked against the live backend to return a
 * grounded answer, not just a "no records" fallback. */
const HOME_SAMPLE_QUESTIONS = [
  "What happened with Corkscrew Road?",
  "What rezonings has the Village Council approved?",
  "What has been approved on Via Coconut Point?",
  "Find meetings about traffic safety",
];

interface HomePageProps {
  onAsk: (question: string) => void;
}

export default function HomePage({ onAsk }: HomePageProps) {
  const [query, setQuery] = useState("");

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (q) onAsk(q);
    else e.currentTarget.querySelector("input")?.focus();
  };

  return (
    <>
      <section className="home-hero" style={{ backgroundImage: `url(${heroBg})` }}>
        <div className="home-hero-text">
          <h1>Welcome to Engage Estero</h1>
          <p>Explore planning and zoning decisions, board records, and meeting information for the Village of Estero.</p>
        </div>
      </section>

      <ul className="home-actions">
        {ACTIONS.map(({ route, query, title, text, Icon }) => (
          <li key={route}>
            <a className="card action-card" href={routeHref(route) + (query || "")}>
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

      <div className="home-columns">
        <LatestNews />

        <section className="card card-pad home-search" aria-labelledby="quick-search-title">
          <div className="card-head">
            <h2 id="quick-search-title">Quick Search</h2>
          </div>
          <form className="search-field" onSubmit={submit} role="search">
            <label htmlFor="home-search-input" className="sr-only">
              Ask a question or search for a project
            </label>
            <input
              id="home-search-input"
              type="search"
              placeholder="Ask a question or search for a project…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="search-field-btn" aria-label="Ask">
              <SearchIcon size={18} />
            </button>
          </form>
          <p className="home-try-label" id="home-try-label">
            Try asking:
          </p>
          <ul className="question-chips" aria-labelledby="home-try-label">
            {HOME_SAMPLE_QUESTIONS.map((q) => (
              <li key={q}>
                <button type="button" className="chip" onClick={() => onAsk(q)}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
