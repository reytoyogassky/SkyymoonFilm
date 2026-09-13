import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync, mkdtempSync, unlinkSync, rmdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { MovieDetail } from "./types";

const execFileAsync = promisify(execFile);

export const IDLIX_BASE = "https://z2.idlixku.com";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36";

export type Json = { [key: string]: unknown };

// ==== Local JSON catalog loader ====
export interface CatalogItem {
  id: string;
  slug: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  voteAverage: string | number;
  country: string;
  runtime: number;
  genres: { id?: string; name: string; slug?: string }[];
  overview: string;
  contentType: string;
  isSeries: boolean;
  numberOfSeasons: number;
  cast?: { id?: string; name: string; character: string; profilePath: string | null }[];
  director?: string;
  tagline?: string;
  status?: string;
  productionCompanies?: { id?: number; name: string; logoPath?: string | null }[];
  networks?: { id?: number; name: string; logoPath?: string | null }[];
  voteCount?: number;
  seasons?: {
    id: string;
    seasonNumber: number;
    name: string;
    overview: string;
    posterPath: string | null;
    airDate: string;
    episodeCount: number;
    episodes: {
      id: string;
      episodeNumber: number;
      name: string;
      overview: string;
      stillPath: string | null;
      airDate: string;
      runtime: number;
      voteAverage: string;
    }[];
  }[];
}

export interface CatalogData {
  items: CatalogItem[];
  total: number;
  scrapedAt: string;
}

let _catalog: CatalogData | null = null;
let _catalogLoadedAt = 0;
export function loadCatalog(): CatalogData {
  // Reload every 5 minutes to pick up enrichment updates
  if (_catalog && Date.now() - _catalogLoadedAt < 5 * 60 * 1000) return _catalog;
  try {
    const path = join(process.cwd(), "public", "idlix-data", "catalog.json");
    if (!existsSync(path)) {
      _catalog = { items: [], total: 0, scrapedAt: "" };
      _catalogLoadedAt = Date.now();
      return _catalog;
    }
    _catalog = JSON.parse(readFileSync(path, "utf8")) as CatalogData;
    _catalogLoadedAt = Date.now();
  } catch {
    _catalog = { items: [], total: 0, scrapedAt: "" };
    _catalogLoadedAt = Date.now();
  }
  return _catalog;
}

interface ScraperResult {
  streamUrl: string;
  expiresAt: number;
  videoId?: string;
  title?: string;
  maxHeight?: number;
  subtitles: { lang: string; label: string; url: string }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function curlGet(url: string, referer: string): Promise<Json | null> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-A", DESKTOP_UA,
      "-H", "Accept: application/json",
      "-H", `Referer: ${referer}`,
      "-w", "\n%{http_code}",
      "--max-time", "20",
      url,
    ], { timeout: 25000, maxBuffer: 4 * 1024 * 1024 });
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

