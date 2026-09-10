import { NextRequest, NextResponse } from "next/server";
import { idlixSearch } from "@/lib/idlix";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const page = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1)));
    const typeParam = req.nextUrl.searchParams.get("type");
    const mediaType: "movie" | "tv" | "all" =
      typeParam === "movie" || typeParam === "tv" ? typeParam : "all";
    if (!q.trim()) return NextResponse.json({ results: [] });
    const results = await idlixSearch(q.trim(), page, mediaType);
    return NextResponse.json({
      results,
      pagination: { page, total: results.length, totalPages: 1 },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
