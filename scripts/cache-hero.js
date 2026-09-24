#!/usr/bin/env node

/**
 * Hero cache generator — standalone (no running server needed).
 *
 * Reads public/idlix-data/catalog.json directly:
 *   1. Indonesian movies from NgeFilm (must already have TMDB logo + backdrop) — placed first
 *   2. Popular IDLIX movies/series with backdrop — logo fetched straight from the IDLIX API
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
const INDO_MAX = 10;
const IDLIX_POOL = 50;
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toHeroItem(item, logo, backdrop) {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: backdrop || item.backdropPath || item.posterPath,
    releaseDate: item.releaseDate,
    voteAverage: item.voteAverage,
    genres: item.genres || [],
    overview: item.overview || "",
    isSeries: !!item.isSeries,
    logo: logo || null,
  };
}

// IDLIX detail API — returns TMDB logo path directly (no server round-trip)
async function fetchIdlixHeroItem(item) {
  if (!item.backdropPath && !item.posterPath) return null;

  const endpoint = item.isSeries ? "series" : "movies";
  const detail = await curlGet(`${IDLIX_BASE}/api/${endpoint}/${item.slug}`);
  if (!detail || detail.error) return null;

  const logo = detail.logoPath || null;
  if (!logo) return null;

  return toHeroItem(item, logo, item.backdropPath || item.posterPath);
}

async function cacheHeroItems() {
  log("Starting hero cache generation...");

  const catalog = loadCatalog();
  if (!catalog.items || catalog.items.length === 0) {
    log("No items in catalog, skipping hero cache");
    return;
  }

  // 1) Indonesian movies from NgeFilm — pre-enriched by scrape-catalog.js (logo + backdrop)
  const indoPool = shuffle(
    catalog.items.filter(
      (it) =>
        it.source === "ngefilm" &&
        !it.isSeries &&
        it.tmdbLogoPath &&
        it.tmdbBackdropPath
    )
  );
  const indoItems = indoPool.slice(0, INDO_MAX).map((it) =>
    toHeroItem(it, it.tmdbLogoPath, it.tmdbBackdropPath)
  );
  log(`Indonesian candidates: ${indoPool.length}, selected: ${indoItems.length}`);

  // 2) IDLIX — popular movies & series that already have a backdrop
  const idlixCandidates = shuffle(
    catalog.items
      .filter((it) => it.source !== "ngefilm" && it.backdropPath)
      .sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0))
      .slice(0, IDLIX_POOL)
  );

  const idlixItems = [];
  const need = HERO_MAX - indoItems.length;
  log(`Checking ${idlixCandidates.length} IDLIX candidates for TMDB logos...`);

  for (const item of idlixCandidates) {
    if (idlixItems.length >= need) break;
    const enriched = await fetchIdlixHeroItem(item);
    if (enriched) {
      idlixItems.push(enriched);
      process.stdout.write(
        `\r  Found ${indoItems.length} Indo + ${idlixItems.length}/${need} IDLIX items with TMDB logos`
      );
    }
    await new Promise((r) => setTimeout(r, IDLIX_DELAY_MS));
  }
  console.log();

  // Combine: Indonesian films first, then IDLIX
  const combined = [...indoItems, ...idlixItems].slice(0, HERO_MAX);

  if (combined.length === 0) {
    log("No hero items found with logos, using fallback");
    const fallback = catalog.items.slice(0, 10).map((it) => toHeroItem(it, null, it.backdropPath));
    combined.push(...fallback);
  }

  const cacheData = {
    items: combined,
    cachedAt: new Date().toISOString(),
  };

  const dir = path.dirname(HERO_CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(HERO_CACHE_PATH, JSON.stringify(cacheData, null, 2), "utf8");
  log(
    `✅ Hero cache updated: ${combined.length} items (${indoItems.length} Indo, ${combined.length - indoItems.length} IDLIX) saved to ${HERO_CACHE_PATH}`
  );
}

cacheHeroItems().catch((err) => {
  log(`❌ Hero cache failed: ${err.message}`);
  process.exit(1);
});
