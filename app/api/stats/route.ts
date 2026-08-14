import { NextResponse } from "next/server";
import { idlixGet, IDLIX_BASE } from "@/lib/idlix";
import { getGenreCounts, getGenres, getMovieList, type GenreCount } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

const statsCache = new Map<string, { at: number; data: Stats }>();

interface Stats {
  catalogTotal: number;
  genres: GenreCount[];
  popularAvg: number;
  nowPlayingTotal: number;
}

interface StatsData {
  catalogTotal: number;
  genres: GenreCount[];
  popularAvg: number;
  nowPlayingTotal: number;
}

async function buildStats(): Promise<StatsData> {
  const hit = statsCache.get("stats");
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.data;

  const [popular, nowPlaying, genres, catalogRes] = await Promise.allSettled([
    getMovieList("popular", 1),
    getMovieList("now_playing", 1),
    (async () => {
      const ids = (await getGenres()).map((g) => g.id);
      return getGenreCounts(ids);
    })(),
    idlixGet("/api/movies?page=1", `${IDLIX_BASE}/movie`).catch(() => ({})),
  ]);

  const popularAvg =
    popular.status === "fulfilled" && popular.value.items.length > 0
      ? popular.value.items.reduce((acc, m) => acc + (Number(m.voteAverage) || 0), 0) / popular.value.items.length
      : 0;

  const catalogTotal =
    catalogRes.status === "fulfilled" &&
    typeof (catalogRes.value as { pagination?: { total?: number } }).pagination?.total === "number"
      ? ((catalogRes.value as { pagination: { total: number } }).pagination.total)
      : 0;

  const stats: Stats = {
    catalogTotal,
    genres: genres.status === "fulfilled" ? genres.value : [],
    popularAvg,
    nowPlayingTotal: nowPlaying.status === "fulfilled" ? nowPlaying.value.total : 0,
  };

  statsCache.set("stats", { at: Date.now(), data: stats });
  return stats;
}

export async function GET() {
  try {
    return NextResponse.json(await buildStats());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}