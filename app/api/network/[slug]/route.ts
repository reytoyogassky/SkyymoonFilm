import { NextRequest, NextResponse } from "next/server";
import { getNetworkBySlug, getNetworkLogos } from "@/lib/networks";
import { loadCatalog, IDLIX_BASE } from "@/lib/idlix";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const dynamic = "force-dynamic";

const NETWORK_TITLES: Record<string, string[]> = {
  netflix: [
    "Squid Game", "Wednesday", "Stranger Things", "Lupin", "Money Heist", "Dark",
    "Narcos", "Alice in Borderland", "Kingdom", "Sweet Home", "Manifest",
    "The Witcher", "Shadow and Bone", "All of Us Are Dead", "Hellbound",
    "Vincenzo", "Crash Landing on You", "Itaewon Class", "My Name",
    "Record of Ragnarok", "Arcane", "One Piece", "Cyberpunk: Edgerunners",
    "Dragon Ball", "Attack on Titan", "Jujutsu Kaisen", "Demon Slayer",
    "The Uncanny Counter", "Glitch", "Extreme Job", "Troll",
    "Bodkin", "The Residence", "Adolescence", "Karma",
    "Department Q", "The Four Seasons", "Frankenstein", "Black Hat",
    "Fear Street", "Old Guard", "Red Notice", "Glass Onion",
    "Knives Out", "Extraction", "The Gray Man", "Bird Box",
    "Don't Look Up", "White Tiger", "Thunder Force", "Day Shift",
    "Spencer Confidential", "The Platform", "Army of the Dead",
    "Gunpowder Milkshake", "Kate", "Sweet Girl", "Beckett",
    "Outside the Wire", "Cherry", "Malcolm & Marie", "Maldives",
    "The Dig", "Pieces of a Woman", "Thunder Force", "Stowaway",
    "yes day", "To All the Boys", "The Kissing Booth", "Tall Girl",
    "He's All That", "Finding Ohana", "The Half of It",
    "Blue Mirage", "Love Hard", "Nobody", "The Harder They Fall",
    "Passing", "Bruised", "tick tick...BOOM!", "The Unforgivable",
    "Robin Robin", "A Castle for Christmas", "Love Life",
    "The Princess Switch", "A Christmas Prince", "The Holiday",
    "Falling for Christmas", "Plus One", "Long Story Short",
    "Find Yourself", "Love O2O", "The Rational Life",
    "Begin Again", "Suspicious Partner", "Because This Is My First Life",
    "What's Wrong with Secretary Kim", "Strong Girl Nam-soon",
    "Queen of Tears", "Lovely Runner", "Marry My Husband",
    "The Escape of the Seven", "Doctor Slump", "Queen of Tears",
    "A Shop for Killers", "The Bequeathed", "Squid Game: The Challenge",
    "The Trust", "Rebel Moon", "Leave the World Behind",
    "Leo", "Uglies", "Willy's Wonderland", "The Wrong Missy",
    "Woman of the Hour", "Rez Ball", "His Three Daughters",
    "Rez Ball", "Rez Ball", "The Deliverance", "Beverly Hills Cop",
    "Back in Action", "The Union", "Atlas", "Rebel Moon Part Two",
    "European Vacation", "Carry-On", "The Six Triple Eight",
    "Spellbound", "Hot Frosty", "The Merry Gentleman",
    "The Spy Next Door", "Christmas with You", "Love at First Sight",
    "My Santa", "The Noel Diary", "Falling for Christmas",
    "Your Place or Mine", "Players", "You Are So Not Invited",
    "Time Cut", "Behind the Eyes", "Kindred", "The Deepest Breath",
    "Selena Gomez: My Mind & Me", "Harry & Meghan", "Kalidoface",
    "The Law According to Lydia Poet", "Behind the Scenes",
    "Harta Tahta Raisa", "Slumberland", "Wendell & Wild",
    "The Swimmers", "Luck", "Troll", "Oldguard",
    "Pinocchio", "Tedu Lieder", "The Sea Beast",
    "My Father's Dragon", "Monster High", "13: The Musical",
    "B الأول", "End of the Road", "Lou", "Me Time",
    "Day Shift", "That's Amor", "Love in the Villa",
    "Loving Adults", "Lamborghini", "Deranged",
    "Rise of the Teenage Mutant Ninja Turtles", "The Wedding Year",
    "Spenser Confidential", "Tall Girl 2", "The Ice Road",
    "Interceptors", "Resident Evil", "The Midnight Sky",
    "Army of Thieves", "Nightbooks", "Headspace",
    "Prank Encounters", "Ridley Jones", "Waffles + Mochi",
    "Ada Twist", "Kid Cosmic", "Centaurworld",
    "Dead End: Paranormal Park", "The Cuphead Show",
    "Karma", "Inside Job", "Human Resources",
    "Q-Force", "Chicago Party Aunt", "Dota: Dragon's Blood",
    "Trese", "Yasuke", "Super Crooks",
    "The Cuphead Show", "Farzar", "Grace and Frankie",
    "Never Have I Ever", "Atypical", "Sex Education",
    "Heartstopper", "Young Royals", "Elite",
    "Control Z", "The Secret Diary of an Exchange Student",
    "Lost Bullet", "Blood & Water", "Jiva!",
    "Kingdom", "My Liberation Notes", "My Mister",
    "Move to Heaven", "Racket Boys", "Extraordinary Attorney Woo",
    "Alchemy of Souls", "Little Women", "The Glory",
    "Black Knight", "Bloodhounds", "Mask Girl",
    "Celebrity", "Durian's Affair", "Heartbeat",
    "Doona!", "Strong Girl Nam-soon", "Daily Dose of Sunshine",
    "A Shop for Killers", "The Bequeathed", "Squid Game: The Challenge",
    "The Trust", "Rebel Moon", "Leave the World Behind",
    "Leo", "Uglies", "Willy's Wonderland", "The Wrong Missy",
    "Woman of the Hour", "Rebel Moon Part Two",
    "Carry-On", "The Six Triple Eight", "Spellbound",
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
    "Industry", "Irma Vep", "The Gilded Age", "Somebody Somewhere",
    "Hacks", "The Rehearsal", "We Own This City", "Minx",
    "The Time Traveler's Wife", "The Girl Before", "Station Eleven",
    "Scenes from a Marriage", "The Mayor of Casterbridge",
    "A Black Lady Sketch Show", "Los Espookys", "Vacation Friends",
    "The Book of Boba Fett", "And Just Like That...",
    "Perry Mason", "The Righteous Gemstones", "Lovecraft Country",
    "Love & Death", "The Banshees of Inisherin", "Elvis",
    "The Whale", "Amsterdam", "Don't Worry Darling",
    "The Son", "Magic Mike's Last Dance", "Air",
    "The Iron Claw", "Furiosa", "Civil War",
    "Ferrari", "The Color Purple", "Aquaman and the Lost Kingdom",
  ],
  "prime-video": [
    "The Boys", "Reacher", "Jack Ryan", "The Marvelous Mrs. Maisel",
    "Fleabag", "The Wheel of Time", "Rings of Power", "Invincible",
    "The Expanse", "Hunters", "Upload", "Them", "The Wilds",
    "Panic", "I Know What You Did Last Summer", "Citadel", "Gen V",
    "Fallout", "Road House", "The Idea of You", "The Beekeeper",
    "Saltburn", "Arthur the King", "Challengers", "The Substance",
    "Saturday Night", "Red One", "Blink Twice", "My Fault",
    "The Institute", "The Consultant", "Dead Ringers",
    "Jury Duty", "Mr. & Mrs. Smith", "Swarm", "Daisy Jones & The Six",
    "The Power", "Deadloch", "The Summer I Turned Pretty",
    "Jackpot!", "Candy Cane Lane", "You're Cordially Invited",
    "The Holdovers", "Next Goal Wins", "The Bricklayer",
    "The Beekeeper", "Role Play", "The Idea of You",
    "Road House", "Blink Twice", "The Bikeriders",
    "The Underdoggs", "Grand Theft Parsons", "Snack Shack",
    "The Faraway Paladin", "The Rig", "Night Sky",
    "A League of Their Own", "The Terminal List", "The Tick",
    "Sneaky Pete", "Bosch", "Goliath", "Transparent",
    "Mozart in the Jungle", "Madam Secretary", "Just Add Magic",
    "The Man in the High Castle", "American Gods",
    "Good Omens", "Hanna", "Alex Rider", "Tales from the Loop",
    "Solos", "Making Their Case", "Welcome to the Blumhouse",
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
    "Aladdin", "The Lion King", "Mulan", "Raya and the Last Dragon",
    "Strange World", "Wish", "The Little Mermaid", "Haunted Mansion",
    "Indiana Jones", "Ant-Man", "Guardians of the Galaxy",
    "Spider-Man", "Black Widow", "Eternals", "Ms. Marvel",
    "I Am Groot", "Star Wars: Visions", "The Bad Batch",
    "Tales of the Jedi", "Willow", "Willow",
    "National Treasure", "American Horror Stories", "Mike",
    "Pam & Tommy", "The Dropout", "Under the Banner of Heaven",
    "Dopesick", "The Bear", "Welcome to Wrexham",
    "Beyond Illustrating", "Secret Headquarters",
    "Fire of Love", "Troop Zero", "Stuntman",
    "Hawkeye", "Assembled", "Marvel's 616",
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
    "Pachinko", "Little America", "Swagger", "Freq",
    "The Morning Show", "Defending Jacob", "Lisey's Story",
    "Physical", "Mr. Corman", "The Snoopy Show",
    "Central Park", "Wolfboy", "City on a Hill",
    "Home Before Dark", "Defending Jacob", "Tehran",
    "Suspicion", "The Shrink Next Door", "Echo 3",
    "Pantheon", "Prehistoric Planet", "Amplified",
    "Codebreaker", "Circuit Breakers",
    "The Problem with Jon Stewart", "Harmonquest",
    "The Elephant Queen", "Hala", "Dads",
    "Boys State", "Time to Walk", "The Super Models",
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

    // Page 1: scrape from idlix + extras
    // Page 2+: more extras
    const allResults: ReturnType<typeof itemToResult>[] = [];
    const existingSlugs = new Set<string>();

    // Page 1: scrape
    if (page === 1) {
      const scrapedSlugs = await scrapeIdlixNetwork(slug);
      for (const s of scrapedSlugs) {
        const item = catalog.items.find((i) => i.slug === s);
        if (!item) continue;
        if (mediaType === "movie" && item.isSeries) continue;
        if (mediaType === "tv" && !item.isSeries) continue;
        allResults.push(itemToResult(item));
        existingSlugs.add(item.slug);
      }
    }

    // All pages: extra titles
    const extras = NETWORK_TITLES[slug] || [];
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
