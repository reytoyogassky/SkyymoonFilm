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
}

export const NETWORKS: NetworkInfo[] = [
  { slug: "netflix", name: "Netflix", color: "#E50914", tmdbNetworkId: 213 },
  { slug: "hbo", name: "HBO", color: "#B537F2", tmdbNetworkId: 384 },
  { slug: "prime-video", name: "Prime Video", color: "#00A8E1", tmdbNetworkId: 1024 },
  { slug: "disney-plus", name: "Disney+", color: "#113CCF", tmdbNetworkId: 2739 },
  { slug: "apple-tv-plus", name: "Apple TV+", color: "#555555", tmdbNetworkId: 25570 },
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
