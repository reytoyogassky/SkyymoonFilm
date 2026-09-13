import { NextRequest, NextResponse } from "next/server";
import { catalogBrowse, type ContentSource } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const sortParam = sp.get("sort") ?? "popular";
    const sort: "popular" | "latest" =
      sortParam === "latest" ? "latest" : "popular";
    const page = Math.min(500, Math.max(1, Number(sp.get("page") ?? 1)));
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 60)));
    const genre = sp.get("genre") || undefined;
    const country = sp.get("country") || undefined;
    const typeParam = sp.get("type") ?? "all";
    const mediaType: "movie" | "tv" | "all" =
      typeParam === "movie" || typeParam === "tv" ? typeParam : "all";
    const sourceParam = sp.get("source") ?? "all";
    const source: ContentSource =
      sourceParam === "idlix" || sourceParam === "ngefilm" ? sourceParam : "all";

    const result = await catalogBrowse({
      sort,
      page,
      limit,
      genre,
      country,
      mediaType,
      source,
    });

    return NextResponse.json(
      {
        ok: true,
        data: result.items,
        pagination: {
          page,
          limit: result.items.length,
          total: result.total,
          totalPages: result.totalPages,
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 }
    );
  }
}
