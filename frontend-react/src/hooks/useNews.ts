import { useCallback, useEffect, useState } from "react";
import type { NewsPost } from "../types";

const WP_POSTS = "https://esterotoday.com/wp-json/wp/v2/posts";

interface WpMedia {
  source_url?: string;
  media_details?: { sizes?: Record<string, { source_url?: string }> };
}

interface WpPost {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  _embedded?: { "wp:featuredmedia"?: WpMedia[] };
}

/** The featured image at WordPress's "medium" size (~300px), which is
 * plenty for a thumbnail; the full upload can be several megapixels. */
function featuredImage(post: WpPost): string | null {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  const sizes = media?.media_details?.sizes;
  return sizes?.medium?.source_url || sizes?.thumbnail?.source_url || media?.source_url || null;
}

interface UseNewsResult {
  posts: NewsPost[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

function decodeHtmlEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function newsUrl(perPage: number, withImages: boolean): string {
  const n = Math.max(1, Math.min(perPage, 20));
  const fields = withImages
    ? "id,title,link,date,_links.wp:featuredmedia,_embedded"
    : "id,title,link,date,categories";
  const embed = withImages ? "&_embed=wp:featuredmedia" : "";
  return `${WP_POSTS}?per_page=${n}&_fields=${fields}${embed}`;
}

/** Fetches the newest EsteroToday posts from their public WordPress REST API
 * (CORS-friendly). `count` caps how many posts to request (max 20). */
export function useNews(withImages = false, count = 10): UseNewsResult {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(newsUrl(count, withImages))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<WpPost[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setPosts(
          data.map((p) => ({
            id: p.id,
            title: decodeHtmlEntities(p.title.rendered),
            link: p.link,
            date: p.date,
            image: withImages ? featuredImage(p) : null,
          })),
        );
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load news");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, withImages, count]);

  return { posts, loading, error, retry };
}
