const TMDB_BASE = "https://api.themoviedb.org/3";
const TOKEN = process.env.TMDB_API_TOKEN || "";

async function tmdbFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  if (!TOKEN) throw new Error("TMDB_API_TOKEN not set");
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("language", "id-ID");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json() as Promise<T>;
}

export interface NetworkInfo {
  slug: string;
  name: string;
  color: string;
  tmdbCompanyId: number;
  tmdbNetworkId: number;
}

export const NETWORKS: NetworkInfo[] = [
  { slug: "netflix", name: "Netflix", color: "#E50914", tmdbCompanyId: 213, tmdbNetworkId: 213 },
  { slug: "hbo", name: "HBO", color: "#B537F2", tmdbCompanyId: 49, tmdbNetworkId: 384 },
  { slug: "prime-video", name: "Prime Video", color: "#00A8E1", tmdbCompanyId: 1024, tmdbNetworkId: 1024 },
  { slug: "disney-plus", name: "Disney+", color: "#113CCF", tmdbCompanyId: 2739, tmdbNetworkId: 2739 },
  { slug: "apple-tv-plus", name: "Apple TV+", color: "#000000", tmdbCompanyId: 25570, tmdbNetworkId: 25570 },
];

export function getNetworkBySlug(slug: string): NetworkInfo | undefined {
  return NETWORKS.find((n) => n.slug === slug);
}

interface TmdbNetworkDetail {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

export async function getNetworkLogos(): Promise<Record<string, string>> {
  const logos: Record<string, string> = {};
  const fetches = NETWORKS.map(async (n) => {
    try {
      const data = await tmdbFetch<TmdbNetworkDetail>(`/network/${n.tmdbNetworkId}`);
      if (data.logo_path) {
        logos[n.slug] = `https://image.tmdb.org/t/p/w300${data.logo_path}`;
      }
    } catch {}
  });
  await Promise.all(fetches);
  return logos;
}

interface TmdbDiscoverItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  media_type?: string;
}

interface TmdbDiscoverResult {
  results: TmdbDiscoverItem[];
  total_results: number;
  total_pages: number;
}

export async function fetchNetworkContent(
  slug: string,
  page = 1,
  mediaType: "movie" | "tv" | "all" = "all"
) {
  const network = getNetworkBySlug(slug);
  if (!network) throw new Error("Network not found");

  const fetches: Promise<TmdbDiscoverResult>[] = [];

  if (mediaType === "movie" || mediaType === "all") {
    fetches.push(
      tmdbFetch<TmdbDiscoverResult>("/discover/movie", {
        with_companies: String(network.tmdbCompanyId),
        sort_by: "popularity.desc",
        page: String(page),
      })
    );
  }
  if (mediaType === "tv" || mediaType === "all") {
    fetches.push(
      tmdbFetch<TmdbDiscoverResult>("/discover/tv", {
        with_companies: String(network.tmdbCompanyId),
        sort_by: "popularity.desc",
        page: String(page),
      })
    );
  }

  const results = await Promise.all(fetches);
  const allItems: (TmdbDiscoverItem & { media_type: string })[] = [];

  for (const r of results) {
    for (const item of r.results) {
      allItems.push({
        ...item,
        media_type: item.media_type || (item.first_air_date ? "tv" : "movie"),
      });
    }
  }

  // Sort by popularity (vote_average as proxy)
  allItems.sort((a, b) => b.vote_average - a.vote_average);

  return allItems.map((item) => ({
    tmdbId: item.id,
    title: item.title || item.name || "",
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path,
    voteAverage: item.vote_average,
    releaseDate: item.release_date || item.first_air_date || "",
    overview: item.overview,
    mediaType: item.media_type as "movie" | "tv",
  }));
}
