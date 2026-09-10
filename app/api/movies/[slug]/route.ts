import { NextResponse } from "next/server";
import { catalogDetail } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// Legacy redirect: /api/movies/[slug] → /api/catalog/[slug]
export async function GET(_req: Request, ctx: RouteContext<"/api/movies/[slug]">) {
  try {
    const { slug } = await ctx.params;
    const payload = await catalogDetail(slug);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "not found") return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
