import { NextRequest, NextResponse } from "next/server";
import { catalogSearch, type ContentSource } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const query = sp.get("q") ?? "";
    const page = Math.min(500, Math.max(1, Number(sp.get("page") ?? 1)));
    const typeParam = sp.get("type") ?? "all";
    const mediaType: "movie" | "tv" | "all" =
      typeParam === "movie" || typeParam === "tv" ? typeParam : "all";
    const sourceParam = sp.get("source") ?? "all";
    const source: ContentSource =
      sourceParam === "idlix" || sourceParam === "ngefilm" ? sourceParam : "all";

    if (!query.trim()) {
      return NextResponse.json({ ok: true, data: [], pagination: { page, total: 0 } });
    }

    const result = await catalogSearch({ query, page, mediaType, source });

    return NextResponse.json({
      ok: true,
      data: result.items,
      pagination: { page, total: result.total },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 }
    );
  }
}