async function curlPost(url: string, data: unknown, referer: string, useMobileUA = false): Promise<Json | null> {
  try {
    const ua = useMobileUA ? MOBILE_UA : DESKTOP_UA;
    const headers: string[] = [
      "-s", "-A", ua,
      "-H", "Accept: */*",
      "-H", `Referer: ${referer}`,
      "-H", `Origin: ${IDLIX_BASE}`,
      "-X", "POST",
      "-w", "\n%{http_code}",
      "--max-time", "20",
    ];
    if (useMobileUA) {
      headers.push("-H", "Content-Type: text/plain");
      headers.push("-d", JSON.stringify(data));
      headers.push("-H", 'sec-ch-ua: "Not/A)Brand";v="99", "Chromium";v="148"');
      headers.push("-H", "sec-ch-ua-mobile: ?1");
      headers.push("-H", 'sec-ch-ua-platform: "Android"');
      headers.push("-H", "sec-fetch-dest: empty");
      headers.push("-H", "sec-fetch-mode: cors");
      headers.push("-H", "sec-fetch-site: cross-site");
    } else {
      headers.push("-H", "Content-Type: application/json");
      headers.push("-d", JSON.stringify(data));
    }
    headers.push(url);
    const { stdout } = await execFileAsync("curl", headers, {
      timeout: 25000,
      maxBuffer: 4 * 1024 * 1024,
    });
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

// Cookie-jar aware curl helpers for streaming (session must persist across requests)
async function curlWithCookies(
  method: "GET" | "POST",
  url: string,
  referer: string,
  cookieJar: string,
  body?: unknown,
  useMobileUA = false
): Promise<Json | null> {
  try {
    const ua = useMobileUA ? MOBILE_UA : DESKTOP_UA;
    const args: string[] = [
      "-s", "-A", ua,
      "-H", "Accept: */*",
      "-H", `Referer: ${referer}`,
      "-c", cookieJar,
      "-b", cookieJar,
      "-w", "\n%{http_code}",
      "--max-time", "20",
    ];
    if (method === "POST") {
      args.push("-H", `Origin: ${IDLIX_BASE}`, "-X", "POST");
      if (useMobileUA) {
        args.push("-H", "Content-Type: text/plain");
        args.push("-H", 'sec-ch-ua: "Not/A)Brand";v="99", "Chromium";v="148"');
        args.push("-H", "sec-ch-ua-mobile: ?1");
        args.push("-H", 'sec-ch-ua-platform: "Android"');
        args.push("-H", "sec-fetch-dest: empty");
        args.push("-H", "sec-fetch-mode: cors");
        args.push("-H", "sec-fetch-site: cross-site");
      } else {
        args.push("-H", "Content-Type: application/json");
      }
      args.push("-d", JSON.stringify(body ?? {}));
    }
    args.push(url);
    const { stdout } = await execFileAsync("curl", args, {
      timeout: 25000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const statusMatch = stdout.match(/\n(\d{3})\n?$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    if (status !== 200) return null;
    const idx = stdout.lastIndexOf("\n" + status);
    const body2 = idx > 0 ? stdout.slice(0, idx) : stdout;
    return JSON.parse(body2);
  } catch {
    return null;
  }
}

function makeCookieJar(): string {
  const dir = mkdtempSync(join(tmpdir(), "idlix-"));
  return join(dir, "cookies.txt");
}

function cleanupCookieJar(path: string) {
  try { unlinkSync(path); } catch { /* ignore */ }
  try { rmdirSync(join(path, "..")); } catch { /* ignore */ }
}

async function getGateAndRedeem(
  playInfoPath: string,
  referer: string
): Promise<ScraperResult | null> {
  const jar = makeCookieJar();
  try {
    // Step 1: Get play-info (gate token)
    const pi = await curlWithCookies("GET", `${IDLIX_BASE}${playInfoPath}`, referer, jar);
    if (!pi || pi.kind !== "gate") return null;

    const gt = String(pi.gateToken ?? "");
    const unlockAt = Number(pi.unlockAt ?? 0);
    const waitMs = Math.max(0, unlockAt - Date.now()) + 300;

    // Step 2: Wait for gate unlock
    if (waitMs > 0) {
      await sleep(Math.min(waitMs, 15000));
    }

    // Step 3: Claim session (same cookie jar to maintain session)
    let claim = await curlWithCookies(
      "POST",
      `${IDLIX_BASE}/api/watch/session/claim`,
      referer,
      jar,
      { gateToken: gt }
    ) as Json | null;

    for (let i = 0; i < 4; i++) {
      if (!claim || claim.kind !== "pending") break;
      const remaining = Number(claim.remainingMs ?? 0);
      await sleep(Math.min((Math.max(0, remaining) + 200), 5000));
      claim = await curlWithCookies(
        "POST",
        `${IDLIX_BASE}/api/watch/session/claim`,
        referer,
        jar,
        { gateToken: gt }
      );
    }

    if (!claim || !claim.claim || !claim.redeemUrl) return null;

    // Step 4: Redeem (uses mobile UA + cross-site headers)
    const play = await curlWithCookies(
      "POST",
      String(claim.redeemUrl),
      `${IDLIX_BASE}/`,
      jar,
      { claim: claim.claim },
      true
    );
    if (!play || play.code !== "ok" || !play.url) return null;

    return {
      streamUrl: String(play.url),
      expiresAt: (Number(play.expiresAt ?? 0) || Math.floor(Date.now() / 1000) + 7200) * 1000,
      videoId: play.videoId ? String(play.videoId) : undefined,
      maxHeight: play.maxHeight ? Number(play.maxHeight) : undefined,
      subtitles: (Array.isArray(play.subtitles) ? play.subtitles : [])
        .map((s: Json) => ({
          lang: String(s.lang ?? ""),
          label: String(s.label ?? ""),
          url: String(s.path ?? s.url ?? ""),
        }))
        .filter((s) => s.url && s.label),
    };
  } finally {
    cleanupCookieJar(jar);
  }
}

async function getMovieStreamDirect(slug: string): Promise<ScraperResult> {
  const referer = `${IDLIX_BASE}/movie/${slug}`;

  // Try local catalog first (avoids Cloudflare challenge on detail API)
  const catalog = loadCatalog();
  const catalogItem = catalog.items.find((it) => it.slug === slug && !it.isSeries);
  let uuid: string | undefined;
  let title: string | undefined;

  if (catalogItem?.id) {
    uuid = catalogItem.id;
    title = catalogItem.title;
  } else {
    // Fallback: fetch from API
    const detail = await curlGet(`${IDLIX_BASE}/api/movies/${slug}`, referer);
    if (!detail || !detail.id) throw new Error("movie not found");
    uuid = String(detail.id);
    title = detail.title ? String(detail.title) : undefined;
  }

  const result = await getGateAndRedeem(`/api/watch/play-info/movie/${uuid}`, referer);
  if (!result) throw new Error("no stream from scraper");
  result.title = title;
  return result;
}

async function getTvStreamDirect(slug: string, episodeId?: string): Promise<ScraperResult> {
  const referer = `${IDLIX_BASE}/series/${slug}`;

  if (!episodeId) {
    // Try catalog first for first episode ID
    const catalog = loadCatalog();
    const catalogItem = catalog.items.find((it) => it.slug === slug && it.isSeries);
    const firstSeason = catalogItem?.seasons?.find((s) => s.episodes?.length > 0);
    const firstEp = firstSeason?.episodes?.[0];

    if (firstEp?.id) {
      episodeId = String(firstEp.id);
    } else {
      // Fallback: fetch from API
      const detail = await curlGet(`${IDLIX_BASE}/api/series/${slug}`, referer);
      if (!detail || !detail.id) throw new Error("series not found");
      const ds = detail.defaultSeason as Json | undefined;
      const eps = (ds?.episodes ?? []) as Json[];
      const first = eps.find((e) => e.hasVideo !== false) ?? eps[0];
      if (!first) throw new Error("no episodes");
      episodeId = String(first.id);
    }
  }

  // Try multiple play-info paths
  for (const pathPrefix of [
    "/api/watch/play-info/episode/",
    "/api/watch/play-info/tv-episode/",
    "/api/watch/play-info/series-episode/",
  ]) {
    const result = await getGateAndRedeem(`${pathPrefix}${episodeId}`, referer);
    if (result) return result;
  }
  throw new Error("no stream from scraper");
}

export interface Subtitle {
  lang: string;
  label: string;
  url: string;
}

export interface StreamInfo {
  streamUrl: string;
  expiresAt: number;
  videoId?: string;
  title?: string;
  durationSec?: number;
  maxHeight?: number;
  subtitles: Subtitle[];
}

export interface IdlixBrowseItem {
  id: string;
  slug: string;
  title: string;
  posterPath: string;
  backdropPath: string;
  releaseDate: string;
  voteAverage: string;
  quality: string;
  country: string;
  runtime: number;
  genres: { id: string; name: string }[];
  contentType: "movie" | "tv";
  isSeries: boolean;
  numberOfSeasons: number;
  overview: string;
}

function idlixPlaceholder(seed: string, kind: "poster" | "backdrop"): string {
  return `/api/placeholder?seed=${encodeURIComponent(seed)}&kind=${kind}`;
}

function idlixImage(
  poster: string | null | undefined,
  backdrop: string | null | undefined,
  seed: string,
  kind: "poster" | "backdrop"
): string {
  const first = poster || backdrop || "";
  if (!first) return idlixPlaceholder(seed, kind);
  if (first.startsWith("http") || first.startsWith("/")) return first;
  return idlixPlaceholder(seed, kind);
}

function mapBrowseItem(it: Json): IdlixBrowseItem | null {
  if (typeof it.slug !== "string" || typeof it.title !== "string") return null;
  const ctype = String(it.contentType ?? "movie");
  const isSeries = ctype === "tv_series" || ctype === "series" || ctype === "tv";
  const vote = Number(it.voteAverage ?? 0);
  const seed = it.title;
  return {
    id: String(it.id ?? ""),
    slug: it.slug,
    title: it.title,
    posterPath: idlixImage(String(it.posterPath ?? ""), String(it.backdropPath ?? ""), seed, "poster"),
    backdropPath: idlixImage(String(it.backdropPath ?? ""), String(it.posterPath ?? ""), seed, "backdrop"),
    releaseDate: String(it.releaseDate ?? it.firstAirDate ?? ""),
    voteAverage: vote > 0 ? vote.toFixed(1) : "",
    quality: String(it.quality ?? ""),
    country: String(it.country ?? ""),
    runtime: Number(it.runtime ?? 0),
    genres: (Array.isArray(it.genres) ? it.genres : [])
      .slice(0, 3)
      .map((g) => {
        const o = g as Json;
        return { id: String(o.id ?? o.tmdbId ?? ""), name: String(o.name ?? "") };
      }),
    contentType: isSeries ? "tv" : "movie",
    isSeries,
    numberOfSeasons: Number(it.numberOfSeasons ?? 0),
    overview: String(it.overview ?? ""),
  };
}

// ==== IDLIX browse (katalog) - pakai curl, biasanya work ====
async function curl(args: string[]): Promise<{ status: number; body: string }> {
  try {
    const { stdout } = await execFileAsync("curl", args, {
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const statusMatch = stdout.match(/\n(\d{3})\n?$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    const idx = stdout.lastIndexOf("\n" + status);
    const body = idx > 0 ? stdout.slice(0, idx) : stdout;
    return { status, body };
  } catch {
    return { status: 0, body: "" };
  }
}

async function curlJson(method: "GET" | "POST", pathname: string, referer: string, body?: unknown): Promise<Json> {
  const baseArgs = [
    "-s",
    "-A", DESKTOP_UA,
    "-H", "Accept: application/json",
    "-H", `Referer: ${referer}`,
    "-w", "\n%{http_code}",
  ];
  let args: string[];
  if (method === "POST") {
    args = [
      ...baseArgs,
      "-H", "Content-Type: application/json",
      "-H", "Origin: " + IDLIX_BASE,
      "-X", "POST",
      "-d", body ? JSON.stringify(body) : "{}",
      `${IDLIX_BASE}${pathname}`,
    ];
  } else {
    args = [...baseArgs, `${IDLIX_BASE}${pathname}`];
  }
  const res = await curl(args);
  if (res.status !== 200) throw new Error(`IDLIX ${method} ${pathname} -> ${res.status}`);
  if (!res.body) return {};
  try { return JSON.parse(res.body); } catch { throw new Error("invalid JSON"); }
}

const browseCache = new Map<string, { data: IdlixBrowseItem[]; at: number }>();

function localItemToBrowseItem(it: CatalogItem): IdlixBrowseItem {
  const seed = it.title || it.slug;
  return {
    id: it.id,
    slug: it.slug,
    title: it.title,
    posterPath: idlixImage(it.posterPath || "", "", seed, "poster"),
    backdropPath: idlixImage(it.backdropPath || "", "", seed, "backdrop"),
    releaseDate: it.releaseDate,
    voteAverage: String(it.voteAverage || ""),
    quality: "",
    country: it.country,
    runtime: it.runtime,
    genres: (it.genres || []).slice(0, 3).map((g) => ({ id: g.id || g.name, name: g.name })),
    contentType: it.isSeries ? "tv" : "movie",
    isSeries: it.isSeries,
    numberOfSeasons: it.numberOfSeasons,
    overview: it.overview,
  };
}

export interface BrowseFilters {
  genre?: string;
  country?: string;
  mediaType?: "movie" | "tv" | "all";
}

export interface BrowseResult {
  items: IdlixBrowseItem[];
  total: number;
  totalPages: number;
}

const filteredBrowseCache = new Map<string, { data: BrowseResult; at: number }>();

export async function idlixBrowseList(
  sort: "popular" | "latest",
  page = 1,
  limit = 24,
  filters?: BrowseFilters
): Promise<BrowseResult> {
  const genre = filters?.genre || "";
  const country = filters?.country || "";
  const mediaType = filters?.mediaType || "all";
  const key = `${sort}|${page}|${limit}|${genre}|${country}|${mediaType}`;

  const hit = filteredBrowseCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;

  const cat = loadCatalog();
  let items = cat.items;

  // Server-side filtering
  if (mediaType === "movie") {
    items = items.filter((it) => !it.isSeries);
  } else if (mediaType === "tv") {
    items = items.filter((it) => it.isSeries);
  }

  if (genre) {
    items = items.filter((it) =>
      (it.genres || []).some((g) => {
        const gName = g.name.toLowerCase();
        const gSlug = (g.slug || g.name).toLowerCase().replace(/\s+/g, "-");
        return gName === genre.toLowerCase() || gSlug === genre.toLowerCase();
      })
    );
  }

  if (country) {
    const cf = country.toUpperCase();
    items = items.filter((it) => (it.country || "").toUpperCase() === cf);
  }

  if (sort === "latest") {
    items = [...items].sort((a, b) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));
  }

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pageItems = items.slice(start, start + limit).map(localItemToBrowseItem);

  const result: BrowseResult = { items: pageItems, total, totalPages };
  filteredBrowseCache.set(key, { data: result, at: Date.now() });
  return result;
}

const detailCache = new Map<string, { data: Json; contentType: "movie" | "tv"; at: number }>();

export async function idlixDetail(
  slug: string
): Promise<{ data: Json; contentType: "movie" | "tv" }> {
  const hit = detailCache.get(slug);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit;

  // Try local catalog first
  const cat = loadCatalog();
  const found = cat.items.find((it) => it.slug === slug);
  if (found) {
    const data: Json = {
      id: found.id,
      slug: found.slug,
      title: found.title,
      posterPath: found.posterPath,
      backdropPath: found.backdropPath,
      releaseDate: found.releaseDate,
      firstAirDate: found.releaseDate,
      voteAverage: found.voteAverage,
      quality: "",
      country: found.country,
      runtime: found.runtime,
      genres: found.genres,
      overview: found.overview,
      tagline: found.tagline,
      status: found.status,
      numberOfSeasons: found.numberOfSeasons,
      cast: found.cast,
      director: found.director,
      productionCompanies: found.productionCompanies,
      networks: found.networks,
      viewCount: found.voteCount,
    };
    const contentType: "movie" | "tv" = found.isSeries ? "tv" : "movie";
    detailCache.set(slug, { data, contentType, at: Date.now() });
    return { data, contentType };
  }

  // Fallback to API
  let contentType: "movie" | "tv" = "movie";
  let data: Json;
  try {
    data = await curlJson("GET", `/api/movies/${slug}`, `${IDLIX_BASE}/movie/${slug}`);
    if (String(data.error ?? "").includes("not found")) throw new Error("not found");
  } catch {
    data = await curlJson("GET", `/api/series/${slug}`, `${IDLIX_BASE}/series/${slug}`);
    contentType = "tv";
  }
  detailCache.set(slug, { data, contentType, at: Date.now() });
  return { data, contentType };
}

export interface IdlixDetailInfo {
  movie: MovieDetail;
  contentType: "movie" | "tv";
}

export async function getIdlixDetailInfo(slug: string): Promise<IdlixDetailInfo> {
  const { data, contentType } = await idlixDetail(slug);
  const isSeries = contentType === "tv";
  const vote = Number(data.voteAverage ?? 0);
  const title = String(data.title ?? "");
  const seed = title || slug;

  const movie: MovieDetail = {
    id: String(data.id ?? slug),
    slug,
    title,
    posterPath: idlixImage(
      String(data.posterPath ?? ""),
      String(data.backdropPath ?? ""),
      seed,
      "poster"
    ),
    backdropPath: idlixImage(
      String(data.backdropPath ?? ""),
      String(data.posterPath ?? ""),
      seed,
      "backdrop"
    ),
    releaseDate: String(data.releaseDate ?? data.firstAirDate ?? ""),
    voteAverage: vote > 0 ? vote.toFixed(1) : "",
    runtime: Number(data.runtime ?? 0),
    quality: String(data.quality ?? ""),
    country: String(data.country ?? ""),
    overview: String(data.overview ?? ""),
    director: isSeries
      ? String(
          (Array.isArray(data.createdBy) && data.createdBy[0]
            ? (data.createdBy[0] as Json).name
            : "") ?? ""
        )
      : "",
    genres: (Array.isArray(data.genres) ? data.genres : [])
      .slice(0, 3)
      .map((g) => {
        const o = g as Json;
        return { id: String(o.id ?? o.tmdbId ?? ""), name: String(o.name ?? "") };
      }),
    cast: (Array.isArray(data.cast) ? data.cast : []).slice(0, 12).map((c) => {
      const o = c as Json;
      return {
        id: String(o.id ?? o.tmdbPersonId ?? ""),
        name: String(o.name ?? ""),
        character: String(o.character ?? ""),
        profilePath: typeof o.profilePath === "string" ? o.profilePath : null,
      };
    }),
    contentType,
    isSeries,
    numberOfSeasons: Number(data.numberOfSeasons ?? 0),
  };
  return { movie, contentType };
}

export interface IdlixEpisode {
  id: string;
  episodeNumber: number;
  name: string;
  overview: string;
  stillPath: string;
  airDate: string;
  runtime: number;
  hasVideo: boolean;
  seasonNumber: number;
}

export interface IdlixSeason {
  id: string;
  seasonNumber: number;
  name: string;
  posterPath: string;
  episodes: IdlixEpisode[];
}

const tvEpisodesCache = new Map<string, { data: IdlixSeason[]; at: number }>();

export async function getIdlixTvEpisodes(idlixSlug: string): Promise<IdlixSeason[]> {
  const hit = tvEpisodesCache.get(idlixSlug);
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.data;

  // Try local catalog first
  const cat = loadCatalog();
  const found = cat.items.find((it) => it.slug === idlixSlug);
  if (found && found.seasons && found.seasons.length > 0) {
    const result: IdlixSeason[] = found.seasons.map((s) => ({
      id: s.id,
      seasonNumber: s.seasonNumber,
      name: s.name,
      posterPath: s.posterPath ?? "",
      episodes: s.episodes.map((ep) => ({
        id: ep.id,
        episodeNumber: ep.episodeNumber,
        name: ep.name,
        overview: ep.overview ?? "",
        stillPath: ep.stillPath ?? "",
        airDate: ep.airDate ?? "",
        runtime: ep.runtime ?? 0,
        hasVideo: true,
        seasonNumber: s.seasonNumber,
      })),
    }));
    result.sort((a, b) => a.seasonNumber - b.seasonNumber);
    tvEpisodesCache.set(idlixSlug, { data: result, at: Date.now() });
    return result;
  }

  // Fallback to API
  const referer = `${IDLIX_BASE}/series/${idlixSlug}`;
  const detail = await curlJson("GET", `/api/series/${idlixSlug}`, referer);

  const rawSeasons = (Array.isArray(detail.seasons) ? detail.seasons : []) as {
    id: string; seasonNumber: number; name: string; posterPath?: string;
  }[];

  const result: IdlixSeason[] = [];
  for (const s of rawSeasons) {
    let episodes: IdlixEpisode[] = [];
    try {
      const seasonData = (await curlJson(
        "GET",
        `/api/series/${idlixSlug}/season/${s.seasonNumber}`,
        referer
      )) as { season?: { episodes?: unknown } };
      const rawEpisodes = seasonData.season?.episodes;
      if (Array.isArray(rawEpisodes)) episodes = rawEpisodes as IdlixEpisode[];
    } catch {}
    result.push({
      id: s.id,
      seasonNumber: s.seasonNumber,
      name: s.name,
      posterPath: s.posterPath ?? "",
      episodes: episodes.filter((e) => e.hasVideo !== false),
    });
  }
  result.sort((a, b) => a.seasonNumber - b.seasonNumber);
  return result;
}

// ==== STREAM - pure Node.js (no Python) ====
const streamCache = new Map<string, StreamInfo>();
const inFlight = new Map<string, Promise<StreamInfo>>();

function evictCache() {
  if (streamCache.size > 200) {
    const keys = [...streamCache.keys()];
    for (let i = 0; i < 50; i++) streamCache.delete(keys[i]);
  }
}

function scraperToStreamInfo(s: ScraperResult): StreamInfo {
  return {
    streamUrl: s.streamUrl,
    expiresAt: s.expiresAt,
    videoId: s.videoId,
    title: s.title,
    maxHeight: s.maxHeight,
    subtitles: s.subtitles || [],
  };
}

function movieKey(slug: string) {
  return `movie::${slug}`;
}

function tvKey(slug: string, episodeId?: string) {
  return episodeId ? `ep::${episodeId}` : `series::${slug}`;
}

export function getCachedStream(slug: string, isTv: boolean, episodeId?: string): StreamInfo | null {
  const key = isTv ? tvKey(slug, episodeId) : movieKey(slug);
  const cached = streamCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached;
  return null;
}

function startScrapeStream(
  cacheKey: string,
  scraper: () => Promise<ScraperResult>
): Promise<StreamInfo> {
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const task: Promise<StreamInfo> = scraper()
    .then((s) => {
      if (!s || !s.streamUrl) throw new Error("no stream from scraper");
      const info = scraperToStreamInfo(s);
      streamCache.set(cacheKey, info);
      evictCache();
      return info;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, task);
  return task;
}

export function startMovieScrape(slug: string): void {
  const key = movieKey(slug);
  if (streamCache.has(key) && streamCache.get(key)!.expiresAt - Date.now() > 5 * 60 * 1000) return;
  startScrapeStream(key, () => getMovieStreamDirect(slug)).catch(() => {});
}

export function startTvScrape(slug: string, episodeId?: string): void {
  const key = tvKey(slug, episodeId);
  if (streamCache.has(key) && streamCache.get(key)!.expiresAt - Date.now() > 5 * 60 * 1000) return;
  startScrapeStream(key, () => getTvStreamDirect(slug, episodeId)).catch(() => {});
}

export async function getMovieStream(slug: string, force = false): Promise<StreamInfo> {
  const key = movieKey(slug);
  if (force) streamCache.delete(key);
  const cached = streamCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached;
  return startScrapeStream(key, () => getMovieStreamDirect(slug));
}

export async function getTvStream(slug: string, force = false, episodeId?: string): Promise<StreamInfo> {
  const key = tvKey(slug, episodeId);
  if (force) streamCache.delete(key);
  const cached = streamCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached;
  return startScrapeStream(key, () => getTvStreamDirect(slug, episodeId));
}

const slugCache = new Map<string, { slug: string | null; at: number }>();

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

async function findIdlixSlugByType(
  title: string,
  year: string | undefined,
  contentTypes: string[]
): Promise<string | null> {
  const key = `${normalizeTitle(title)}::${year ?? ""}::${contentTypes.join(",")}`;
  const hit = slugCache.get(key);
  if (hit && Date.now() - hit.at < 12 * 60 * 60 * 1000) return hit.slug;

  let slug: string | null = null;
  try {
    const data = await curlJson(
      "GET",
      `/api/search?q=${encodeURIComponent(title)}`,
      `${IDLIX_BASE}/search?q=${encodeURIComponent(title)}`
    );
    const results: Json[] = Array.isArray(data.results) ? (data.results as Json[]) : [];
    const filtered = results.filter(
      (r) =>
        contentTypes.includes(String(r.contentType)) &&
        typeof r.slug === "string" &&
        typeof r.title === "string"
    ) as { title: string; slug: string; releaseDate?: string; contentType?: string }[];

    const nt = normalizeTitle(title);
    let best = filtered.find((m) => normalizeTitle(m.title) === nt) ?? null;
    if (!best && year) {
      const years = [year, String(Number(year) + 1), String(Math.max(0, Number(year) - 1))];
      best =
        filtered.find(
          (m) => normalizeTitle(m.title) === nt && years.includes((m.releaseDate ?? "").slice(0, 4))
        ) ??
        filtered.find((m) => years.includes((m.releaseDate ?? "").slice(0, 4))) ??
        null;
    }
    slug = best ? best.slug : (filtered[0]?.slug ?? null);
  } catch {
    slug = null;
  }

  slugCache.set(key, { slug, at: Date.now() });
  return slug;
}

export async function findIdlixSlug(title: string, year?: string): Promise<string | null> {
  return findIdlixSlugByType(title, year, ["movie"]);
}

export async function findIdlixTvSlug(title: string, year?: string): Promise<string | null> {
  return findIdlixSlugByType(title, year, ["tv_series"]);
}

export async function idlixSearch(
  query: string,
  page = 1,
  mediaType: "movie" | "tv" | "all" = "all"
): Promise<IdlixBrowseItem[]> {
  try {
    const data = await curlJson(
      "GET",
      `/api/search?q=${encodeURIComponent(query)}&page=${page}`,
      `${IDLIX_BASE}/search?q=${encodeURIComponent(query)}`
    );
    const raw: Json[] = Array.isArray(data.results) ? (data.results as Json[]) : [];
    const mapped = raw
      .map((it) => mapBrowseItem(it))
      .filter((x): x is IdlixBrowseItem => x !== null);
    if (mediaType === "all") return mapped;
    return mapped.filter((it) => (mediaType === "tv" ? it.isSeries : !it.isSeries));
  } catch {
    return [];
  }
}

// Legacy exports - kept for API route compatibility
export async function idlixGet(pathname: string, referer: string): Promise<Json> {
  return curlJson("GET", pathname, referer);
}

export async function idlixPost(pathname: string, referer: string, body: unknown): Promise<Json> {
  return curlJson("POST", pathname, referer, body);
}

export async function redeemClaim(redeemUrl: string, claim: string): Promise<Json> {
  const result = await curlPost(redeemUrl, { claim }, `${IDLIX_BASE}/`, true);
  return (result ?? {}) as Json;
}
