import { NextRequest, NextResponse } from "next/server";
import { getNetworkBySlug, getNetworkLogos } from "@/lib/networks";
import { loadCatalog } from "@/lib/idlix";

export const dynamic = "force-dynamic";

const NETWORK_NAMES: Record<string, string[]> = {
  netflix: ["Netflix", "netflix"],
  hbo: ["HBO", "HBO Max", "hbo"],
  "prime-video": ["Amazon", "Prime Video", "Prime", "amazon"],
  "disney-plus": ["Disney", "Disney+", "Disney Plus", "disney"],
  "apple-tv-plus": ["Apple TV+", "Apple TV", "Apple", "apple"],
};

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

    const limit = 24;
    const catalog = loadCatalog();
    const names = NETWORK_NAMES[slug] || [];

    let items = catalog.items.filter((item) => {
      if (!item.networks || item.networks.length === 0) return false;
      return item.networks.some((n) =>
        names.some((name) => n.name.toLowerCase().includes(name.toLowerCase()))
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
    const hasMore = start + limit < total;

    const logos = await getNetworkLogos();

    return NextResponse.json(
      {
        ok: true,
        network,
        data: pageItems.map((item) => ({
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
