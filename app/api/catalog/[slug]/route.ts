import { NextResponse } from "next/server";
import { catalogDetail } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/catalog/[slug]">) {
  try {
    const { slug } = await ctx.params;
    const payload = await catalogDetail(slug);

    return NextResponse.json(
      { ok: true, ...payload },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "not found") {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
