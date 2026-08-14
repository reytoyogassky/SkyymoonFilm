import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import type { MovieDetail } from "./types";

const execFileAsync = promisify(execFile);

export const IDLIX_BASE = "https://z2.idlixku.com";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36";

const JAR_DIR = path.join(process.cwd(), ".cache");
const JAR = path.join(JAR_DIR, "cookies.txt");

let cookieReady: Promise<void> | null = null;

async function ensureCookies(): Promise<void> {
  if (cookieReady) return cookieReady;
  cookieReady = (async () => {
    await fs.mkdir(JAR_DIR, { recursive: true });
    await runCurl(["-s", "-c", JAR, "-H", `User-Agent: ${DESKTOP_UA}`, `${IDLIX_BASE}/`]);
  })();
  return cookieReady;
}

async function runCurl(args: string[]): Promise<{ status: number; body: string }> {
  try {
    const { stdout } = await execFileAsync("curl", args, {
      timeout: 30000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const idx = stdout.lastIndexOf("\n");
    const code = stdout.slice(idx + 1).trim();
    if (/^\d{3}$/.test(code)) {
      return { status: Number(code), body: stdout.slice(0, idx) };
    }
    return { status: 200, body: stdout };
  } catch (err) {
    const code = String((err as { code?: unknown })?.code ?? "");
    return { status: /^\d{3}$/.test(code) ? Number(code) : 0, body: "" };
  }
}

async function curlWithRetry(args: string[], json = true): Promise<{ status: number; body: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await runCurl(args);
    const challenged =
      res.status === 403 ||
      res.status === 0 ||
      (json && (res.body.includes("Just a moment") || res.body.trimStart().startsWith("<!DOCTYPE html>")));
    if (!challenged) return res;
    cookieReady = null;
    await ensureCookies();
  }
  return { status: 403, body: "{}" };
}

function baseArgs(): string[] {
  return ["-s", "-b", JAR, "-c", JAR, "-H", `User-Agent: ${DESKTOP_UA}`];
}

export type Json = { [key: string]: unknown };

export async function idlixGet(pathname: string, referer: string): Promise<Json> {
  await ensureCookies();
  const args = [
    ...baseArgs(),
    "-H",
    "Accept: application/json",
    "-H",
    `Referer: ${referer}`,
    "-w",
    "\n%{http_code}",
    `${IDLIX_BASE}${pathname}`,
  ];
  const res = await curlWithRetry(args);
  if (res.status !== 200) throw new Error(`IDLIX GET ${pathname} -> ${res.status}`);
  return JSON.parse(res.body);
}

export async function idlixPost(pathname: string, referer: string, body: unknown): Promise<Json> {
  await ensureCookies();
  const bodyFile = path.join(JAR_DIR, "body.json");
  await fs.writeFile(bodyFile, JSON.stringify(body), "utf8");
  const args = [
    ...baseArgs(),
    "-X",
    "POST",
    "-H",
    "Accept: application/json",
    "-H",
    "Content-Type: application/json",
    "-H",
    `Origin: ${IDLIX_BASE}`,
    "-H",
    `Referer: ${referer}`,
    "-H",
    "Sec-Fetch-Dest: empty",
    "-H",
    "Sec-Fetch-Mode: cors",
    "-H",
    "Sec-Fetch-Site: same-origin",
    "--data-binary",
    `@${bodyFile}`,
    "-w",
    "\n%{http_code}",
    `${IDLIX_BASE}${pathname}`,
  ];
  const res = await curlWithRetry(args);
  if (res.status !== 200) throw new Error(`IDLIX POST ${pathname} -> ${res.status} ${res.body.slice(0, 200)}`);
  return JSON.parse(res.body);
}

export async function redeemClaim(redeemUrl: string, claim: string): Promise<Json> {
  const res = await fetch(redeemUrl, {
    method: "POST",
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "text/plain",
      origin: IDLIX_BASE,
      referer: `${IDLIX_BASE}/`,
      "sec-ch-ua": '"Not/A)Brand";v="99", "Chromium";v="148"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      "user-agent": MOBILE_UA,
    },
    body: JSON.stringify({ claim }),
  });
  if (!res.ok) throw new Error(`majorplay redeem -> ${res.status}`);
  return res.json();
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
  return first || idlixPlaceholder(seed, kind);
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
        return { id: String(o.id ?? ""), name: String(o.name ?? "") };
      }),
    contentType: isSeries ? "tv" : "movie",
    isSeries,
    numberOfSeasons: Number(it.numberOfSeasons ?? 0),
    overview: String(it.overview ?? ""),
  };
}

