import { NextRequest, NextResponse } from "next/server";
import { getNetworkBySlug } from "@/lib/networks";
import { IDLIX_BASE } from "@/lib/idlix";
import { NetworkLogos } from "@/lib/network-logos";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface IdlixBrowseItem {
  id: string;
  title: string;
  slug: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  voteAverage: string;
  quality: string | null;
  country: string;
  runtime: number | null;
  numberOfSeasons: number | null;
  contentType: "movie" | "tv_series";
  popularityScore: number;
}

interface IdlixBrowseResponse {
  data: IdlixBrowseItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface NetworkItem {
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

function tmdbUrl(path: string | null, size: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function mapItem(item: IdlixBrowseItem): NetworkItem {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    posterPath: tmdbUrl(item.posterPath, "w342"),
    backdropPath: tmdbUrl(item.backdropPath, "w780"),
    releaseDate: item.releaseDate || "",
    voteAverage: item.voteAverage || "",
    quality: item.quality || "",
    country: item.country || "",
    isSeries: item.contentType === "tv_series",
    overview: "",
  };
}

async function fetchIdlixBrowse(
  networkSlug: string,
  page: number,
  sort: string
): Promise<IdlixBrowseResponse | null> {
  try {
    const sortParam = sort === "popular" ? "popular" : "latest";
    const url = `${IDLIX_BASE}/api/browse?network=${encodeURIComponent(networkSlug)}&page=${page}&sort=${sortParam}`;
    const { stdout } = await execFileAsync("curl", [
      "-s", "-A", UA,
      "-H", "Accept: application/json",
      "-H", `Referer: ${IDLIX_BASE}/`,
      "-w", "\n%{http_code}",
      "--max-time", "20",
      url,
    ], { timeout: 25000, maxBuffer: 4 * 1024 * 1024 });
    const statusMatch = stdout.match(/\n(\d{3})\n?$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    if (status !== 200) return null;
    const idx = stdout.lastIndexOf("\n" + status);
    const body = idx > 0 ? stdout.slice(0, idx) : stdout;
    return JSON.parse(body) as IdlixBrowseResponse;
  } catch {
    return null;
  }
}

const LIMIT = 24;
const MAX_SCAN_PAGES = 20;

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
    const sortParam = sp.get("sort") ?? "default";
    const typeParam = sp.get("type") ?? "all";
    // cursor is the IDLIX page to start scanning from (encoded as base-36 for compactness)
    const cursor = Number(sp.get("cursor") ?? "1") || 1;

    const logos: Record<string, string> = {};
    for (const [s, svg] of Object.entries(NetworkLogos)) {
      logos[s] = svg;
    }

    // type=all → no filtering, just proxy directly
    if (typeParam === "all") {
      const idlixData = await fetchIdlixBrowse(slug, cursor, sortParam);
      if (!idlixData) {
        return NextResponse.json({ ok: true, network, data: [], total: 0, hasMore: false, logos, nextCursor: null });
      }
      const data = idlixData.data.map(mapItem);
      const hasMore = cursor < idlixData.pagination.totalPages;
      return NextResponse.json(
        { ok: true, network, data, total: idlixData.pagination.total, hasMore, logos, nextCursor: hasMore ? cursor + 1 : null },
        { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
      );
    }

    // type filter → scan IDLIX pages until we fill LIMIT or exhaust pages
    const collected: NetworkItem[] = [];
    let currentPage = cursor;
    let idlixTotalPages = 1;
    let pagesScanned = 0;

    while (collected.length < LIMIT && pagesScanned < MAX_SCAN_PAGES) {
      const idlixData = await fetchIdlixBrowse(slug, currentPage, sortParam);
      if (!idlixData || idlixData.data.length === 0) break;

      idlixTotalPages = idlixData.pagination.totalPages;
      pagesScanned++;

      for (const item of idlixData.data) {
        if (typeParam === "movie" && item.contentType !== "movie") continue;
        if (typeParam === "tv" && item.contentType !== "tv_series") continue;
        collected.push(mapItem(item));
        if (collected.length >= LIMIT) break;
      }

      if (idlixData.data.length < 24) break;
      currentPage++;
    }

    const hasMore = collected.length >= LIMIT || currentPage <= idlixTotalPages;

    return NextResponse.json(
      {
        ok: true,
        network,
        data: collected,
        total: idlixTotalPages * LIMIT,
        hasMore,
        logos,
        nextCursor: hasMore ? currentPage + 1 : null,
      },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
