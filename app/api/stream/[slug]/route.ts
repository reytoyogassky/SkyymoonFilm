import { NextRequest, NextResponse } from "next/server";
import { getMovieStream, getTvStream } from "@/lib/idlix";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/stream/[slug]">) {
  try {
    const { slug } = await ctx.params;
    const renew = req.nextUrl.searchParams.get("renew") === "1";
    const episodeId = req.nextUrl.searchParams.get("episodeId") ?? undefined;
    const isTv = req.nextUrl.searchParams.get("type") === "tv";

    const stream = isTv
      ? await getTvStream(slug, renew, episodeId)
      : await getMovieStream(slug, renew);
    return NextResponse.json(stream);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
