import { NextRequest, NextResponse } from "next/server";
import { getNetworkBySlug, getNetworkLogos } from "@/lib/networks";
import { loadCatalog, IDLIX_BASE } from "@/lib/idlix";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const dynamic = "force-dynamic";

async function scrapeIdlixNetwork(slug: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-A", UA,
      "-H", `Referer: ${IDLIX_BASE}/`,
      "--max-time", "20",
      `${IDLIX_BASE}/network/${slug}`,
    ], { timeout: 25000, maxBuffer: 4 * 1024 * 1024 });
    const matches = [...stdout.matchAll(/\/(movie|series)\/([a-z0-9-]+)/g)];
    return [...new Set(matches.map((m) => m[2]))];
  } catch {
    return [];
  }
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

    // Scrape slugs from idlix network page
    const slugs = await scrapeIdlixNetwork(slug);
    const catalog = loadCatalog();
    const limit = 24;

    const results: {
      id: string; slug: string; title: string; posterPath: string;
      backdropPath: string; releaseDate: string; voteAverage: string;
      quality: string; country: string; isSeries: boolean; overview: string;
    }[] = [];

    for (const idlixSlug of slugs) {
      const item = catalog.items.find((i) => i.slug === idlixSlug);
      if (!item) continue;

      if (mediaType === "movie" && item.isSeries) continue;
      if (mediaType === "tv" && !item.isSeries) continue;

      const poster = item.posterPath || "";
      const backdrop = item.backdropPath || "";
      results.push({
        id: item.id,
        slug: item.slug,
        title: item.title,
        posterPath: poster.startsWith("http") ? poster : poster ? `https://image.tmdb.org/t/p/w342${poster}` : "",
        backdropPath: backdrop.startsWith("http") ? backdrop : backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
        releaseDate: item.releaseDate,
        voteAverage: String(item.voteAverage || ""),
        quality: "",
        country: item.country || "",
        isSeries: item.isSeries,
        overview: item.overview || "",
      });
    }

    const total = results.length;
    const start = (page - 1) * limit;
    const pageItems = results.slice(start, start + limit);
    const hasMore = start + limit < total;

    const logos = await getNetworkLogos();

    return NextResponse.json(
      {
        ok: true,
        network,
        data: pageItems,
        total,
        hasMore,
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
