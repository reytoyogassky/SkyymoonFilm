import { NextRequest, NextResponse } from "next/server";
import { getNetworkBySlug, getNetworkLogos } from "@/lib/networks";
import { loadCatalog } from "@/lib/idlix";

export const dynamic = "force-dynamic";

// Known titles per network from TMDB (stable, doesn't need API)
const NETWORK_TITLES: Record<string, string[]> = {
  netflix: [
    "Squid Game", "Wednesday", "Stranger Things", "Lupin", "Money Heist", "Dark",
    "Narcos", "Alice in Borderland", "Kingdom", "Sweet Home", "Manifest",
    "The Witcher", "Shadow and Bone", "All of Us Are Dead", "Hellbound",
    "Vincenzo", "Crash Landing on You", "Itaewon Class", "My Name",
    "Record of Ragnarok", "Arcane", "One Piece", "Cyberpunk: Edgerunners",
    "Dragon Ball", "Attack on Titan", "Jujutsu Kaisen", "Demon Slayer",
    "Classified", "The Uncanny Counter", "Glitch", "Extreme Job",
    "Troll", "In the Cold", "Bodkin", "The Residence", "Adolescence",
    "Karma", "Black Hat", "Department Q", "The Four Seasons",
    "Residence", "The Residence", "Wake Up Dead Man", "Frankenstein",
    "The Home", "Fear Street", "Old Guard", "Red Notice",
    "Glass Onion", "Knives Out", "Extraction", "The Gray Man",
    "Bird Box", "Don't Look Up", "White Tiger", "Thunder Force",
  ],
  hbo: [
    "Game of Thrones", "House of the Dragon", "Euphoria", "The Last of Us",
    "Succession", "True Detective", "Westworld", "The White Lotus",
    "Chernobyl", "Band of Brothers", "The Pacific", "Boardwalk Empire",
    "Deadwood", "Rome", "The Sopranos", "Sex and the City",
    "Six Feet Under", "Curb Your Enthusiasm", "Entourage", "Veep",
    "Silicon Valley", "Barry", "The Undoing", "Mare of Easttown",
    "The Flight Attendant", "Peacemaker", "Raised by Wolves",
    "The Nevers", "Tokyo Vice", "The Staircase", "The Idol",
    "The Sympathizer", "The Regime", "The Penguin", "Dune: Prophecy",
  ],
  "prime-video": [
    "The Boys", "Reacher", "Jack Ryan", "The Marvelous Mrs. Maisel",
    "Fleabag", "The Wheel of Time", "Rings of Power", "Invincible",
    "The Expanse", "Hunters", "Upload", "Them", "The Wilds",
    "Panic", "I Know What You Did Last Summer", "The Wilds",
    "Citadel", "Gen V", "Fallout", "Road House", "The Idea of You",
    "The Beekeeper", "Saltburn", "Arthur the King", "Challengers",
    "The Substance", "Saturday Night", "Red One", "No Best Man",
    "Blink Twice", "My Fault", "Simlish", "The Institute",
  ],
  "disney-plus": [
    "The Mandalorian", "Andor", "Obi-Wan Kenobi", "Ahsoka",
    "Loki", "WandaVision", "Falcon and the Winter Soldier", "Hawkeye",
    "Moon Knight", "She-Hulk", "Secret Invasion", "Echo",
    "Percy Jackson", "Welcome to Wrexham", "The Bear", "Only Murders in the Building",
    "Goosebumps", "American Horror Story", "The Greatest Showman",
    "Elemental", "Turning Red", "Luca", "Soul", "Encanto",
    "Raya", "Cruella", "Jungle Cruise", "Free Guy", "Shang-Chi",
    "Black Panther", "Doctor Strange", "Thor", "Avengers",
    "Kingdom of the Planet of the Apes", "Inside Out", "Frozen",
  ],
  "apple-tv-plus": [
    "Severance", "Ted Lasso", "The Morning Show", "Foundation",
    "For All Mankind", "Slow Horses", "Servant", "See",
    "Truth Be Told", "Mosquito Coast", "Physical", "Schmigadoon",
    "Mythic Quest", "Central Park", "Wolfboy", "Extrapolations",
    "Shining Girls", "Black Bird", "Bad Sisters", "Surface",
    "The Afterparty", "Lockdown", "Spirited", "Emancipation",
    "Killers of the Flower Moon", "Napoleon", "Argylle",
    "The Instigators", "Wolfs", "The Brutalist",
  ],
};

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findIdlixMatch(title: string, isTv: boolean, catalog: ReturnType<typeof loadCatalog>) {
  const norm = normalizeTitle(title);
  // Exact match
  let match = catalog.items.find((item) => {
    if (isTv !== item.isSeries) return false;
    return normalizeTitle(item.title) === norm;
  });
  if (match) return match;
  // Partial match
  return catalog.items.find((item) => {
    if (isTv !== item.isSeries) return false;
    const itemNorm = normalizeTitle(item.title);
    return (norm.length > 3 && itemNorm.includes(norm)) || (itemNorm.length > 3 && norm.includes(itemNorm));
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const network = getNetworkBySlug(slug);
    if (!network) {
      return NextResponse.json({ ok: false, error: "Network not found" }, { status: 404 });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.min(500, Math.max(1, Number(sp.get("page") ?? 1)));
    const typeParam = sp.get("type") ?? "all";
    const mediaType: "movie" | "tv" | "all" =
      typeParam === "movie" || typeParam === "tv" ? typeParam : "all";

    const titles = NETWORK_TITLES[slug] || [];
    const catalog = loadCatalog();
    const limit = 24;

    const results: {
      id: string; slug: string; title: string; posterPath: string;
      backdropPath: string; releaseDate: string; voteAverage: string;
      quality: string; country: string; isSeries: boolean; overview: string;
    }[] = [];

    for (const title of titles) {
      const isTv = !title.toLowerCase().includes("movie");
      if (mediaType === "movie" && isTv) continue;
      if (mediaType === "tv" && !isTv) continue;

      const match = findIdlixMatch(title, true, catalog) || findIdlixMatch(title, false, catalog);
      if (match) {
        const poster = match.posterPath || "";
        const backdrop = match.backdropPath || "";
        results.push({
          id: match.id,
          slug: match.slug,
          title: match.title,
          posterPath: poster.startsWith("http") ? poster : poster ? `https://image.tmdb.org/t/p/w342${poster}` : "",
          backdropPath: backdrop.startsWith("http") ? backdrop : backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
          releaseDate: match.releaseDate,
          voteAverage: String(match.voteAverage || ""),
          quality: "",
          country: match.country || "",
          isSeries: match.isSeries,
          overview: match.overview || "",
        });
      }
    }

    // Pagination
    const total = results.length;
    const start = (page - 1) * limit;
    const pageItems = results.slice(start, start + limit);
    const hasMore = start + limit < total;

    const logos = await getNetworkLogos();

    return NextResponse.json(
      {
        ok: true,
        network,
        data: pageItems,
        total,
        hasMore,
        logos,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
