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

async function fetchWithLogoViaAPI(item) {
  if (!item.posterPath && !item.backdropPath) return null;
  
  try {
    // Use localhost API route that handles both IDLIX and NgeFilm
    const url = `http://localhost:3000/api/catalog/${item.slug}`;
    const { stdout } = await execFileAsync("curl", [
      "-s", "-A", DESKTOP_UA,
      "--max-time", "20",
      url,
    ], { timeout: 25000, maxBuffer: 4 * 1024 * 1024 });
    
    const data = JSON.parse(stdout);
    if (!data || data.error) return null;
    
    const logo = data.tmdb?.logoPath || data.movie?.logoPath || null;
    const backdrop = data.tmdb?.backdropPath || item.backdropPath || item.posterPath;
    
    if (logo && backdrop) {
      return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: backdrop,
        releaseDate: item.releaseDate,
        voteAverage: item.voteAverage,
        genres: item.genres || [],
        overview: data.movie?.overview || item.overview || "",
        isSeries: item.isSeries,
        logo: logo,
      };
    }
  } catch (err) {
    // Ignore - server might not be running
  }
  return null;
}

async function fetchWithLogo(item) {
  if (!item.backdropPath && !item.posterPath) return null;
  
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
        backdropPath: item.backdropPath || item.posterPath,
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

const NGEFILM_BASE = "https://new39.ngefilm.site";

async function fetchNgeFilmPage(url) {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-A", DESKTOP_UA,
      "--max-time", "15",
      url,
    ], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  } catch {
    return "";
  }
}

function extractNgeFilmItems(html) {
  const items = [];
  const cards = html.match(/<article[\s\S]*?<\/article>/gi) || [];
  
  for (const card of cards.slice(0, 10)) {
    const link = card.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
    const img = card.match(/<img[^>]*src="([^"]+)"/i);
    const titleMatch = card.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    
    let title = '';
    if (titleMatch) {
      const inner = titleMatch[1];
      const aText = inner.match(/<a[^>]*>([^<]+)<\/a>/i);
      title = aText?.[1]?.trim() || inner.replace(/<[^>]+>/g, '').trim();
    }
    
    if (!link?.[1] || !title) continue;
    
    const slug = link[1].split('/').filter(Boolean).pop() || '';
    const isSeries = link[1].includes('/tv/');
    
    items.push({
      id: slug,
      slug: slug,
      title: title,
      posterPath: img?.[1] || null,
      backdropPath: img?.[1] || null,
      releaseDate: new Date().toISOString().split('T')[0],
      voteAverage: "0",
      genres: [],
      overview: "",
      isSeries: isSeries,
      popularityScore: 100,
    });
  }
  
  return items;
}

async function fetchNgeFilm(type) {
  try {
    log(`  Fetching NgeFilm ${type}...`);
    let url;
    if (type === "movie") {
      url = `${NGEFILM_BASE}/country/indonesia/page/1/`;
    } else {
      url = `${NGEFILM_BASE}/?s=&search=advanced&post_type=tv&country=indonesia`;
    }
    
    const html = await fetchNgeFilmPage(url);
    return extractNgeFilmItems(html);
  } catch (err) {
    log(`  Failed to fetch NgeFilm ${type}: ${err.message}`);
    return [];
  }
}

async function cacheHeroItems() {
  log("Starting hero cache generation...");
  
  const catalog = loadCatalog();
  if (!catalog.items || catalog.items.length === 0) {
    log("No items in catalog, skipping hero cache");
    return;
  }
  
  // Get candidates: IDLIX + NgeFilm
  const idlixCandidates = catalog.items
    .filter(it => it.backdropPath)
    .sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0))
    .slice(0, 50);
  
  log("Fetching NgeFilm items...");
  const ngefilmMovies = await fetchNgeFilm("movie");
  const ngefilmSeries = await fetchNgeFilm("tv");
  
  const allCandidates = [
    ...idlixCandidates,
    ...ngefilmMovies,
    ...ngefilmSeries,
  ];
  
  // Shuffle for variety
  const shuffled = allCandidates.sort(() => Math.random() - 0.5);
  
  log(`Checking ${shuffled.length} candidates for TMDB logos...`);
  
  const heroItems = [];
  let checked = 0;
  
  // Check all items via API route (handles both IDLIX and NgeFilm with TMDB enrichment)
  log("Trying API route first (requires server running)...");
  let apiWorking = false;
  
  // Test if API is available
  try {
    await execFileAsync("curl", ["-s", "--max-time", "3", "http://localhost:3000/api/catalog/stats"], { timeout: 5000 });
    apiWorking = true;
    log("API server detected, using /api/catalog for enrichment");
  } catch {
    log("API server not running, falling back to direct IDLIX API");
  }
  
  for (const item of shuffled) {
    if (heroItems.length >= 30) break;
    
    let enriched = null;
    
    // Try API route first if server is running
    if (apiWorking) {
      enriched = await fetchWithLogoViaAPI(item);
    }
    
    // Fallback to direct IDLIX API (for IDLIX items only)
    if (!enriched && item.popularityScore !== 100) {
      enriched = await fetchWithLogo(item);
    }
    
    checked++;
    
    if (enriched) {
      heroItems.push(enriched);
      process.stdout.write(`\r  Found ${heroItems.length}/30 items with TMDB logos (checked ${checked}/${shuffled.length})`);
    }
    
    await new Promise(r => setTimeout(r, apiWorking ? 200 : 100));
  }
  
  console.log();
  
  if (heroItems.length === 0) {
    log("No hero items found with logos, using fallback");
    const fallback = allCandidates.slice(0, 10).map(it => ({
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
    items: heroItems.slice(0, 25),
    cachedAt: new Date().toISOString(),
  };
  
  const dir = path.dirname(HERO_CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(HERO_CACHE_PATH, JSON.stringify(cacheData, null, 2), "utf8");
  log(`✅ Hero cache updated: ${heroItems.length} items (all with TMDB logos) saved to ${HERO_CACHE_PATH}`);
}

cacheHeroItems().catch((err) => {
  log(`❌ Hero cache failed: ${err.message}`);
  process.exit(1);
});
