import { NextResponse } from "next/server";
import { getMovieDetail, getTvDetail } from "@/lib/tmdb";
import { getIdlixDetailInfo } from "@/lib/idlix";
import { ngeDetail, ngeUrlOf } from "@/lib/ngefilm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/movies/[slug]">) {
  try {
    const { slug } = await ctx.params;

    // NgeFilm Indonesia: slug format "nge-{base64url}"
    if (slug.startsWith("nge-")) {
      const d = await ngeDetail(ngeUrlOf(slug));
      if (!d) {
        return NextResponse.json({ error: "Judul tidak ditemukan di katalog Indonesia." }, { status: 404 });
      }
      return NextResponse.json({
        movie: {
          id: d.url,
          title: d.title,
          slug,
          posterPath: d.poster ?? "",
          backdropPath: d.backdrop ?? "",
          releaseDate: d.year,
          voteAverage: d.rating,
          runtime: d.runtime,
          quality: "",
          country: "Indonesia",
          overview: d.description,
          director: d.director,
          genres: d.genres.map((g) => ({ id: g, name: g })),
          cast: d.cast.map((c) => ({
            id: c.name,
            name: c.name,
            character: c.character,
            profilePath: c.profile ?? "",
          })),
          contentType: d.isSeries ? "tv" : "movie",
        },
        videos: [],
        languages: [],
        certification: "",
      });
    }

    // IDLIX slug (dari browse/search): bukan TMDB id maupun tv-{id}
    if (!/^(\d+|tv-\d+)$/.test(slug)) {
      const info = await getIdlixDetailInfo(slug);
      return NextResponse.json({
        movie: info.movie,
        videos: [],
        languages: [],
        certification: "",
      });
    }

    // TV series: slug format "tv-{id}"
    if (/^tv-\d+$/.test(slug)) {
      const id = slug.replace("tv-", "");
      const data = await getTvDetail(id);
      return NextResponse.json(data);
    }

    // Film biasa: slug numerik
    const data = await getMovieDetail(slug);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}