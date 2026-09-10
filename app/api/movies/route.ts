import { NextRequest, NextResponse } from "next/server";
import { catalogBrowse, type ContentSource } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// Legacy redirect: /api/movies → /api/catalog/browse
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const list = sp.get("list") ?? "";
  const sort = list.includes("latest") ? "latest" : "popular";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const limit = Math.max(1, Number(sp.get("limit") ?? 60));

  const result = await catalogBrowse({ sort, page, limit, source: "idlix" });

  return NextResponse.json({
    ok: true,
    data: result.items,
    items: result.items,
    pagination: { page, total: result.total, totalPages: result.totalPages },
  });
}
