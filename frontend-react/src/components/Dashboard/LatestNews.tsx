import { useId } from "react";
import { useNews } from "../../hooks/useNews";
import { ArrowRightIcon } from "../Icons/Icons";
import { SkeletonRows } from "./Skeleton";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function LatestNews() {
  const { posts, loading, error, retry } = useNews();
  const titleId = useId();

  return (
    <section className="pulse-widget" aria-labelledby={titleId}>
      <div className="pulse-widget-header">
        <h2 id={titleId}>Latest from Estero Today</h2>
        <a className="card-link" href="https://esterotoday.com/" target="_blank" rel="noopener noreferrer">
          View all <ArrowRightIcon size={14} />
          <span className="sr-only">(opens esterotoday.com in a new tab)</span>
        </a>
      </div>

      {loading && <SkeletonRows count={3} />}

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
        <ul className="news-list">
          {posts.map((post) => (
            <li className="news-row" key={post.id}>
              <a className="news-link" href={post.link} target="_blank" rel="noopener noreferrer">
                <span className="news-dot" aria-hidden="true" />
                <span className="news-body">
                  <span className="news-title">{post.title}</span>
                  <span className="news-date">{formatDate(post.date)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
