import { writeFileSync } from "fs";

const BASE = "https://narto-drama.com";
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en;q=0.7",
};

let reqCount = 0;
async function fetchPage(url) {
  reqCount++;
  if (reqCount % 20 === 0) console.log(`  ${reqCount} requests...`);
  try {
    const res = await fetch(url, { headers: H, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Extract drama cards from HTML
function extractDramas(html) {
  const dramas = [];
  // Pattern: <article class="card" data-watch-url="..." data-movie-id="..." ...>
  const cardPat = /<article[^>]*class="card"[^>]*>/gi;
  let m;
  while ((m = cardPat.exec(html)) !== null) {
    const block = html.substring(m.index, m.index + 2000);

    const watchUrl = block.match(/data-watch-url="([^"]+)"/)?.[1] || "";
    const movieId = block.match(/data-movie-id="([^"]+)"/)?.[1] || "";
    const title = block.match(/data-movie-title="([^"]+)"/)?.[1] || "";

    // Extract slug from watch URL: /detail/watch/<slug>
    const slugMatch = watchUrl.match(/\/detail\/watch\/([^?/]+)/);
    const slug = slugMatch ? slugMatch[1] : "";

    // Extract poster image
    const imgMatch = block.match(/<img[^>]*class="poster"[^>]*src="([^"]+)"/);
    const poster = imgMatch ? (imgMatch[1].startsWith("http") ? imgMatch[1] : BASE + imgMatch[1]) : "";

    // Extract episode badge
    const epMatch = block.match(/class="episode-badge"[^>]*>Ep:\s*(\d+)/);
    const totalEp = epMatch ? parseInt(epMatch[1]) : 0;

    // Extract tags
    const tags = [];
    const tagPat = /class="movie-tag[^"]*"[^>]*>#([^<]+)/g;
    let tm;
    while ((tm = tagPat.exec(block)) !== null) tags.push(tm[1]);

    if (slug) {
      dramas.push({
        slug,
        title: title.replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
        poster,
        totalEpisode: totalEp,
        tags,
        watchUrl,
        movieId,
      });
    }
  }
  return dramas;
}

// Extract episode count and video URL from detail page
function extractDetail(html) {
  // Get episode count from JSON-LD
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let videoUrl = null;
  let description = "";
  let totalEp = 0;

  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      if (ld.contentUrl) videoUrl = ld.contentUrl;
      if (ld.description) description = ld.description;
      if (ld.isPartOf?.name) totalEp = 0; // will get from episode list
    } catch {}
  }

  // Count episodes from links like EP 1, EP 2...
  const epLinks = html.match(/\/detail\/watch\/[^/]+\/(\d+)\?/g);
  if (epLinks) {
    const epNums = epLinks.map(e => parseInt(e.match(/\/(\d+)\?/)?.[1] || "0"));
    totalEp = Math.max(...epNums, 0);
  }

  return { videoUrl, description, totalEp };
}

// Extract video URL from episode page
function extractEpisodeVideo(html) {
  // Try JSON-LD contentUrl
  const ldMatch = html.match(/"contentUrl"\s*:\s*"([^"]+)"/);
  if (ldMatch) return ldMatch[1].replace(/\\u0026/g, "&");

  // Try direct tiktok CDN pattern
  const cdnMatch = html.match(/(https?:\/\/v\d+-ch\.tiktokcdn\.com\/[^\s"'<>]+)/);
  if (cdnMatch) return cdnMatch[1];

  return null;
}

// Get provider list
async function getProviders() {
  const res = await fetchPage(`${BASE}/home/providers/sections?provider=bibishort&lang=id-ID&target_lang=id-ID`);
  if (!res) return [];
  try {
    const data = JSON.parse(res);
    return data.providers || [];
  } catch { return []; }
}

// Scrape one provider's listings
async function scrapeProvider(key) {
  const all = [];
  const seen = new Set();

  // Fetch up to 50 pages per provider
  for (let page = 1; page <= 50; page++) {
    const url = page === 1
      ? `${BASE}?tab-provider=${key}`
      : `${BASE}?tab-provider=${key}&page=${page}`;

    const html = await fetchPage(url);
    if (!html) break;

    const dramas = extractDramas(html);
    if (dramas.length === 0) break;

    let added = 0;
    for (const d of dramas) {
      if (!seen.has(d.slug)) {
        seen.add(d.slug);
        d.provider = key;
        all.push(d);
        added++;
      }
    }

    if (added === 0) break;
    console.log(`  [${key}] page ${page}: +${added} = ${all.length}`);
    await sleep(200);
  }

  return all;
}

// Main
async function main() {
  console.log("Getting providers...");
  const providers = await getProviders();
  console.log(`Found ${providers.length} providers\n`);

  // Step 1: Scrape all drama listings from all providers
  console.log("=== STEP 1: Scraping listings ===\n");
  const allDramas = [];
  const seenSlugs = new Set();

  for (const p of providers) {
    console.log(`Provider: ${p.label} (${p.key})`);
    const dramas = await scrapeProvider(p.key);
    for (const d of dramas) {
      if (!seenSlugs.has(d.slug)) {
        seenSlugs.add(d.slug);
        d.providers = [p.key];
        allDramas.push(d);
      } else {
        // Add provider to existing drama
        const existing = allDramas.find(x => x.slug === d.slug);
        if (existing && !existing.providers.includes(p.key)) {
          existing.providers.push(p.key);
        }
      }
    }
    console.log(`  Total unique: ${allDramas.length}\n`);
  }

  console.log(`\nTotal dramas: ${allDramas.length}`);

  // Step 2: Get video URLs for each drama (fetch first episode)
  console.log("\n=== STEP 2: Getting video URLs ===\n");

  let ok = 0, fail = 0;
  for (let i = 0; i < allDramas.length; i++) {
    const d = allDramas[i];

    // Fetch first episode to get video URL
    const epUrl = `${BASE}/detail/watch/${d.slug}/1?lang=id-ID`;
    const html = await fetchPage(epUrl);

    if (html) {
      d.streamUrl = extractEpisodeVideo(html);
      if (d.streamUrl) ok++; else fail++;
    } else {
      fail++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  [${i + 1}/${allDramas.length}] OK: ${ok} | FAIL: ${fail}`);
    }
    if ((i + 1) % 10 === 0) await sleep(100);
  }

  console.log(`\nStream OK: ${ok} | FAIL: ${fail}`);

  // Save
  const out = {
    scrape_date: new Date().toISOString(),
    source: "narto-drama.com",
    total: allDramas.length,
    with_stream: ok,
    providers: providers.map(p => ({ key: p.key, label: p.label })),
    dramas: allDramas,
  };

  writeFileSync("D:/gabut/film/drama-player/public/data.json", JSON.stringify(out), "utf-8");
  const mb = (JSON.stringify(out).length / 1024 / 1024).toFixed(1);
  console.log(`\nSaved to public/data.json (${mb} MB)`);
}

main().catch(console.error);
