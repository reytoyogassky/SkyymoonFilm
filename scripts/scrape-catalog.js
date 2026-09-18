#!/usr/bin/env node

/**
 * IDLIX Catalog Scraper
 * 
 * Fetches all movies/series from IDLIX, enriches with detail data,
 * and merges with existing catalog.json.
 * 
 * Usage:
 *   node scripts/scrape-catalog.js           # merge mode (default)
 *   node scripts/scrape-catalog.js --fresh    # replace entirely
 *   node scripts/scrape-catalog.js --dry-run  # preview changes only
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);

// ============================================================
// CONFIG
// ============================================================
const IDLIX_BASE = "https://z2.idlixku.com";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CATALOG_PATH = path.join(__dirname, "..", "public", "idlix-data", "catalog.json");
const BACKUP_PATH = path.join(__dirname, "..", "public", "idlix-data", "catalog-backup.json");
const BROWSE_LIMIT = 100;
const ENRICH_CONCURRENCY = 10;
const ENRICH_DELAY_MS = 300;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;

// Parse CLI args
const args = process.argv.slice(2);
const FRESH_MODE = args.includes("--fresh");
const DRY_RUN = args.includes("--dry-run");

// ============================================================
// HTTP HELPERS (using curl like the main app)
// ============================================================
async function curlGet(url, retries = MAX_RETRIES) {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-A", DESKTOP_UA,
      "-H", "Accept: application/json",
      "-H", `Referer: ${IDLIX_BASE}/`,
      "-w", "\n%{http_code}",
      "--max-time", "20",
      url,
    ], { timeout: 25000, maxBuffer: 4 * 1024 * 1024 });

    const statusMatch = stdout.match(/\n(\d{3})\n?$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;

    if (status !== 200) {
      if (retries > 0) {
        await sleep(RETRY_DELAY_MS);
        return curlGet(url, retries - 1);
      }
      throw new Error(`HTTP ${status} for ${url}`);
    }

    const idx = stdout.lastIndexOf("\n" + status);
    const body = idx > 0 ? stdout.slice(0, idx) : stdout;
    return JSON.parse(body);
  } catch (err) {
    if (retries > 0 && !err.message.includes("HTTP")) {
      await sleep(RETRY_DELAY_MS);
      return curlGet(url, retries - 1);
    }
    throw err;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// STEP 1: Fetch all items from browse API
// ============================================================
async function fetchAllItems() {
  const allItems = [];
  let page = 1;
  let totalPages = 1;

  console.log("📥 Fetching items from IDLIX browse API...");

  while (page <= totalPages) {
    const url = `${IDLIX_BASE}/api/browse?page=${page}&limit=${BROWSE_LIMIT}&sort=latest`;
    try {
      const res = await curlGet(url);
      const items = res.data || [];
      const pagination = res.pagination || {};

      allItems.push(...items);
      totalPages = pagination.totalPages || 1;

      const total = pagination.total || 0;
      const pct = totalPages > 0 ? Math.round((page / totalPages) * 100) : 0;
      process.stdout.write(`\r   Page ${page}/${totalPages} (${allItems.length}/${total} items) [${pct}%]`);

      page++;
      if (page <= totalPages) await sleep(200); // polite delay
    } catch (err) {
      console.error(`\n   ❌ Error on page ${page}: ${err.message}`);
      if (page > 1) {
        console.log("   Continuing from next page...");
        page++;
      } else {
        throw err;
      }
    }
  }

  console.log(`\n   ✅ Fetched ${allItems.length} items total\n`);
  return allItems;
}

// ============================================================
// STEP 2: Map browse item to catalog format
// ============================================================
function browseToCatalogItem(item) {
  const isSeries = item.contentType === "tv_series";
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    posterPath: item.posterPath || null,
    backdropPath: item.backdropPath || null,
    releaseDate: item.releaseDate || "",
    voteAverage: item.voteAverage || "0",
    country: item.country || "",
    runtime: item.runtime || null,
    genres: [],
    overview: null,
    contentType: item.contentType || (isSeries ? "tv_series" : "movie"),
    isSeries,
    numberOfSeasons: item.numberOfSeasons || (isSeries ? 1 : undefined),
    quality: item.quality || "",
    popularityScore: item.popularityScore || 0,
    viewCount: item.viewCount || 0,
    cast: [],
    director: null,
    tagline: null,
    status: null,
    productionCompanies: [],
    networks: [],
    voteCount: item.commentCount || 0,
  };
}

// ============================================================
// STEP 3: Enrich items with detail API
// ============================================================
async function enrichItem(item) {
  const endpoint = item.isSeries ? "series" : "movies";
  const url = `${IDLIX_BASE}/api/${endpoint}/${item.slug}`;
  try {
    const detail = await curlGet(url);
    if (!detail || detail.error) return item;

    // Merge detail fields
    item.overview = detail.overview || item.overview;
    item.tagline = detail.tagline || item.tagline;
    item.status = detail.status || item.status;
    item.runtime = detail.runtime || item.runtime;
    item.voteAverage = detail.voteAverage || item.voteAverage;
    item.voteCount = detail.voteCount || detail.voteCount || item.voteCount;
    item.posterPath = detail.posterPath || item.posterPath;
    item.backdropPath = detail.backdropPath || item.backdropPath;
    item.quality = detail.quality || item.quality || "";

    if (detail.genres && detail.genres.length > 0) {
      item.genres = detail.genres.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
      }));
    }

    if (detail.cast && detail.cast.length > 0) {
      item.cast = detail.cast.slice(0, 20).map((c) => ({
        id: c.id || c.tmdbPersonId?.toString(),
        name: c.name,
        character: c.character || "",
        profilePath: c.profilePath || null,
      }));
    }

    if (detail.productionCompanies && detail.productionCompanies.length > 0) {
      item.productionCompanies = detail.productionCompanies.map((p) => ({
        id: p.id,
        name: p.name,
        logoPath: p.logo_path || p.logoPath || null,
      }));
    }

    if (detail.networks && detail.networks.length > 0) {
      item.networks = detail.networks.map((n) => ({
        id: n.id,
        name: n.name,
        logoPath: n.logo_path || n.logoPath || null,
      }));
    }

    if (item.isSeries && detail.numberOfSeasons) {
      item.numberOfSeasons = detail.numberOfSeasons;
    }

    // Try to find director from cast/credits
    if (detail.createdBy && detail.createdBy.length > 0) {
      item.director = detail.createdBy.map((c) => c.name).join(", ");
    }

    return item;
  } catch (err) {
    console.error(`   ⚠ Failed to enrich ${item.slug}: ${err.message}`);
    return item;
  }
}

async function enrichAllItems(items) {
  const needsEnrichment = items.filter(
    (it) => !it.genres || it.genres.length === 0 || !it.overview
  );
  console.log(`🔍 Enriching ${needsEnrichment.length} items missing data...`);

  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < needsEnrichment.length; i += ENRICH_CONCURRENCY) {
    const batch = needsEnrichment.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((item) => enrichItem(item)));

    for (const r of results) {
      if (r.status === "fulfilled") enriched++;
      else failed++;
    }

    const pct = Math.round(((i + batch.length) / needsEnrichment.length) * 100);
    process.stdout.write(`\r   Enriched ${enriched}/${needsEnrichment.length} (${pct}%) [${failed} failed]`);

    if (i + ENRICH_CONCURRENCY < needsEnrichment.length) await sleep(ENRICH_DELAY_MS);
  }

  console.log(`\n   ✅ Enrichment complete\n`);
}

// ============================================================
// STEP 4: Merge with existing catalog
// ============================================================
function loadExistingCatalog() {
  try {
    if (fs.existsSync(CATALOG_PATH)) {
      const raw = fs.readFileSync(CATALOG_PATH, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.log(`   ⚠ Could not load existing catalog: ${err.message}`);
  }
  return { items: [], total: 0, scrapedAt: "" };
}

function mergeCatalogs(existingItems, newItems) {
  const existingMap = new Map(existingItems.map((it) => [it.slug, it]));
  const newMap = new Map(newItems.map((it) => [it.slug, it]));

  let added = 0;
  let updated = 0;
  let removed = 0;
  const merged = [];

  // Add new items and update existing ones
  for (const [slug, newItem] of newMap) {
    const oldItem = existingMap.get(slug);
    if (!oldItem) {
      // New item - keep enriched data from fresh scrape
      merged.push(newItem);
      added++;
    } else {
      // Existing item - update with fresh data, keep old enrichment if new is empty
      const updatedItem = { ...oldItem };
      // Always update these fields from fresh scrape
      updatedItem.id = newItem.id;
      updatedItem.title = newItem.title;
      updatedItem.posterPath = newItem.posterPath || oldItem.posterPath;
      updatedItem.backdropPath = newItem.backdropPath || oldItem.backdropPath;
      updatedItem.releaseDate = newItem.releaseDate || oldItem.releaseDate;
      updatedItem.voteAverage = newItem.voteAverage || oldItem.voteAverage;
      updatedItem.country = newItem.country || oldItem.country;
      updatedItem.contentType = newItem.contentType || oldItem.contentType;
      updatedItem.isSeries = newItem.isSeries;
      updatedItem.numberOfSeasons = newItem.numberOfSeasons || oldItem.numberOfSeasons;
      updatedItem.quality = newItem.quality || oldItem.quality || "";
      updatedItem.popularityScore = newItem.popularityScore || oldItem.popularityScore || 0;
      updatedItem.viewCount = newItem.viewCount || oldItem.viewCount || 0;
      // Keep enrichment if new item doesn't have it
      updatedItem.genres = (newItem.genres?.length > 0 ? newItem.genres : oldItem.genres) || [];
      updatedItem.overview = newItem.overview || oldItem.overview;
      updatedItem.cast = (newItem.cast?.length > 0 ? newItem.cast : oldItem.cast) || [];
      updatedItem.director = newItem.director || oldItem.director;
      updatedItem.tagline = newItem.tagline || oldItem.tagline;
      updatedItem.status = newItem.status || oldItem.status;
      updatedItem.productionCompanies = newItem.productionCompanies?.length > 0 ? newItem.productionCompanies : oldItem.productionCompanies || [];
      updatedItem.networks = newItem.networks?.length > 0 ? newItem.networks : oldItem.networks || [];
      updatedItem.voteCount = newItem.voteCount || oldItem.voteCount;
      merged.push(updatedItem);
      updated++;
    }
  }

  // Find removed items
  for (const [slug] of existingMap) {
    if (!newMap.has(slug)) {
      removed++;
    }
  }

  return { merged, added, updated, removed };
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const startTime = Date.now();
  console.log("========================================");
  console.log("  IDLIX Catalog Scraper");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : FRESH_MODE ? "FRESH (replace)" : "MERGE"}`);
  console.log("========================================\n");

  // Load existing catalog
  const existing = FRESH_MODE ? { items: [], total: 0, scrapedAt: "" } : loadExistingCatalog();
  if (!FRESH_MODE) {
    console.log(`📂 Existing catalog: ${existing.items.length} items (scraped: ${existing.scrapedAt})\n`);
  }

  // Fetch all items from IDLIX
  const browseItems = await fetchAllItems();
  const newCatalogItems = browseItems.map(browseToCatalogItem);

  // Enrich items missing data
  if (DRY_RUN) {
    console.log("⏭ Skipping enrichment in dry-run mode\n");
  } else if (!FRESH_MODE) {
    // In merge mode, only enrich items that are new or missing data
    const itemsToEnrich = newCatalogItems.filter((newItem) => {
      const oldItem = existing.items.find((it) => it.slug === newItem.slug);
      return !oldItem || !oldItem.genres || oldItem.genres.length === 0 || !oldItem.overview;
    });
    if (itemsToEnrich.length > 0) {
      await enrichAllItems(itemsToEnrich);
    } else {
      console.log("✅ All items already enriched, skipping enrichment\n");
    }
  } else {
    await enrichAllItems(newCatalogItems);
  }

  // Merge or replace
  let resultItems;
  let stats = { added: 0, updated: 0, removed: 0 };

  if (FRESH_MODE) {
    resultItems = newCatalogItems;
    stats = { added: newCatalogItems.length, updated: 0, removed: existing.items.length };
  } else {
    const mergeResult = mergeCatalogs(existing.items, newCatalogItems);
    resultItems = mergeResult.merged;
    stats = { added: mergeResult.added, updated: mergeResult.updated, removed: mergeResult.removed };
  }

  const catalog = {
    items: resultItems,
    total: resultItems.length,
    scrapedAt: new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log("========================================");
    console.log("  DRY RUN - Changes preview:");
    console.log(`  Added:   ${stats.added}`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Removed: ${stats.removed}`);
    console.log(`  Total:   ${resultItems.length}`);
    console.log("========================================");
    return stats;
  }

  // Backup existing catalog
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      fs.copyFileSync(CATALOG_PATH, BACKUP_PATH);
      console.log("💾 Backup saved to catalog-backup.json");
    } catch (err) {
      console.log(`⚠ Could not backup: ${err.message}`);
    }
  }

  // Ensure directory exists
  const dir = path.dirname(CATALOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write new catalog
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 0), "utf8");
  const fileSizeMB = (fs.statSync(CATALOG_PATH).size / (1024 * 1024)).toFixed(1);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("========================================");
  console.log("  ✅ Scraping complete!");
  console.log(`  Added:   ${stats.added} items`);
  console.log(`  Updated: ${stats.updated} items`);
  console.log(`  Removed: ${stats.removed} items`);
  console.log(`  Total:   ${catalog.total} items`);
  console.log(`  Size:    ${fileSizeMB} MB`);
  console.log(`  Time:    ${duration}s`);
  console.log(`  File:    ${CATALOG_PATH}`);
  console.log("========================================");

  return stats;
}

main().catch((err) => {
  console.error("\n❌ Scraper failed:", err.message);
  process.exit(1);
});
