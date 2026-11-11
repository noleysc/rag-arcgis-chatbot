import { useId } from "react";
import { Newspaper } from "lucide-react";
import { useNews } from "../../hooks/useNews";
import { ArrowRightIcon, ChevronRightIcon } from "../Icons/Icons";
import { SkeletonRows } from "./Skeleton";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface LatestNewsProps {
  /** "feature": Community Pulse's larger card, with a header icon and each
   * post's featured image. */
  variant?: "compact" | "feature";
  /** How many EsteroToday posts to show (fetched from WP, max 20). */
  limit?: number;
}

export default function LatestNews({ variant = "compact", limit = 10 }: LatestNewsProps) {
  const feature = variant === "feature";
  const { posts, loading, error, retry } = useNews(feature, limit);
  const titleId = useId();
  const shown = posts.slice(0, limit);

  return (
    <section className={`pulse-widget${feature ? " pulse-widget-feature" : ""}`} aria-labelledby={titleId}>
      <div className="pulse-widget-header">
        <h2 id={titleId}>
          {feature && (
            <span className="pulse-widget-icon">
              <Newspaper size={22} strokeWidth={1.8} />
            </span>
          )}
          Latest from EsteroToday
          {!loading && !error && shown.length > 0 && (
            <span className="news-count" aria-label={`${shown.length} articles`}>
              {shown.length}
            </span>
          )}
        </h2>
        <a className="card-link" href="https://esterotoday.com/" target="_blank" rel="noopener noreferrer">
          View all <ArrowRightIcon size={14} />
          <span className="sr-only">(opens esterotoday.com in a new tab)</span>
        </a>
      </div>

      {loading && <SkeletonRows count={Math.min(limit, 5)} />}

      {!loading && error && (
        <p className="pulse-empty">
          Couldn't load news —{" "}
          <a href="https://esterotoday.com" target="_blank" rel="noopener noreferrer">
            visit esterotoday.com ↗
          </a>
          <button type="button" className="pulse-retry" onClick={retry}>
            Retry
          </button>
        </p>
      )}

      {!loading && !error && (
        <ul className={`news-list${feature ? " news-list-feature" : ""}`}>
          {shown.map((post) => (
            <li className="news-row" key={post.id}>
              <a className="news-link" href={post.link} target="_blank" rel="noopener noreferrer">
                {feature ? (
                  <span className="news-thumb" aria-hidden="true">
                    {post.image ? (
                      <img src={post.image} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <Newspaper size={24} strokeWidth={1.6} />
                    )}
                  </span>
                ) : (
                  <span className="news-dot" aria-hidden="true" />
                )}
                <span className="news-body">
                  <span className="news-title">{post.title}</span>
                  <span className="news-date">{formatDate(post.date)}</span>
                </span>
                {feature && <ChevronRightIcon size={18} className="news-chevron" />}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
