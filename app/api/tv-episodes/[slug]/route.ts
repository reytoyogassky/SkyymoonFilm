import { NextResponse } from "next/server";
import { getIdlixTvEpisodes } from "@/lib/idlix";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/tv-episodes/[slug]">) {
  const { slug } = await ctx.params;

  try {
    const seasons = await getIdlixTvEpisodes(slug);
    return NextResponse.json({ seasons });
  } catch (err) {
    return NextResponse.json({ seasons: [], error: (err as Error).message });
  }
}
