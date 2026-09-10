import { NextResponse } from "next/server";
import { idlixBrowseList, idlixDetail } from "@/lib/idlix";

export const dynamic = "force-dynamic";

interface Stats {
  catalogTotal: number;
  movies: number;
  series: number;
  genres: { id: string; name: string; count: number }[];
  popularAvg: number;
}

let _statsCache: { at: number; data: Stats & { countries: { code: string; count: number }[] } } | null = null;

function buildStats() {
  if (_statsCache && Date.now() - _statsCache.at < 30 * 60 * 1000) return _statsCache.data;

  return {
    catalogTotal: 0,
    movies: 0,
    series: 0,
    genres: [],
    popularAvg: 0,
    countries: [],
  };
}

export async function GET() {
  try {
    const [popResult, latResult] = await Promise.all([
      idlixBrowseList("popular", 1, 60).catch(() => ({ items: [], total: 0, totalPages: 1 })),
      idlixBrowseList("latest", 1, 60).catch(() => ({ items: [], total: 0, totalPages: 1 })),
    ]);
    const all = [...popResult.items, ...latResult.items];
    const seen = new Set();
    const unique = all.filter((it) => {
      if (seen.has(it.slug)) return false;
      seen.add(it.slug);
      return true;
    });
    const total = unique.length;
    const movies = unique.filter((x) => !x.isSeries).length;
    const series = unique.filter((x) => x.isSeries).length;
    const popularAvg = total > 0
      ? unique.reduce((acc, m) => acc + (Number(m.voteAverage) || 0), 0) / total
      : 0;

    const genreMap = new Map<string, { id: string; name: string; count: number }>();
    const countryMap = new Map<string, number>();

    const samples = unique.slice(0, 30);
    await Promise.all(samples.map(async (it) => {
      try {
        const { data } = await idlixDetail(it.slug);
        for (const g of (Array.isArray(data.genres) ? data.genres : []) as { id?: string; name: string }[]) {
          if (!g.name) continue;
          const key = g.name.toLowerCase();
          const ex = genreMap.get(key);
          if (ex) ex.count++;
          else genreMap.set(key, { id: String(g.id ?? g.name), name: g.name, count: 1 });
        }
        const c = String(data.country ?? "").trim();
        if (c) countryMap.set(c, (countryMap.get(c) ?? 0) + 1);
      } catch {}
    }));

    const genres = [...genreMap.values()].sort((a, b) => b.count - a.count);
    const countries = [...countryMap.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    const stats = {
      catalogTotal: total,
      movies,
      series,
      genres,
      popularAvg,
      countries,
    };
    _statsCache = { at: Date.now(), data: stats };
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
