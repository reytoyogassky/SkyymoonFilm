import { NextRequest, NextResponse } from "next/server";
import { startMovieScrape, startTvScrape, getCachedStream } from "@/lib/idlix";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/prefetch/[slug]">) {
  try {
    const { slug } = await ctx.params;
    const episodeId = req.nextUrl.searchParams.get("episodeId") ?? undefined;
    const isTv = req.nextUrl.searchParams.get("type") === "tv";

    const cached = getCachedStream(slug, isTv, episodeId);
    if (cached) {
      return NextResponse.json({ status: "ready" });
    }

    if (isTv) {
      startTvScrape(slug, episodeId);
    } else {
      startMovieScrape(slug);
    }

    return NextResponse.json({ status: "started" });
  } catch (err) {
    return NextResponse.json({ status: "error", error: (err as Error).message }, { status: 502 });
  }
}