const browseCache = new Map<string, { data: IdlixBrowseItem[]; at: number }>();

export async function idlixBrowseList(
  sort: "popular" | "latest",
  page = 1,
  limit = 24
): Promise<IdlixBrowseItem[]> {
  const key = `${sort}|${page}|${limit}`;
  const hit = browseCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;

  const data = await idlixGet(
    `/api/browse?page=${page}&limit=${limit}&sort=${sort}`,
    `${IDLIX_BASE}/browse?sort=${sort}`
  );
  const items = Array.isArray(data.data) ? (data.data as Json[]) : [];
  const result = items.map(mapBrowseItem).filter((x): x is IdlixBrowseItem => x !== null);
  browseCache.set(key, { data: result, at: Date.now() });
  return result;
}

const detailCache = new Map<string, { data: Json; contentType: "movie" | "tv"; at: number }>();

export async function idlixDetail(
  slug: string
): Promise<{ data: Json; contentType: "movie" | "tv" }> {
  const hit = detailCache.get(slug);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit;

  let contentType: "movie" | "tv" = "movie";
  let data: Json;
  try {
    data = await idlixGet(`/api/movies/${slug}`, `${IDLIX_BASE}/movie/${slug}`);
    if (String(data.error ?? "").includes("not found")) throw new Error("not found");
  } catch {
    data = await idlixGet(`/api/series/${slug}`, `${IDLIX_BASE}/series/${slug}`);
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
          (Array.isArray(data.createdBy) ? (data.createdBy[0] as Json)?.name : "") ?? ""
        )
      : String(data.director ?? ""),
    genres: (Array.isArray(data.genres) ? data.genres : [])
      .slice(0, 4)
      .map((g) => {
        const o = g as Json;
        return { id: String(o.id ?? ""), name: String(o.name ?? "") };
      }),
    cast: (Array.isArray(data.cast) ? data.cast : [])
      .slice(0, 14)
      .map((c) => {
        const o = c as Json;
        return {
          id: String(o.id ?? ""),
          name: String(o.name ?? ""),
          character: String(o.character ?? ""),
          profilePath: String(o.profilePath ?? ""),
        };
      }),
    contentType: isSeries ? "tv" : "movie",
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

  const referer = `${IDLIX_BASE}/series/${idlixSlug}`;
  const detail = await idlixGet(`/api/series/${idlixSlug}`, referer);

  const rawSeasons = (Array.isArray(detail.seasons) ? detail.seasons : []) as {
    id: string; seasonNumber: number; name: string; posterPath?: string;
  }[];

  const result: IdlixSeason[] = [];
  
  for (const s of rawSeasons) {
    let episodes: IdlixEpisode[] = [];
    
    try {
      const seasonData = (await idlixGet(
        `/api/series/${idlixSlug}/season/${s.seasonNumber}`,
        referer
      )) as {
        season?: { episodes?: unknown };
      };
      const rawEpisodes = seasonData.season?.episodes;
      if (Array.isArray(rawEpisodes)) {
        episodes = rawEpisodes as IdlixEpisode[];
      }
    } catch (err) {
      console.error(`Failed to fetch season ${s.seasonNumber} episodes:`, (err as Error).message);
    }
    
    result.push({
      id: s.id,
      seasonNumber: s.seasonNumber,
      name: s.name,
      posterPath: s.posterPath ?? "",
      episodes: episodes.filter((e) => e.hasVideo !== false),
    });
  }

  result.sort((a, b) => a.seasonNumber - b.seasonNumber);
  tvEpisodesCache.set(idlixSlug, { data: result, at: Date.now() });
  return result;
}

