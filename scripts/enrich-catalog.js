#!/usr/bin/env node
/**
 * Enrich catalog items with genre data from IDLIX detail API
 * Uses curl to bypass Cloudflare, runs concurrently for speed
 */
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);

const IDLIX_BASE = "https://z2.idlixku.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CONCURRENCY = 15;
const CATALOG_PATH = path.join(__dirname, "..", "public", "idlix-data", "catalog.json");
const NEW_CATALOG_PATH = path.join(__dirname, "..", "public", "idlix-data", "catalog-new.json");

async function curlJson(url, referer) {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-A", UA,
      "-H", "Accept: application/json",
      "-H", `Referer: ${referer}`,
      "-w", "\n%{http_code}",
      "--max-time", "15",
      url,
    ], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    const statusMatch = stdout.match(/\n(\d{3})\n?$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    const idx = stdout.lastIndexOf("\n" + status);
    const body = idx > 0 ? stdout.slice(0, idx) : stdout;
    if (status !== 200) return null;
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function fetchDetail(slug, isSeries) {
  const type = isSeries ? "series" : "movies";
  const ref = `${IDLIX_BASE}/${isSeries ? "series" : "movie"}/${slug}`;
  let data = await curlJson(`${IDLIX_BASE}/api/${type}/${slug}`, ref);
  if (!data || data.error) {
    // Try the other type
    const altType = isSeries ? "movies" : "series";
    data = await curlJson(`${IDLIX_BASE}/api/${altType}/${slug}`, ref);
  }
  return data;
}

async function processItem(item, index, total) {
  const slug = item.slug;
  if (!slug) return item;

  // Skip if already has genres
  if (item.genres && item.genres.length > 0) {
    return item;
  }

  const detail = await fetchDetail(slug, item.isSeries);
  if (!detail) {
    process.stdout.write(`  [${index}/${total}] ${slug} - SKIP\n`);
    return item;
  }

  const genres = (detail.genres || []).map(g => ({
    id: g.id || g.tmdbId || g.name,
    name: g.name,
    slug: g.slug || g.name?.toLowerCase().replace(/\s+/g, "-"),
  }));

  item.genres = genres;
  item.overview = detail.overview || item.overview;
  item.runtime = detail.runtime || item.runtime;
  item.cast = (detail.cast || []).slice(0, 12).map(c => ({
    id: c.id || c.tmdbPersonId,
    name: c.name,
    character: c.character,
    profilePath: c.profilePath,
  }));
  item.director = detail.director || item.director;
  item.tagline = detail.tagline;
  item.status = detail.status;
  item.backdropPath = detail.backdropPath || item.backdropPath;
  item.posterPath = detail.posterPath || item.posterPath;
  item.numberOfSeasons = detail.numberOfSeasons || item.numberOfSeasons;
  item.voteCount = detail.voteCount || detail.viewCount;

  process.stdout.write(`  [${index}/${total}] ${slug} - ${genres.length} genres\n`);
  return item;
}

async function runBatch(items, startIdx, total) {
  return Promise.all(items.map((item, i) => processItem(item, startIdx + i + 1, total)));
}

async function main() {
  const srcPath = fs.existsSync(NEW_CATALOG_PATH) ? NEW_CATALOG_PATH : CATALOG_PATH;
  console.log(`Reading catalog from ${srcPath}...`);
  const catalog = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  const items = catalog.items;
  const total = items.length;

  const needEnrich = items.filter(it => !it.genres || it.genres.length === 0);
  console.log(`Total: ${total}, need enrichment: ${needEnrich.length}`);

  // Process in batches
  let done = 0;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const enriched = await runBatch(batch, i, total);
    for (let j = 0; j < enriched.length; j++) {
      items[i + j] = enriched[j];
    }
    done += batch.length;

    // Save progress every 500 items
    if (done % 500 < CONCURRENCY) {
      const enrichedCount = items.filter(it => it.genres && it.genres.length > 0).length;
      console.log(`\n  Progress: ${done}/${total} processed, ${enrichedCount} enriched\n`);
      fs.writeFileSync(CATALOG_PATH, JSON.stringify({
        items,
        total: items.length,
        scrapedAt: new Date().toISOString(),
      }, null, 2), "utf8");
    }
  }

  // Final save
  fs.writeFileSync(CATALOG_PATH, JSON.stringify({
    items,
    total: items.length,
    scrapedAt: new Date().toISOString(),
  }, null, 2), "utf8");

  const enrichedCount = items.filter(it => it.genres && it.genres.length > 0).length;
  console.log(`\nDone! ${enrichedCount}/${total} items have genres. Saved to ${CATALOG_PATH}`);
}

main().catch(console.error);
