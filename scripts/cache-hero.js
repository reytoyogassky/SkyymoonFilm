#!/usr/bin/env node

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);

const CATALOG_PATH = path.join(__dirname, "..", "public", "idlix-data", "catalog.json");
const HERO_CACHE_PATH = path.join(__dirname, "..", "public", "idlix-data", "hero-cache.json");
const IDLIX_BASE = "https://z2.idlixku.com";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36";

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

async function fetchWithLogo(item) {
  if (!item.backdropPath) return null;
  
  const endpoint = item.isSeries ? "series" : "movies";
  const url = `${IDLIX_BASE}/api/${endpoint}/${item.slug}`;
  
  try {
    const detail = await curlGet(url);
    if (!detail || detail.error) return null;
    
    const logo = detail.logoPath || null;
    if (logo) {
      return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        releaseDate: item.releaseDate,
        voteAverage: item.voteAverage,
        genres: item.genres || [],
        overview: item.overview || detail.overview || "",
        isSeries: item.isSeries,
        logo: logo,
      };
    }
  } catch (err) {
    log(`  Failed to fetch ${item.slug}: ${err.message}`);
  }
  return null;
}

async function cacheHeroItems() {
  log("Starting hero cache generation...");
  
  const catalog = loadCatalog();
  if (!catalog.items || catalog.items.length === 0) {
    log("No items in catalog, skipping hero cache");
    return;
  }
  
  // Get candidates: top 80 popular items with backdrop
  const candidates = catalog.items
    .filter(it => it.backdropPath)
    .sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0))
    .slice(0, 80);
  
  log(`Checking ${candidates.length} candidates for TMDB logos...`);
  
  const heroItems = [];
  let checked = 0;
  
  for (const item of candidates) {
    if (heroItems.length >= 25) break;
    
    const enriched = await fetchWithLogo(item);
    checked++;
    
    if (enriched) {
      heroItems.push(enriched);
      process.stdout.write(`\r  Found ${heroItems.length}/25 hero items (checked ${checked}/${candidates.length})`);
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log();
  
  if (heroItems.length === 0) {
    log("No hero items found with logos, using fallback");
    const fallback = candidates.slice(0, 10).map(it => ({
      id: it.id,
      slug: it.slug,
      title: it.title,
      posterPath: it.posterPath,
      backdropPath: it.backdropPath,
      releaseDate: it.releaseDate,
      voteAverage: it.voteAverage,
      genres: it.genres || [],
      overview: it.overview || "",
      isSeries: it.isSeries,
      logo: null,
    }));
    heroItems.push(...fallback);
  }
  
  const cacheData = {
    items: heroItems,
    cachedAt: new Date().toISOString(),
  };
  
  const dir = path.dirname(HERO_CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(HERO_CACHE_PATH, JSON.stringify(cacheData, null, 2), "utf8");
  log(`✅ Hero cache updated: ${heroItems.length} items saved to ${HERO_CACHE_PATH}`);
}

cacheHeroItems().catch((err) => {
  log(`❌ Hero cache failed: ${err.message}`);
  process.exit(1);
});
