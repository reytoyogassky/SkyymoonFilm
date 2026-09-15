import { loadCatalog } from "./idlix";

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
  tmdbNetworkId: number;
  idlixNetworkNames: string[];
}

export const NETWORKS: NetworkInfo[] = [
  { slug: "netflix", name: "Netflix", color: "#E50914", tmdbNetworkId: 213, idlixNetworkNames: ["Netflix", "netflix"] },
  { slug: "hbo", name: "HBO", color: "#B537F2", tmdbNetworkId: 384, idlixNetworkNames: ["HBO", "HBO Max", "hbo"] },
  { slug: "prime-video", name: "Prime Video", color: "#00A8E1", tmdbNetworkId: 1024, idlixNetworkNames: ["Amazon", "Prime Video", "Prime", "amazon"] },
  { slug: "disney-plus", name: "Disney+", color: "#113CCF", tmdbNetworkId: 2739, idlixNetworkNames: ["Disney", "Disney+", "Disney Plus", "disney"] },
  { slug: "apple-tv-plus", name: "Apple TV+", color: "#555555", tmdbNetworkId: 25570, idlixNetworkNames: ["Apple TV+", "Apple TV", "Apple", "apple"] },
];

export function getNetworkBySlug(slug: string): NetworkInfo | undefined {
  return NETWORKS.find((n) => n.slug === slug);
}

export interface NetworkContentItem {
  id: string;
  slug: string;
  title: string;
  posterPath: string;
  backdropPath: string;
  releaseDate: string;
  voteAverage: string;
  quality: string;
  country: string;
  isSeries: boolean;
  overview: string;
}

export function fetchNetworkContent(slug: string, page = 1, mediaType: "movie" | "tv" | "all" = "all", limit = 24): { items: NetworkContentItem[]; total: number; hasMore: boolean } {
  const network = getNetworkBySlug(slug);
  if (!network) return { items: [], total: 0, hasMore: false };

  const catalog = loadCatalog();
  let items = catalog.items;

  items = items.filter((item) => {
    if (!item.networks || item.networks.length === 0) return false;
    return item.networks.some((n) =>
      network.idlixNetworkNames.some(
        (name) => n.name.toLowerCase().includes(name.toLowerCase())
      )
    );
  });

  if (mediaType === "movie") {
    items = items.filter((it) => !it.isSeries);
  } else if (mediaType === "tv") {
    items = items.filter((it) => it.isSeries);
  }

  const total = items.length;
  const start = (page - 1) * limit;
  const pageItems = items.slice(start, start + limit);

  return {
    items: pageItems.map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      posterPath: item.posterPath || "",
      backdropPath: item.backdropPath || "",
      releaseDate: item.releaseDate,
      voteAverage: String(item.voteAverage || ""),
      quality: "",
      country: item.country || "",
      isSeries: item.isSeries,
      overview: item.overview || "",
    })),
    total,
    hasMore: start + limit < total,
  };
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
