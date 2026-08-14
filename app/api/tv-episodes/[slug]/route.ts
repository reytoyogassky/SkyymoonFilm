import { NextResponse } from "next/server";
import { getTvDetail } from "@/lib/tmdb";
import { findIdlixTvSlug, getIdlixTvEpisodes } from "@/lib/idlix";
import { ngeDetail, ngeUrlOf } from "@/lib/ngefilm";
import type { IdlixSeason } from "@/lib/idlix";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/tv-episodes/[slug]">) {
  const { slug } = await ctx.params;

  try {
    // NgeFilm Indonesia: slug format "nge-{base64url}"
    if (slug.startsWith("nge-")) {
      const d = await ngeDetail(ngeUrlOf(slug));
      const seasons: IdlixSeason[] = (d?.seasons ?? []).map((s) => ({
        id: `nge-s${s.number}`,
        seasonNumber: s.number,
        name: `Musim ${s.number}`,
        posterPath: "",
        episodes: s.episodes.map((e) => ({
          id: e.url,
          episodeNumber: e.num,
          name: e.label,
          overview: "",
          stillPath: "",
          airDate: "",
          runtime: 0,
          hasVideo: true,
        })),
      }));
      return NextResponse.json({ seasons });
    }

    // IDLIX slug (dari browse): langsung pakai slug tersebut
    if (!/^tv-\d+$/.test(slug)) {
      const seasons = await getIdlixTvEpisodes(slug);
      return NextResponse.json({ seasons });
    }

    const tmdbId = slug.replace("tv-", "");
    const { movie } = await getTvDetail(tmdbId);
    const idlixSlug = await findIdlixTvSlug(movie.title, movie.releaseDate.slice(0, 4));
    if (!idlixSlug) return NextResponse.json({ seasons: [] });
    const seasons = await getIdlixTvEpisodes(idlixSlug);
    return NextResponse.json({ seasons });
  } catch (err) {
    return NextResponse.json({ seasons: [], error: (err as Error).message });
  }
}