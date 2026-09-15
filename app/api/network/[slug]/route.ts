import { NextRequest, NextResponse } from "next/server";
import { getNetworkBySlug, getNetworkLogos } from "@/lib/networks";
import { loadCatalog } from "@/lib/idlix";

export const dynamic = "force-dynamic";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TOKEN = process.env.TMDB_API_TOKEN || "";

const NETWORK_IDS: Record<string, { companyId: number; networkId: number }> = {
  netflix: { companyId: 213, networkId: 213 },
  hbo: { companyId: 49, networkId: 384 },
  "prime-video": { companyId: 1024, networkId: 1024 },
  "disney-plus": { companyId: 2739, networkId: 2739 },
  "apple-tv-plus": { companyId: 25570, networkId: 25570 },
};

async function tmdbDiscover(path: string, companyId: number, page: number) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("language", "id-ID");
  url.searchParams.set("with_companies", String(companyId));
  url.searchParams.set("sort_by", "popularity.desc");
  url.searchParams.set("page", String(page));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findIdlixMatch(title: string, isTv: boolean, catalog: ReturnType<typeof loadCatalog>) {
  const norm = normalizeTitle(title);
  return catalog.items.find((item) => {
    if (isTv !== item.isSeries) return false;
    const itemNorm = normalizeTitle(item.title);
    return itemNorm === norm || norm.includes(itemNorm) || itemNorm.includes(norm);
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const network = getNetworkBySlug(slug);
    if (!network) {
      return NextResponse.json({ ok: false, error: "Network not found" }, { status: 404 });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.min(500, Math.max(1, Number(sp.get("page") ?? 1)));
    const typeParam = sp.get("type") ?? "all";
    const mediaType: "movie" | "tv" | "all" =
      typeParam === "movie" || typeParam === "tv" ? typeParam : "all";

    const ids = NETWORK_IDS[slug];
    if (!ids) {
      return NextResponse.json({ ok: false, error: "Unknown network" }, { status: 404 });
    }

    const catalog = loadCatalog();
    const results: {
      id: string; slug: string; title: string; posterPath: string;
      backdropPath: string; releaseDate: string; voteAverage: string;
      quality: string; country: string; isSeries: boolean; overview: string;
    }[] = [];

    const fetches: Promise<unknown[]>[] = [];
    if (mediaType === "movie" || mediaType === "all") {
      fetches.push(tmdbDiscover("/discover/movie", ids.companyId, page));
    }
    if (mediaType === "tv" || mediaType === "all") {
      fetches.push(tmdbDiscover("/discover/tv", ids.companyId, page));
    }

    const tmdbResults = await Promise.all(fetches);
    const allTmdb = tmdbResults.flat().map((item: any) => ({
      ...item,
      _isTv: !!item.first_air_date || (!item.release_date && !item.title),
    }));

    for (const tmdb of allTmdb) {
      const title = tmdb.title || tmdb.name || "";
      if (!title) continue;
      const match = findIdlixMatch(title, tmdb._isTv, catalog);
      if (match) {
        results.push({
          id: match.id,
          slug: match.slug,
          title: match.title,
          posterPath: match.posterPath || "",
          backdropPath: match.backdropPath || "",
          releaseDate: match.releaseDate,
          voteAverage: String(match.voteAverage || ""),
          quality: "",
          country: match.country || "",
          isSeries: match.isSeries,
          overview: match.overview || "",
        });
      }
    }

    const logos = await getNetworkLogos();

    return NextResponse.json(
      {
        ok: true,
        network,
        data: results,
        total: results.length,
        hasMore: allTmdb.length >= 20,
        logos,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
