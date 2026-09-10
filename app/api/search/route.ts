import { NextRequest, NextResponse } from "next/server";
import { catalogSearch } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// Legacy redirect: /api/search → /api/catalog/search
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));

  const result = await catalogSearch({ query: q, page });

  return NextResponse.json({ ok: true, data: result.items, items: result.items, total: result.total });
}
