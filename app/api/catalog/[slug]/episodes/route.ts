import { NextResponse } from "next/server";
import { catalogEpisodes } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/catalog/[slug]/episodes">) {
  try {
    const { slug } = await ctx.params;
    const seasons = await catalogEpisodes(slug);

    return NextResponse.json({ ok: true, seasons });
  } catch (err) {
    return NextResponse.json(
      { ok: false, seasons: [], error: (err as Error).message },
      { status: 502 }
    );
  }
}
