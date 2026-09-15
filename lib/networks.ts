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
  logo: string;
  color: string;
  tmdbCompanyId: number;
}

export const NETWORKS: NetworkInfo[] = [
  { slug: "netflix", name: "Netflix", logo: "https://assets.nflxext.com/ffe/siteui/common/logos/netflix-logo.svg", color: "#E50914", tmdbCompanyId: 213 },
  { slug: "hbo", name: "HBO", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/HBO_logo.svg/2560px-HBO_logo.svg.png", color: "#B537F2", tmdbCompanyId: 49 },
  { slug: "prime-video", name: "Prime Video", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Amazon_Prime_Video_logo.svg/2560px-Amazon_Prime_Video_logo.svg.png", color: "#00A8E1", tmdbCompanyId: 1024 },
  { slug: "disney-plus", name: "Disney+", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney%2B_logo.svg/2560px-Disney%2B_logo.svg.png", color: "#113CCF", tmdbCompanyId: 2739 },
  { slug: "apple-tv-plus", name: "Apple TV+", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Apple_TV_plus_logo.svg/2560px-Apple_TV_plus_logo.svg.png", color: "#000000", tmdbCompanyId: 25570 },
];

export function getNetworkBySlug(slug: string): NetworkInfo | undefined {
  return NETWORKS.find((n) => n.slug === slug);
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
