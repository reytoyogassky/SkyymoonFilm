import { NextRequest, NextResponse } from "next/server";
import { browseCountry } from "@/lib/ngefilm";
import type { MovieListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctype = "movie" | "tv" | "all";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const typeParam: Ctype = sp.get("type") === "tv" ? "tv" : sp.get("type") === "all" ? "all" : "movie";
    const order = sp.get("order") === "rating" ? "rating" : "date";
    const country = (sp.get("country") ?? "indonesia").trim().toLowerCase() || "indonesia";
    const pages = Math.min(5, Math.max(1, Number(sp.get("page") ?? 1)));

    const items: (MovieListItem & { isSeries: boolean })[] = [];
    const ctypes: Ctype[] = typeParam === "all" ? ["movie", "tv"] : [typeParam];
    for (const ct of ctypes) {
      const seen = new Set<string>();
      for (let p = 1; p <= pages && items.length < 120; p++) {
        const cards = await browseCountry(country, { ctype: ct, orderby: order, page: p });
        for (const c of cards) {
          if (seen.has(c.slug)) continue;
          seen.add(c.slug);
          items.push({
            id: c.slug,
            slug: c.slug,
            title: c.title,
            posterPath: c.poster ?? "",
            backdropPath: c.backdrop ?? c.poster ?? "",
            releaseDate: c.year,
            voteAverage: "",
            quality: c.quality,
            country,
            runtime: 0,
            genres: [],
            hasVideo: true,
            isSeries: c.isSeries,
          });
        }
        if (cards.length < 8) break;
      }
    }

    return NextResponse.json({ data: items, pagination: { page: 1, limit: items.length } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}