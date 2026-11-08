#!/usr/bin/env node

/**
 * Hero cache generator — standalone (no running server needed).
 *
 * Reads public/idlix-data/catalog.json directly and selects IDLIX content only.
 * NgeFilm (Indonesian) items are never included.
 *
 * Output: public/idlix-data/hero-cache.json (max 25 items, homepage shows 20)
 *
 * Usage: node scripts/cache-hero.js
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);

const CATALOG_PATH = path.join(__dirname, "..", "public", "idlix-data", "catalog.json");
const HERO_CACHE_PATH = path.join(__dirname, "..", "public", "idlix-data", "hero-cache.json");
const IDLIX_BASE = "https://z2.idlixku.com";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36";

const HERO_MAX = 25;
const IDLIX_POOL = 60;
const IDLIX_DELAY_MS = 100;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function curlGet(url) {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-A", DESKTOP_UA,
      "-H", "Accept: application/json",
      "-w", "\n%{http_code}",
      "--max-time", "15",
      url,
    ], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });

    const statusMatch = stdout.match(/\n(\d{3})\n?$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    if (status !== 200) return null;

    const idx = stdout.lastIndexOf("\n" + status);
    const body = idx > 0 ? stdout.slice(0, idx) : stdout;
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function loadCatalog() {
  try {
    if (fs.existsSync(CATALOG_PATH)) {
      return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
    }
  } catch (err) {
    log(`Error loading catalog: ${err.message}`);
  }
  return { items: [] };
}

function toHeroItem(item, logo) {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath || item.posterPath,
    releaseDate: item.releaseDate,
    voteAverage: item.voteAverage,
    genres: item.genres || [],
    overview: item.overview || "",
    isSeries: !!item.isSeries,
    source: "idlix",
    logo: logo || null,
  };
}

// IDLIX detail API — returns the TMDB logo path (only used when the catalog
// does not already carry logoPath).
async function fetchIdlixLogo(item) {
  const endpoint = item.isSeries ? "series" : "movies";
  const detail = await curlGet(`${IDLIX_BASE}/api/${endpoint}/${item.slug}`);
  if (!detail || detail.error) return null;
  return detail.logoPath || null;
}

async function cacheHeroItems() {
  log("Starting IDLIX-only hero cache generation...");

  const catalog = loadCatalog();
  if (!catalog.items || catalog.items.length === 0) {
    log("No items in catalog, skipping hero cache");
    return;
  }

  const candidates = catalog.items
    .filter((it) => it.source !== "ngefilm" && (it.backdropPath || it.posterPath))
    .sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0))
    .slice(0, IDLIX_POOL);

  log(`IDLIX candidates: ${candidates.length}`);

  const items = [];
  for (const item of candidates) {
    if (items.length >= HERO_MAX) break;
    const logo = item.logoPath || (await fetchIdlixLogo(item));
    if (!logo) {
      await new Promise((r) => setTimeout(r, IDLIX_DELAY_MS));
      continue;
    }
    items.push(toHeroItem(item, logo));
    process.stdout.write(`\r  Found ${items.length}/${HERO_MAX} IDLIX items with logos`);
    await new Promise((r) => setTimeout(r, IDLIX_DELAY_MS));
  }
  console.log();

  // If the catalog/API returned very few logos, still ship IDLIX titles
  // (the hero falls back to the text title when no logo exists).
  if (items.length === 0) {
    log("No logos found — using top IDLIX titles without logos");
    for (const item of candidates.slice(0, HERO_MAX)) {
      items.push(toHeroItem(item, null));
    }
  }

  const cacheData = {
    items,
    cachedAt: new Date().toISOString(),
  };

  const dir = path.dirname(HERO_CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(HERO_CACHE_PATH, JSON.stringify(cacheData, null, 2), "utf8");
  log(`✅ Hero cache updated: ${items.length} IDLIX items saved to ${HERO_CACHE_PATH}`);
}

cacheHeroItems().catch((err) => {
  log(`❌ Hero cache failed: ${err.message}`);
  process.exit(1);
});
