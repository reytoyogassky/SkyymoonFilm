import { NextRequest, NextResponse } from "next/server";
import { catalogBrowse } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// Legacy compat: /api/ngefilm/browse → /api/catalog/browse?source=ngefilm
// Returns items with BOTH old NgeFilm format fields (url, poster) AND new MovieListItem fields
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const typeParam = sp.get("type") ?? "all";
  const mediaType = typeParam === "film" ? "movie" as const : typeParam === "series" ? "tv" as const : "all" as const;

  const result = await catalogBrowse({ sort: "popular", page, limit: 30, source: "ngefilm", mediaType });

  // Map to include old NgeFilm fields for backward compat with cached browser code
  const items = result.items.map((item) => ({
    ...item,
    // Old NgeFilm fields
    url: `https://new39.ngefilm.site/${item.slug}/`,
    poster: item.posterPath,
    type: item.isSeries ? "series" : "film",
    rating: item.voteAverage || "0",
    quality: item.quality || "",
    info: item.releaseDate || "",
  }));

  return NextResponse.json({
    ok: true,
    data: items,
    items,
  });
}
