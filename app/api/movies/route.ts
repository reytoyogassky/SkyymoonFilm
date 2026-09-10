import { NextRequest, NextResponse } from "next/server";
import { idlixBrowseList } from "@/lib/idlix";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.min(500, Math.max(1, Number(sp.get("page") ?? 1)));
    const listParam = sp.get("list") ?? "idlix_popular";
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 60)));
    const genre = sp.get("genre") ?? "";
    const country = sp.get("country") ?? "";
    const typeParam = sp.get("type") ?? "all";
    const mediaType: "movie" | "tv" | "all" =
      typeParam === "movie" || typeParam === "tv" ? typeParam : "all";

    const sort = listParam === "idlix_latest" ? "latest" : "popular";
    const result = await idlixBrowseList(sort, page, limit, { genre, country, mediaType });
    return NextResponse.json({
      data: result.items,
      pagination: { page, limit: result.items.length, total: result.total, totalPages: result.totalPages },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