const streamCache = new Map<string, StreamInfo>();
const inFlight = new Map<string, Promise<StreamInfo>>();

const slugCache = new Map<string, { slug: string | null; at: number }>();

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    const data = await idlixGet(
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

export async function getMovieStream(slug: string, force = false): Promise<StreamInfo> {
  const cached = streamCache.get(slug);
  if (!force && cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached;

  if (!force) {
    const pending = inFlight.get(slug);
    if (pending) return pending;
  }

  const task = (async (): Promise<StreamInfo> => {
    const referer = `${IDLIX_BASE}/movie/${slug}`;

    const detail = await idlixGet(`/api/movies/${slug}`, referer);
    const uuid = typeof detail?.id === "string" ? detail.id : undefined;
    if (!uuid) throw new Error("movie UUID not found");

    const playInfo = await idlixGet(`/api/watch/play-info/movie/${uuid}`, referer);
    if (playInfo.kind !== "gate") throw new Error(`unexpected play-info kind: ${String(playInfo.kind)}`);

    // Poll claim instead of blindly sleeping: server reports exact remainingMs,
    // so we can retry right at unlock time without clock-skew guesswork.
    const gateToken = typeof playInfo.gateToken === "string" ? playInfo.gateToken : "";
    let claim = await idlixPost("/api/watch/session/claim", referer, { gateToken });
    for (let attempt = 0; claim?.kind === "pending" && attempt < 4; attempt++) {
      const remaining = Math.max(0, Number(claim.remainingMs ?? 0));
      await new Promise((r) => setTimeout(r, Math.min(remaining + 150, 20000)));
      claim = await idlixPost("/api/watch/session/claim", referer, { gateToken });
    }
    if (claim?.kind === "pending") throw new Error("gate did not unlock");

    const claimJwt = typeof claim?.claim === "string" ? claim.claim : "";
    const redeemUrl = typeof claim?.redeemUrl === "string" ? claim.redeemUrl : "";
    if (!claimJwt || !redeemUrl) throw new Error("claim failed");

    const play = await redeemClaim(redeemUrl, claimJwt);
    if (play.code !== "ok" || typeof play.url !== "string")
      throw new Error(`redeem failed: ${String(play.code ?? "unknown")}`);

    const playSubs = Array.isArray(play.subtitles) ? play.subtitles : [];
    const subtitles: Subtitle[] = playSubs.map((s) => {
      const o = s as Json;
      return {
        lang: typeof o.lang === "string" ? o.lang : "",
        label: typeof o.label === "string" ? o.label : "",
        url: typeof o.path === "string" ? o.path : "",
      };
    });

    const info: StreamInfo = {
      streamUrl: play.url,
      expiresAt: (Number(play.expiresAt ?? 0) || Math.floor(Date.now() / 1000) + 7200) * 1000,
      videoId:
        (typeof play.videoId === "string" ? play.videoId : undefined) ??
        (typeof claim.videoId === "string" ? claim.videoId : undefined),
      title: typeof claim.title === "string" ? claim.title : undefined,
      durationSec: typeof claim.durationSec === "number" ? claim.durationSec : undefined,
      maxHeight:
        (typeof play.maxHeight === "number" ? play.maxHeight : undefined) ??
        (typeof claim.maxHeight === "number" ? claim.maxHeight : undefined),
      subtitles,
    };
    streamCache.set(slug, info);
    return info;
  })();

  inFlight.set(slug, task);
  try {
    return await task;
  } finally {
    inFlight.delete(slug);
  }
}

const tvStreamCache = new Map<string, StreamInfo>();
const tvInFlight = new Map<string, Promise<StreamInfo>>();

export async function getTvStream(slug: string, force = false, episodeId?: string): Promise<StreamInfo> {
  const cacheKey = episodeId ? `ep::${episodeId}` : `series::${slug}`;
  const cached = tvStreamCache.get(cacheKey);
  if (!force && cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached;

  if (!force) {
    const pending = tvInFlight.get(cacheKey);
    if (pending) return pending;
  }

  const task = (async (): Promise<StreamInfo> => {
    const referer = `${IDLIX_BASE}/series/${slug}`;
    let targetEpisodeId = episodeId;

    if (!targetEpisodeId) {
      // No specific episode — use defaultSeason's first available episode
      const detail = await idlixGet(`/api/series/${slug}`, referer);
      if (!detail?.id) throw new Error("TV series tidak ditemukan di IDLIX");
      interface EpisodeEntry { id: string; hasVideo?: boolean }
      const defaultSeason = detail.defaultSeason as { episodes?: EpisodeEntry[] } | undefined;
      const eps = (defaultSeason?.episodes ?? []) as EpisodeEntry[];
      const firstEp = eps.find((e) => e.hasVideo !== false) ?? eps[0];
      if (!firstEp?.id) throw new Error("Tidak ada episode tersedia untuk series ini");
      targetEpisodeId = firstEp.id;
    }

    let playInfo: Json | null = null;
    for (const apiPath of [
      `/api/watch/play-info/episode/${targetEpisodeId}`,
      `/api/watch/play-info/tv-episode/${targetEpisodeId}`,
      `/api/watch/play-info/series-episode/${targetEpisodeId}`,
    ]) {
      try {
        const res = await idlixGet(apiPath, referer);
        if (res?.kind) { playInfo = res; break; }
      } catch { /* try next */ }
    }
    if (!playInfo?.kind) throw new Error("TV episode play-info tidak tersedia");
    if (playInfo.kind !== "gate") throw new Error(`unexpected play-info kind: ${String(playInfo.kind)}`);

    const gateToken = typeof playInfo.gateToken === "string" ? playInfo.gateToken : "";
    let claim = await idlixPost("/api/watch/session/claim", referer, { gateToken });
    for (let attempt = 0; claim?.kind === "pending" && attempt < 4; attempt++) {
      const remaining = Math.max(0, Number(claim.remainingMs ?? 0));
      await new Promise((r) => setTimeout(r, Math.min(remaining + 150, 20000)));
      claim = await idlixPost("/api/watch/session/claim", referer, { gateToken });
    }
    if (claim?.kind === "pending") throw new Error("gate did not unlock");

    const claimJwt = typeof claim?.claim === "string" ? claim.claim : "";
    const redeemUrl = typeof claim?.redeemUrl === "string" ? claim.redeemUrl : "";
    if (!claimJwt || !redeemUrl) throw new Error("claim failed");

    const play = await redeemClaim(redeemUrl, claimJwt);
    if (play.code !== "ok" || typeof play.url !== "string")
      throw new Error(`redeem failed: ${String(play.code ?? "unknown")}`);

    const playSubs = Array.isArray(play.subtitles) ? play.subtitles : [];
    const subtitles: Subtitle[] = playSubs.map((s) => {
      const o = s as Json;
      return {
        lang: typeof o.lang === "string" ? o.lang : "",
        label: typeof o.label === "string" ? o.label : "",
        url: typeof o.path === "string" ? o.path : "",
      };
    });

    const info: StreamInfo = {
      streamUrl: play.url,
      expiresAt: (Number(play.expiresAt ?? 0) || Math.floor(Date.now() / 1000) + 7200) * 1000,
      videoId:
        (typeof play.videoId === "string" ? play.videoId : undefined) ??
        (typeof claim.videoId === "string" ? claim.videoId : undefined),
      title: typeof claim.title === "string" ? claim.title : undefined,
      durationSec: typeof claim.durationSec === "number" ? claim.durationSec : undefined,
      maxHeight:
        (typeof play.maxHeight === "number" ? play.maxHeight : undefined) ??
        (typeof claim.maxHeight === "number" ? claim.maxHeight : undefined),
      subtitles,
    };
    tvStreamCache.set(cacheKey, info);
    return info;
  })();

  tvInFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    tvInFlight.delete(cacheKey);
  }
}