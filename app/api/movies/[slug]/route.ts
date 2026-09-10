import { NextResponse } from "next/server";
import { getIdlixDetailInfo } from "@/lib/idlix";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/movies/[slug]">) {
  try {
    const { slug } = await ctx.params;
    const info = await getIdlixDetailInfo(slug);
    return NextResponse.json({
      movie: info.movie,
      videos: [],
      languages: [],
      certification: "",
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
