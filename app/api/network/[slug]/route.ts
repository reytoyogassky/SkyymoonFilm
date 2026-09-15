import { NextRequest, NextResponse } from "next/server";
import { getNetworkBySlug, getNetworkLogos } from "@/lib/networks";
import { loadCatalog, IDLIX_BASE } from "@/lib/idlix";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const dynamic = "force-dynamic";

const EXTRA_TITLES: Record<string, string[]> = {
  netflix: [
    "Squid Game", "Wednesday", "Stranger Things", "Lupin", "Money Heist", "Dark",
    "Narcos", "Alice in Borderland", "Kingdom", "Sweet Home", "Manifest",
    "The Witcher", "Shadow and Bone", "All of Us Are Dead", "Hellbound",
    "Vincenzo", "Crash Landing on You", "Itaewon Class", "My Name",
    "Record of Ragnarok", "Arcane", "One Piece", "Cyberpunk: Edgerunners",
    "Dragon Ball", "Attack on Titan", "Jujutsu Kaisen", "Demon Slayer",
    "The Uncanny Counter", "Glitch", "Extreme Job", "Troll",
    "Bodkin", "The Residence", "Adolescence", "Karma",
    "Department Q", "The Four Seasons", "Frankenstein",
    "Fear Street", "Old Guard", "Red Notice", "Glass Onion",
    "Knives Out", "Extraction", "The Gray Man", "Bird Box",
    "Don't Look Up", "White Tiger", "Thunder Force", "Day Shift",
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
    "Panic", "I Know What You Did Last Summer", "Citadel", "Gen V",
    "Fallout", "Road House", "The Idea of You", "The Beekeeper",
    "Saltburn", "Arthur the King", "Challengers", "The Substance",
    "Saturday Night", "Red One", "Blink Twice", "My Fault",
    "The Institute",
  ],
  "disney-plus": [
    "The Mandalorian", "Andor", "Obi-Wan Kenobi", "Ahsoka",
    "Loki", "WandaVision", "Falcon and the Winter Soldier", "Hawkeye",
    "Moon Knight", "She-Hulk", "Secret Invasion", "Echo",
    "Percy Jackson", "Welcome to Wrexham", "The Bear", "Only Murders in the Building",
    "Goosebumps", "Elemental", "Turning Red", "Luca", "Soul",
    "Encanto", "Cruella", "Jungle Cruise", "Free Guy", "Shang-Chi",
    "Black Panther", "Doctor Strange", "Thor", "Avengers",
    "Kingdom of the Planet of the Apes", "Inside Out", "Frozen",
  ],
  "apple-tv-plus": [
    "Severance", "Ted Lasso", "The Morning Show", "Foundation",
    "For All Mankind", "Slow Horses", "Servant", "See",
    "Truth Be Told", "Mosquito Coast", "Physical", "Schmigadoon",
    "Mythic Quest", "Central Park", "Extrapolations",
    "Shining Girls", "Black Bird", "Bad Sisters", "Surface",
    "The Afterparty", "Lockdown", "Spirited", "Emancipation",
    "Killers of the Flower Moon", "Napoleon", "Argylle",
    "The Instigators", "Wolfs", "The Brutalist",
  ],
};

async function scrapeIdlixNetwork(slug: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-A", UA,
      "-H", `Referer: ${IDLIX_BASE}/`,
      "--max-time", "20",
      `${IDLIX_BASE}/network/${slug}`,
    ], { timeout: 25000, maxBuffer: 4 * 1024 * 1024 });
    const matches = [...stdout.matchAll(/\/(movie|series)\/([a-z0-9-]+)/g)];
    return [...new Set(matches.map((m) => m[2]))];
  } catch {
    return [];
  }
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findIdlixItem(title: string, catalog: ReturnType<typeof loadCatalog>) {
  const norm = normalizeTitle(title);
  let match = catalog.items.find((item) => normalizeTitle(item.title) === norm);
  if (match) return match;
  return catalog.items.find((item) => {
    const itemNorm = normalizeTitle(item.title);
    return (norm.length > 3 && itemNorm.includes(norm)) || (itemNorm.length > 3 && norm.includes(itemNorm));
  });
}

function itemToResult(item: ReturnType<typeof loadCatalog>["items"][0]) {
  const poster = item.posterPath || "";
  const backdrop = item.backdropPath || "";
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    posterPath: poster.startsWith("http") ? poster : poster ? `https://image.tmdb.org/t/p/w342${poster}` : "",
    backdropPath: backdrop.startsWith("http") ? backdrop : backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
    releaseDate: item.releaseDate,
    voteAverage: String(item.voteAverage || ""),
    quality: "",
    country: item.country || "",
    isSeries: item.isSeries,
    overview: item.overview || "",
  };
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

    const catalog = loadCatalog();
    const limit = 24;

    // Page 1: scrape from idlix network page
    // Page 2+: use extra titles list
    let allResults: ReturnType<typeof itemToResult>[] = [];

    if (page === 1) {
      const scrapedSlugs = await scrapeIdlixNetwork(slug);
      for (const s of scrapedSlugs) {
        const item = catalog.items.find((i) => i.slug === s);
        if (!item) continue;
        if (mediaType === "movie" && item.isSeries) continue;
        if (mediaType === "tv" && !item.isSeries) continue;
        allResults.push(itemToResult(item));
      }
    }

    // Add extra titles (skip ones already found by scraping)
    const existingSlugs = new Set(allResults.map((r) => r.slug));
    const extras = EXTRA_TITLES[slug] || [];
    for (const title of extras) {
      const item = findIdlixItem(title, catalog);
      if (!item || existingSlugs.has(item.slug)) continue;
      if (mediaType === "movie" && item.isSeries) continue;
      if (mediaType === "tv" && !item.isSeries) continue;
      allResults.push(itemToResult(item));
      existingSlugs.add(item.slug);
    }

    const total = allResults.length;
    const start = (page - 1) * limit;
    const pageItems = allResults.slice(start, start + limit);
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
