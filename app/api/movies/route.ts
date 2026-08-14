import { NextRequest, NextResponse } from "next/server";
import { discoverByGenre, getGenreCounts, getGenres, getMovieList, type MovieListKey } from "@/lib/tmdb";
import { idlixBrowseList } from "@/lib/idlix";

export const dynamic = "force-dynamic";

const VALID_LISTS: MovieListKey[] = ["popular", "trending", "now_playing", "upcoming", "top_rated", "tv_popular"];

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.min(500, Math.max(1, Number(sp.get("page") ?? 1)));
    const listParam = sp.get("list") ?? "popular";
    const genreParam = sp.get("genre");
    const genresParam = sp.get("genres");
    const typeParam = sp.get("type");
    const mediaType: "movie" | "tv" = typeParam === "tv" ? "tv" : "movie";

    if (listParam === "idlix_popular" || listParam === "idlix_latest") {
      const items = await idlixBrowseList(
        listParam === "idlix_popular" ? "popular" : "latest",
        page,
        60
      );
      return NextResponse.json({
        data: items,
        pagination: { page, limit: items.length },
      });
    }

    const list = (VALID_LISTS as string[]).includes(listParam) ? (listParam as MovieListKey) : "popular";

    if (genresParam === "1" || genresParam === "true") {
      const ids = (await getGenres(mediaType)).map((g) => g.id);
      const genres = await getGenreCounts(ids, mediaType);
      return NextResponse.json({ genres });
    }

    if (genreParam) {
      const data = await discoverByGenre(Number(genreParam), page, mediaType);
      return NextResponse.json({
        data: data.items,
        pagination: { page, limit: data.items.length, total: data.total, totalPages: data.totalPages },
      });
    }

    const effectiveList: MovieListKey = mediaType === "tv" ? "tv_popular" : list;
    const data = await getMovieList(effectiveList, page);
    return NextResponse.json({
      data: data.items,
      pagination: { page, limit: data.items.length, total: data.total, totalPages: data.totalPages },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}