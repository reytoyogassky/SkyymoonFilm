import { NextResponse } from "next/server";
import { discoverDramas, searchDramas } from "@/lib/scraper";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("q") || "").trim();
  const dubbed = searchParams.get("dubbed");
  const sort = searchParams.get("sort") || "";
  const lang = searchParams.get("lang") || "";
  const genre = searchParams.get("genre") || "";

  if (search) {
    const results = await searchDramas(search, 50);
    return NextResponse.json({ total: results.length, dramas: results });
  }

  let dramas = await discoverDramas();

  if (dubbed === "1") {
    dramas = dramas.filter((d) => d.isDubbed);
  }

  if (lang === "id") {
    dramas = dramas.filter((d) => d.isIndonesian);
  } else if (lang) {
    dramas = dramas.filter((d) => d.languageCode === lang);
  }

  if (genre) {
    const g = genre.toLowerCase();
    dramas = dramas.filter((d) =>
      d.tags?.some((t) => t.toLowerCase().includes(g)) ||
      d.genres?.some((t) => t.toLowerCase().includes(g))
    );
  }

  if (sort === "score") {
    dramas.sort((a, b) => b.score - a.score);
  } else if (sort === "az") {
    dramas.sort((a, b) => a.title.localeCompare(b.title));
  }

  return NextResponse.json({ total: dramas.length, dramas });
}
