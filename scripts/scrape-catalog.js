#!/usr/bin/env node

/**
 * Catalog Scraper — IDLIX + NgeFilm (Indonesia)
 * 
 * Fetches all movies/series from IDLIX, enriches with detail data,
 * scrapes ALL Indonesian films & series from NgeFilm, enriches them
 * with TMDB (logo + backdrop), and merges everything into catalog.json.
 * 
 * No localhost / running server required — works standalone (cron/Docker).
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

// NgeFilm (Indonesian content)
const NGEFILM_BASE = "https://new39.ngefilm.site";
const NGEFILM_MAX_PAGES = 60;
const NGEFILM_PAGE_DELAY_MS = 250;

// TMDB enrichment for NgeFilm items
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_ENRICH_CONCURRENCY = 5;
const TMDB_ENRICH_DELAY_MS = 300;

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
// HTML fetch (NgeFilm) — follows redirects, reports HTTP status
// ============================================================
async function curlHtml(url, retries = MAX_RETRIES) {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-sL", "-A", DESKTOP_UA,
      "--max-time", "25",
      "-w", "\n%{http_code}",
      url,
    ], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });

    const statusMatch = stdout.match(/\n(\d{3})\n?$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    const idx = stdout.lastIndexOf("\n" + status);
    const body = idx > 0 ? stdout.slice(0, idx) : stdout;
    return { status, body };
  } catch (err) {
    if (retries > 0) {
      await sleep(RETRY_DELAY_MS);
      return curlHtml(url, retries - 1);
    }
    throw err;
  }
}

// ============================================================
// TMDB helpers — token from env or .env.local (Docker has no .env.local)
// ============================================================
let _tmdbToken;
function getTmdbToken() {
  if (_tmdbToken !== undefined) return _tmdbToken;
  _tmdbToken = "";
  try {
    if (process.env.TMDB_API_TOKEN && process.env.TMDB_API_TOKEN.trim()) {
      _tmdbToken = process.env.TMDB_API_TOKEN.trim();
    } else {
      const envPath = path.join(__dirname, "..", ".env.local");
      if (fs.existsSync(envPath)) {
        const m = fs.readFileSync(envPath, "utf8").match(/^\s*TMDB_API_TOKEN\s*=\s*(.+?)\s*$/m);
        if (m) _tmdbToken = m[1].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // ignore — enrichment will be skipped
  }
  return _tmdbToken;
}

// Returns parsed JSON, null on 404, throws after retries on other failures.
async function tmdbGet(urlPath, retries = MAX_RETRIES) {
  const token = getTmdbToken();
  if (!token) throw new Error("TMDB_API_TOKEN not set");
  if (retries <= 0) throw new Error(`TMDB failed: ${TMDB_API}${urlPath}`);

  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-H", `Authorization: Bearer ${token}`,
      "-H", "Accept: application/json",
      "--max-time", "20",
      "-w", "\n%{http_code}",
      `${TMDB_API}${urlPath}`,
    ], { timeout: 25000, maxBuffer: 4 * 1024 * 1024 });

    const statusMatch = stdout.match(/\n(\d{3})\n?$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    const idx = stdout.lastIndexOf("\n" + status);
    const body = idx > 0 ? stdout.slice(0, idx) : stdout;

    if (status === 404) return null;
    if (status !== 200) {
      await sleep(status === 429 ? 1500 : RETRY_DELAY_MS);
      return tmdbGet(urlPath, retries - 1);
    }
    return JSON.parse(body);
  } catch {
    await sleep(RETRY_DELAY_MS);
    return tmdbGet(urlPath, retries - 1);
  }
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
    source: "idlix",
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
// STEP 4: NgeFilm (Indonesia) — scrape listing + TMDB enrichment
// ============================================================

// TMDB genre id -> English name (must match IDLIX genre names/slugs)
const GENRE_ID_MAP = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics",
};

function genreSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeTitle(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function titlesMatch(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = new Set(na.split(" "));
  const wordsB = nb.split(" ");
  const overlap = wordsB.filter((w) => wordsA.has(w)).length;
  return overlap >= Math.ceil(wordsB.length * 0.6);
}

function extractNgefilmListing(html) {
  const items = [];
  const cards = html.match(/<article[\s\S]*?<\/article>/gi) || [];
  for (const card of cards) {
    const link = card.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
    const img = card.match(/<img[^>]*src="([^"]+)"/i);
    const titleMatch = card.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    let title = "";
    if (titleMatch) {
      const inner = titleMatch[1];
      const aText = inner.match(/<a[^>]*>([^<]+)<\/a>/i);
      title = aText?.[1]?.trim() || inner.replace(/<[^>]+>/g, "").trim();
    }
    if (!title) {
      const aTitle = card.match(/<a[^>]*title="Permalink ke:\s*([^"]+)"/i);
      title = aTitle?.[1]?.trim() || "";
    }
    if (!title) {
      const imgAlt = card.match(/<img[^>]*alt="([^"]+)"/i);
      title = imgAlt?.[1]?.trim() || "";
    }
    const quality = card.match(/class="[^"]*quality[^"]*"[^>]*>([^<]+)/i);
    if (!title || !link?.[1]) continue;
    items.push({
      title,
      url: link[1],
      poster: img?.[1] || "",
      isSeries: link[1].includes("/tv/"),
      quality: quality?.[1]?.trim() || "",
    });
  }
  return items;
}

function slugFromNgefilmUrl(url) {
  const parts = String(url).split("?")[0].split("#")[0].split("/").filter(Boolean);
  return parts.pop() || "";
}

// Walk pagination until HTTP 404 / empty page / no new items.
async function fetchNgefilmPages(urlFor) {
  const items = [];
  const seen = new Set();
  for (let page = 1; page <= NGEFILM_MAX_PAGES; page++) {
    let res;
    try {
      res = await curlHtml(urlFor(page));
    } catch (err) {
      console.log(`\n   ⚠ page ${page} failed: ${err.message}`);
      break;
    }
    if (res.status !== 200) {
      console.log(`\n   ⏹ page ${page} -> HTTP ${res.status} (done)`);
      break;
    }
    const listing = extractNgefilmListing(res.body);
    if (listing.length === 0) {
      console.log(`\n   ⏹ page ${page} -> no cards (done)`);
      break;
    }
    let added = 0;
    for (const raw of listing) {
      const slug = slugFromNgefilmUrl(raw.url);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      items.push({ ...raw, slug });
      added++;
    }
    process.stdout.write(`\r   page ${page}: ${items.length} items`);
    if (added === 0) {
      console.log(`\n   ⏹ page ${page} -> no new items (done)`);
      break;
    }
    await sleep(NGEFILM_PAGE_DELAY_MS);
  }
  console.log();
  return items;
}

async function fetchAllNgefilm() {
  console.log("🇮🇩 Scraping NgeFilm Indonesia — movies...");
  const films = await fetchNgefilmPages((p) =>
    p === 1
      ? `${NGEFILM_BASE}/country/indonesia/`
      : `${NGEFILM_BASE}/country/indonesia/page/${p}/`
  );
  console.log(`   ✅ ${films.length} movies`);

  console.log("🇮🇩 Scraping NgeFilm Indonesia — series...");
  const seriesBase = `${NGEFILM_BASE}/?s=&search=advanced&post_type=tv&country=indonesia`;
  const series = await fetchNgefilmPages((p) =>
    p === 1
      ? seriesBase
      : `${NGEFILM_BASE}/page/${p}/?s=&search=advanced&post_type=tv&country=indonesia`
  );
  console.log(`   ✅ ${series.length} series`);

  // Dedupe across lists: movie wins slug collisions
  const seen = new Set();
  const merged = [];
  for (const raw of [...films, ...series]) {
    if (seen.has(raw.slug)) continue;
    seen.add(raw.slug);
    merged.push(raw);
  }
  return merged;
}

function ngefilmToCatalogItem(raw) {
  let title = raw.title;
  const yearMatch = title.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : "";
  title = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();

  const isSeries = raw.isSeries;
  return {
    id: raw.slug,
    slug: raw.slug,
    title,
    posterPath: raw.poster || null,
    backdropPath: raw.poster || null,
    releaseDate: year,
    voteAverage: "0",
    country: "ID",
    runtime: null,
    genres: [],
    overview: "",
    contentType: isSeries ? "tv_series" : "movie",
    isSeries,
    numberOfSeasons: isSeries ? 1 : undefined,
    quality: raw.quality || "",
    popularityScore: 0,
    viewCount: 0,
    cast: [],
    director: null,
    tagline: null,
    status: null,
    productionCompanies: [],
    networks: [],
    voteCount: 0,
    source: "ngefilm",
    _year: year, // stripped before writing the catalog
  };
}

// Reuse TMDB enrichment already stored in the previous catalog run.
function carryNgefilmEnrichment(target, old) {
  if (!old || old.tmdbLogoPath === undefined) return; // never attempted -> retry
  target.tmdbLogoPath = old.tmdbLogoPath;
  target.tmdbBackdropPath = old.tmdbBackdropPath === undefined ? null : old.tmdbBackdropPath;
  if (old.overview) target.overview = old.overview;
  if (Array.isArray(old.genres) && old.genres.length > 0) target.genres = old.genres;
  if (old.voteAverage && old.voteAverage !== "0") target.voteAverage = old.voteAverage;
  if (old.voteCount) target.voteCount = old.voteCount;
  if (old.releaseDate) target.releaseDate = old.releaseDate;
  if (old.runtime) target.runtime = old.runtime;
  if (old.tagline) target.tagline = old.tagline;
  if (old.status) target.status = old.status;
  if (old.numberOfSeasons) target.numberOfSeasons = old.numberOfSeasons;
  if (typeof old.posterPath === "string" && old.posterPath.startsWith("/")) target.posterPath = old.posterPath;
  if (typeof old.backdropPath === "string" && old.backdropPath.startsWith("/")) target.backdropPath = old.backdropPath;
}

// Returns true when enrichment is definitively done (matched or no match),
// false when it failed transiently and should be retried next run.
async function tmdbEnrichNgefilmItem(item) {
  const isSeries = item.isSeries;
  const year = item._year || "";
  const searchPath = isSeries
    ? `/search/tv?query=${encodeURIComponent(item.title)}${year ? `&first_air_date_year=${year}` : ""}`
    : `/search/movie?query=${encodeURIComponent(item.title)}${year ? `&year=${year}` : ""}`;

  let search;
  try {
    search = await tmdbGet(searchPath);
  } catch {
    return false;
  }

  const results = (search && search.results) || [];
  if (results.length === 0) {
    item.tmdbLogoPath = null;
    item.tmdbBackdropPath = null;
    return true;
  }

  const pick = (r) => (isSeries ? r.name || r.original_name || "" : r.title || r.original_title || "");
  const rYear = (r) => String(isSeries ? r.first_air_date || "" : r.release_date || "").slice(0, 4);
  let match = results.find(
    (r) => titlesMatch(item.title, pick(r)) && (!year || !rYear(r) || Math.abs(Number(rYear(r)) - Number(year)) <= 1)
  );
  if (!match) match = results.find((r) => titlesMatch(item.title, pick(r)));
  if (!match) {
    item.tmdbLogoPath = null;
    item.tmdbBackdropPath = null;
    return true;
  }

  let detail;
  try {
    detail = await tmdbGet(
      `/${isSeries ? "tv" : "movie"}/${match.id}?language=id-ID&append_to_response=images&include_image_language=en,null`
    );
  } catch {
    return false;
  }
  if (!detail) {
    item.tmdbLogoPath = null;
    item.tmdbBackdropPath = null;
    return true;
  }

  const logos = (detail.images && detail.images.logos) || [];
  const enLogo = logos.find((l) => l.iso_639_1 === "en");
  const anyLogo = logos.find((l) => l.iso_639_1 === null) || logos[0];
  item.tmdbLogoPath = enLogo?.file_path || anyLogo?.file_path || null;
  item.tmdbBackdropPath =
    detail.backdrop_path ||
    (detail.images && detail.images.backdrops && detail.images.backdrops[0]?.file_path) ||
    null;

  if (detail.poster_path) item.posterPath = detail.poster_path;
  if (item.tmdbBackdropPath) item.backdropPath = item.tmdbBackdropPath;
  // Indonesian overview first, English (from search results) as fallback
  const searchOverview = match.overview || "";
  if (detail.overview || searchOverview) item.overview = detail.overview || searchOverview;
  if (Array.isArray(detail.genres) && detail.genres.length > 0) {
    item.genres = detail.genres.map((g) => {
      const name = GENRE_ID_MAP[g.id] || g.name;
      return { id: String(g.id), name, slug: genreSlug(name) };
    });
  }
  if (typeof detail.vote_average === "number" && detail.vote_average > 0) {
    item.voteAverage = detail.vote_average.toFixed(2);
  }
  if (detail.vote_count) item.voteCount = detail.vote_count;
  const date = isSeries ? detail.first_air_date : detail.release_date;
  if (date) item.releaseDate = date;
  if (!isSeries && detail.runtime) item.runtime = detail.runtime;
  if (isSeries && detail.number_of_seasons) item.numberOfSeasons = detail.number_of_seasons;
  if (detail.tagline) item.tagline = detail.tagline;
  if (detail.status) item.status = detail.status;
  return true;
}

async function enrichNgefilmItems(items) {
  if (!getTmdbToken()) {
    console.log("⚠ TMDB_API_TOKEN not set — skipping NgeFilm TMDB enrichment\n");
    return;
  }
  const needs = items.filter((it) => it.tmdbLogoPath === undefined);
  if (needs.length === 0) {
    console.log("✅ NgeFilm items already TMDB-enriched\n");
    return;
  }

  console.log(`🔍 TMDB-enriching ${needs.length} NgeFilm items (logo + backdrop + genres)...`);
  let done = 0;
  let matched = 0;
  let deferred = 0;

  for (let i = 0; i < needs.length; i += TMDB_ENRICH_CONCURRENCY) {
    const batch = needs.slice(i, i + TMDB_ENRICH_CONCURRENCY);
    const results = await Promise.all(
      batch.map((it) => tmdbEnrichNgefilmItem(it).catch(() => false))
    );
    for (const ok of results) {
      done++;
      if (ok) matched++;
      else deferred++;
    }
    const pct = Math.round((done / needs.length) * 100);
    process.stdout.write(
      `\r   ${done}/${needs.length} (${pct}%) — ${matched} done, ${deferred} retry next run`
    );
    if (i + TMDB_ENRICH_CONCURRENCY < needs.length) await sleep(TMDB_ENRICH_DELAY_MS);
  }

  const withLogo = items.filter((it) => it.tmdbLogoPath).length;
  console.log(`\n   ✅ TMDB enrichment complete (${withLogo} items have a logo)\n`);
}

// ============================================================
// STEP 5: Merge with existing catalog
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
  console.log("  Catalog Scraper (IDLIX + NgeFilm)");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : FRESH_MODE ? "FRESH (replace)" : "MERGE"}`);
  console.log("========================================\n");

  // Load existing catalog, split by source so IDLIX logic stays untouched
  const existing = FRESH_MODE ? { items: [], total: 0, scrapedAt: "" } : loadExistingCatalog();
  const existingIdlix = existing.items.filter((it) => it.source !== "ngefilm");
  const existingNgefilm = existing.items.filter((it) => it.source === "ngefilm");
  if (!FRESH_MODE) {
    console.log(
      `📂 Existing catalog: ${existing.items.length} items (IDLIX ${existingIdlix.length} + NgeFilm ${existingNgefilm.length}, scraped: ${existing.scrapedAt})\n`
    );
  }

  // ---- Phase 1: IDLIX ----
  const browseItems = await fetchAllItems();
  const newCatalogItems = browseItems.map(browseToCatalogItem);

  // Enrich items missing data
  if (DRY_RUN) {
    console.log("⏭ Skipping IDLIX enrichment in dry-run mode\n");
  } else if (!FRESH_MODE) {
    // In merge mode, only enrich items that are new or missing data
    const itemsToEnrich = newCatalogItems.filter((newItem) => {
      const oldItem = existingIdlix.find((it) => it.slug === newItem.slug);
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

  // Merge or replace (IDLIX only)
  let resultItems;
  let stats = { added: 0, updated: 0, removed: 0 };

  if (FRESH_MODE) {
    resultItems = newCatalogItems;
    stats = { added: newCatalogItems.length, updated: 0, removed: existingIdlix.length };
  } else {
    const mergeResult = mergeCatalogs(existingIdlix, newCatalogItems);
    resultItems = mergeResult.merged;
    stats = { added: mergeResult.added, updated: mergeResult.updated, removed: mergeResult.removed };
  }
  console.log(
    `🧩 IDLIX merged: ${stats.added} added, ${stats.updated} updated, ${stats.removed} removed (total ${resultItems.length})\n`
  );

  // ---- Phase 2: NgeFilm (all Indonesian films & series) ----
  let freshNgefilm = [];
  try {
    freshNgefilm = await fetchAllNgefilm();
  } catch (err) {
    console.log(`   ⚠ NgeFilm scrape failed: ${err.message}`);
  }

  if (freshNgefilm.length > 0) {
    const idlixSlugs = new Set(resultItems.map((it) => it.slug));
    const existingNgefilmMap = new Map(existingNgefilm.map((it) => [it.slug, it]));
    const ngefilmItems = [];
    const seen = new Set();

    for (const raw of freshNgefilm) {
      const item = ngefilmToCatalogItem(raw);
      if (!item.slug || seen.has(item.slug)) continue;
      if (idlixSlugs.has(item.slug)) continue; // IDLIX wins slug collisions
      seen.add(item.slug);
      carryNgefilmEnrichment(item, existingNgefilmMap.get(item.slug));
      ngefilmItems.push(item);
    }

    if (DRY_RUN) {
      console.log("⏭ Skipping NgeFilm TMDB enrichment in dry-run mode\n");
    } else {
      await enrichNgefilmItems(ngefilmItems);
    }

    const ngefilmStats = {
      added: ngefilmItems.filter((it) => !existingNgefilmMap.has(it.slug)).length,
      updated: ngefilmItems.filter((it) => existingNgefilmMap.has(it.slug)).length,
      removed: existingNgefilm.filter((it) => !seen.has(it.slug)).length,
    };

    for (const it of ngefilmItems) delete it._year;
    resultItems = [...resultItems, ...ngefilmItems];

    stats.added += ngefilmStats.added;
    stats.updated += ngefilmStats.updated;
    stats.removed += ngefilmStats.removed;
    console.log(
      `🧩 NgeFilm merged: ${ngefilmStats.added} added, ${ngefilmStats.updated} updated, ${ngefilmStats.removed} removed (total ${ngefilmItems.length})\n`
    );
  } else if (existingNgefilm.length > 0) {
    console.log("   ⚠ NgeFilm returned no items — keeping existing NgeFilm entries\n");
    resultItems = [...resultItems, ...existingNgefilm];
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
  const idlixCount = resultItems.filter((it) => it.source !== "ngefilm").length;
  const ngefilmCount = resultItems.length - idlixCount;
  const withLogo = resultItems.filter((it) => it.tmdbLogoPath).length;

  console.log("========================================");
  console.log("  ✅ Scraping complete!");
  console.log(`  Added:   ${stats.added} items`);
  console.log(`  Updated: ${stats.updated} items`);
  console.log(`  Removed: ${stats.removed} items`);
  console.log(`  Total:   ${catalog.total} items (IDLIX ${idlixCount} + NgeFilm ${ngefilmCount})`);
  console.log(`  NgeFilm with TMDB logo: ${withLogo}`);
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
