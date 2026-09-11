import {
  loadCatalog,
  idlixBrowseList,
  idlixSearch,
  idlixDetail,
  getIdlixDetailInfo,
  getIdlixTvEpisodes,
  type IdlixBrowseItem,
  type IdlixSeason,
  type BrowseFilters,
} from "./idlix";
import { ngefilmBrowse, ngefilmDetail, ngefilmSearch } from "./ngefilm";
import type { MovieDetail, MovieListItem } from "./types";
import { getTmdbEnriched, enrichByTitle, type TmdbEnriched, type TmdbCast, type TmdbCrew, type TmdbVideo, type TmdbSimilar } from "./tmdb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentSource = "idlix" | "ngefilm" | "all";

export interface CatalogBrowseParams {
  sort: "popular" | "latest";
  page: number;
  limit: number;
  genre?: string;
  country?: string;
  mediaType?: "movie" | "tv" | "all";
  source?: ContentSource;
}

export interface CatalogBrowseResult {
  items: MovieListItem[];
  total: number;
  totalPages: number;
  sources: ContentSource[];
}

export interface CatalogSearchParams {
  query: string;
  page: number;
  mediaType?: "movie" | "tv" | "all";
  source?: ContentSource;
}

export interface CatalogSearchResult {
  items: MovieListItem[];
  total: number;
}

export interface GenreInfo {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export interface CountryInfo {
  code: string;
  name: string;
  count: number;
}

export interface CatalogStats {
  catalogTotal: number;
  movies: number;
  series: number;
  genres: GenreInfo[];
  countries: CountryInfo[];
}

export interface DetailPayload {
  movie: MovieDetail;
  videos: { name: string; key: string; site: string; type: string }[];
  languages: string[];
  certification: string;
  _source?: "idlix" | "ngefilm";
  _pageUrl?: string;
  _episodes?: { number: string; title: string; url: string }[];
  // TMDB enrichment
  tmdb?: {
    tagline: string;
    voteAverage: number;
    voteCount: number;
    status: string;
    originalLanguage: string;
    budget: number;
    revenue: number;
    productionCompanies: { id: number; name: string; logo_path: string | null }[];
    cast: TmdbCast[];
    crew: TmdbCrew[];
    directors: TmdbCrew[];
    videos: TmdbVideo[];
    similar: TmdbSimilar[];
    numberOfSeasons?: number;
    numberOfEpisodes?: number;
    logoPath: string | null;
  };
}

// ---------------------------------------------------------------------------
// NgeFilm → MovieListItem (canonical mapping, single source of truth)
// ---------------------------------------------------------------------------

interface NgeFilmRawItem {
  title: string;
  url: string;
  poster: string;
  type: string;
  rating: string;
  quality: string;
  info: string;
}

export function ngefilmItemToMovieListItem(item: NgeFilmRawItem): MovieListItem {
  const slug = (item.url || "").split("/").filter(Boolean).pop() || "";
  const isSeries = item.type === "series";
  return {
    id: item.url,
    title: item.title || slug.replace(/-/g, " "),
    slug,
    posterPath: item.poster,
    backdropPath: item.poster,
    releaseDate: item.info || "",
    voteAverage: String(parseFloat(item.rating) || 0),
    quality: item.quality || "",
    country: "ID",
    runtime: 0,
    genres: [],
    hasVideo: true,
    isSeries,
    source: "ngefilm",
  };
}

function idlixBrowseItemToMovieListItem(item: IdlixBrowseItem): MovieListItem {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    releaseDate: item.releaseDate,
    voteAverage: item.voteAverage,
    quality: item.quality,
    country: item.country,
    runtime: item.runtime,
    genres: item.genres,
    hasVideo: true,
    isSeries: item.isSeries,
    overview: item.overview,
    source: "idlix",
  };
}

// ---------------------------------------------------------------------------
// catalogBrowse - unified browse merging both providers
// ---------------------------------------------------------------------------

export async function catalogBrowse(params: CatalogBrowseParams): Promise<CatalogBrowseResult> {
  const {
    sort,
    page,
    limit,
    genre,
    country,
    mediaType = "all",
    source = "all",
  } = params;

  const sources: ContentSource[] = [];
  let idlixItems: MovieListItem[] = [];
  let ngefilmItems: MovieListItem[] = [];
  let idlixTotal = 0;
  let idlixTotalPages = 0;

  // Fetch IDLIX
  if (source === "idlix" || source === "all") {
    try {
      const filters: BrowseFilters = { genre, country, mediaType };
      const result = await idlixBrowseList(sort, page, limit, filters);
      idlixItems = result.items.map(idlixBrowseItemToMovieListItem);
      idlixTotal = result.total;
      idlixTotalPages = result.totalPages;
      sources.push("idlix");
    } catch {
      // IDLIX failure is non-fatal when NgeFilm is also available
    }
  }

  // Fetch NgeFilm (only when applicable)
  // NgeFilm doesn't support genre/country filtering (only Indonesia content)
  const ngefilmApplicable =
    (source === "ngefilm" || source === "all") &&
    !genre &&
    (!country || country === "ID");

  if (ngefilmApplicable) {
    try {
      const ngefilmType =
        mediaType === "movie" ? "film" : mediaType === "tv" ? "series" : "all";
      const rawItems = await ngefilmBrowse(page, ngefilmType);
      ngefilmItems = rawItems.map(ngefilmItemToMovieListItem);
      sources.push("ngefilm");
    } catch {
      // NgeFilm failure is non-fatal
    }
  }

  // Merge: IDLIX first, NgeFilm appended (deduplicate by slug)
  const seen = new Set<string>();
  const merged: MovieListItem[] = [];

  for (const item of [...idlixItems, ...ngefilmItems]) {
    if (seen.has(item.slug)) continue;
    seen.add(item.slug);
    merged.push(item);
  }

  const total = idlixTotal || merged.length;
  const totalPages = idlixTotalPages || Math.max(1, Math.ceil(merged.length / limit));

  return { items: merged, total, totalPages, sources };
}

// ---------------------------------------------------------------------------
// catalogSearch - unified search
// ---------------------------------------------------------------------------

export async function catalogSearch(params: CatalogSearchParams): Promise<CatalogSearchResult> {
  const { query, page, mediaType = "all", source = "all" } = params;

  if (!query.trim()) return { items: [], total: 0 };

  const results: MovieListItem[] = [];

  if (source === "idlix" || source === "all") {
    try {
      const idlixResults = await idlixSearch(query.trim(), page, mediaType);
      results.push(...idlixResults.map(idlixBrowseItemToMovieListItem));
    } catch {}
  }

  if (source === "ngefilm" || source === "all") {
    try {
      const ngefilmResults = await ngefilmSearch(query.trim());
      const mapped = ngefilmResults
        .filter(i => {
          const url = (i.url || "").toLowerCase();
          if (mediaType === "movie" && i.type !== "film") return false;
          if (mediaType === "tv" && i.type !== "series") return false;
          if (url.includes("/tv/") || url.includes("country/indonesia") || url.includes("negara/indonesia")) return true;
          if (i.info && /indonesia|indo|id/i.test(i.info)) return true;
          return true;
        })
        .map(ngefilmItemToMovieListItem);
      results.push(...mapped);
    } catch {}
  }

  const queryLower = query.trim().toLowerCase();
  const sorted = results.sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();
    
    const aExact = aTitle === queryLower;
    const bExact = bTitle === queryLower;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    const aStarts = aTitle.startsWith(queryLower);
    const bStarts = bTitle.startsWith(queryLower);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    const aIndex = aTitle.indexOf(queryLower);
    const bIndex = bTitle.indexOf(queryLower);
    if (aIndex !== -1 && bIndex === -1) return -1;
    if (aIndex === -1 && bIndex !== -1) return 1;
    if (aIndex !== -1 && bIndex !== -1 && aIndex !== bIndex) return aIndex - bIndex;
    
    return aTitle.localeCompare(bTitle);
  });

  return { items: sorted, total: sorted.length };
}

// ---------------------------------------------------------------------------
// catalogDetail - IDLIX first, NgeFilm fallback
// ---------------------------------------------------------------------------

const NGEFILM_BASE = "https://new39.ngefilm.site";

function ngefilmMetaToMovieDetail(
  meta: Record<string, string>,
  slug: string
): MovieDetail {
  const isSeries =
    meta.title?.toLowerCase().includes("series") ||
    meta.title?.toLowerCase().includes("episode") ||
    false;
  return {
    id: slug,
    slug,
    title: meta.title || "",
    posterPath: meta.poster || "",
    backdropPath: meta.poster || "",
    releaseDate: meta.year || meta.release || "",
    voteAverage: "",
    runtime: 0,
    quality: meta.quality || "",
    country: meta.country || "Indonesia",
    overview: meta.description || "",
    director: meta.director || "",
    genres: (meta.genre || "")
      .split(",")
      .map((g: string) => ({ id: g.trim(), name: g.trim() }))
      .filter((g) => g.name),
    cast: [],
    contentType: isSeries ? "tv" : "movie",
    isSeries,
    numberOfSeasons: 0,
  };
}

// Merge TMDB data into base payload
function applyTmdbEnrichment(payload: DetailPayload, tmdb: TmdbEnriched): DetailPayload {
  const movie = payload.movie;

  // Fill missing poster/backdrop from TMDB
  if (!movie.posterPath && tmdb.posterPath) movie.posterPath = tmdb.posterPath;
  if (!movie.backdropPath && tmdb.backdropPath) movie.backdropPath = tmdb.backdropPath;
  // Prefer TMDB images when provider only has low-quality ones
  if (tmdb.posterPath && !movie.posterPath.startsWith("/")) movie.posterPath = tmdb.posterPath;
  if (tmdb.backdropPath && !movie.backdropPath.startsWith("/")) movie.backdropPath = tmdb.backdropPath;

  // Fill missing fields
  if (!movie.overview && tmdb.overview) movie.overview = tmdb.overview;
  if (!movie.runtime && tmdb.runtime) movie.runtime = tmdb.runtime;
  if (!movie.voteAverage && tmdb.voteAverage) movie.voteAverage = tmdb.voteAverage.toFixed(1);
  if (!movie.releaseDate && tmdb.releaseDate) movie.releaseDate = tmdb.releaseDate;
  if (!movie.director && tmdb.directors.length > 0) movie.director = tmdb.directors.map(d => d.name).join(", ");

  // Enrich cast from TMDB (more complete with profile photos)
  if (tmdb.cast.length > movie.cast.length) {
    movie.cast = tmdb.cast.slice(0, 15).map(c => ({
      id: String(c.id),
      name: c.name,
      character: c.character,
      profilePath: c.profile_path,
    }));
  }

  // Enrich genres from TMDB if missing
  if (movie.genres.length === 0 && tmdb.genres.length > 0) {
    movie.genres = tmdb.genres.map(g => ({ id: String(g.id), name: g.name }));
  }

  // Certification
  if (!payload.certification && tmdb.certification) {
    payload.certification = tmdb.certification;
  }

  // Videos (trailers)
  if (payload.videos.length === 0 && tmdb.videos.length > 0) {
    payload.videos = tmdb.videos.map(v => ({
      name: v.name,
      key: v.key,
      site: v.site,
      type: v.type,
    }));
  }

  // TMDB enrichment block for the frontend
  payload.tmdb = {
    tagline: tmdb.tagline,
    voteAverage: tmdb.voteAverage,
    voteCount: tmdb.voteCount,
    status: tmdb.status,
    originalLanguage: tmdb.originalLanguage,
    budget: tmdb.budget,
    revenue: tmdb.revenue,
    productionCompanies: tmdb.productionCompanies,
    cast: tmdb.cast.slice(0, 20),
    crew: tmdb.crew,
    directors: tmdb.directors,
    videos: tmdb.videos,
    similar: tmdb.similar,
    numberOfSeasons: tmdb.numberOfSeasons,
    numberOfEpisodes: tmdb.numberOfEpisodes,
    logoPath: tmdb.logoPath,
  };

  return payload;
}

export async function catalogDetail(slug: string): Promise<DetailPayload> {
  let payload: DetailPayload | null = null;

  // Try IDLIX first
  try {
    const info = await getIdlixDetailInfo(slug);
    payload = {
      movie: info.movie,
      videos: [],
      languages: [],
      certification: "",
      _source: "idlix",
    };
  } catch {
    // Fall through to NgeFilm
  }

  // NgeFilm fallback: try movie URL, then TV URL
  if (!payload) {
    let detail = await ngefilmDetail(`${NGEFILM_BASE}/${slug}/`);
    let pageUrl = `${NGEFILM_BASE}/${slug}/`;

    if (!detail?.metadata?.title) {
      detail = await ngefilmDetail(`${NGEFILM_BASE}/tv/${slug}/`);
      pageUrl = `${NGEFILM_BASE}/tv/${slug}/`;
    }

    if (detail?.metadata?.title) {
      const movie = ngefilmMetaToMovieDetail(detail.metadata, slug);
      const isTv = movie.isSeries || detail.episodes.length > 1;
      movie.contentType = isTv ? "tv" : "movie";
      movie.isSeries = isTv;

      payload = {
        movie,
        videos: [],
        languages: [],
        certification: "",
        _source: "ngefilm",
        _pageUrl: pageUrl,
        _episodes: detail.episodes,
      };
    }
  }

  if (!payload) throw new Error("not found");

  // Enrich with TMDB (non-blocking — if TMDB fails, return base data)
  try {
    const mediaType = payload.movie.contentType === "tv" ? "tv" as const : "movie" as const;

    // Try to find TMDB match: first by ID in cast/genre (TMDB IDs from Idlix), then by title search
    let tmdbData: TmdbEnriched | null = null;

    // If we have a numeric ID that looks like a TMDB ID
    const numId = parseInt(payload.movie.id);
    if (numId > 1000) {
      try {
        tmdbData = await getTmdbEnriched(numId, mediaType);
      } catch {
        // Not a TMDB ID, fall through
      }
    }

    // Fallback: search by title
    if (!tmdbData) {
      const year = payload.movie.releaseDate?.slice(0, 4);
      tmdbData = await enrichByTitle(payload.movie.title, year, mediaType);
    }

    if (tmdbData) {
      payload = applyTmdbEnrichment(payload, tmdbData);
    }
  } catch {
    // TMDB enrichment is optional — return base data
  }

  return payload;
}

// ---------------------------------------------------------------------------
// catalogEpisodes - TV episode list
// ---------------------------------------------------------------------------

export async function catalogEpisodes(slug: string): Promise<IdlixSeason[]> {
  return getIdlixTvEpisodes(slug);
}

// ---------------------------------------------------------------------------
// catalogStats - full catalog genre/country analysis
// ---------------------------------------------------------------------------

const COUNTRY_NAMES: Record<string, string> = {
  US: "USA", KR: "Korea", JP: "Jepang", GB: "Inggris",
  CN: "China", CA: "Kanada", FR: "Prancis", TH: "Thailand",
  IN: "India", DE: "Jerman", ES: "Spanyol", AU: "Australia",
  PH: "Filipina", MY: "Malaysia", IT: "Italia", HK: "Hong Kong",
  MX: "Meksiko", BR: "Brasil", TW: "Taiwan", TR: "Turki",
  ID: "Indonesia", AR: "Argentina", SE: "Swedia", DK: "Denmark",
  SG: "Singapura", NZ: "Selandia Baru", BE: "Belgia", PL: "Polandia",
  ZA: "Afrika Selatan", NO: "Norwegia", RU: "Rusia",
};

let _statsCache: { data: CatalogStats; at: number } | null = null;

export function catalogStats(): CatalogStats {
  if (_statsCache && Date.now() - _statsCache.at < 10 * 60 * 1000) {
    return _statsCache.data;
  }

  const cat = loadCatalog();
  const genreMap = new Map<string, GenreInfo>();
  const countryMap = new Map<string, number>();
  let movies = 0;
  let series = 0;

  for (const item of cat.items) {
    item.isSeries ? series++ : movies++;

    for (const g of item.genres || []) {
      const slug = (g.slug || g.name).toLowerCase().replace(/\s+/g, "-");
      const existing = genreMap.get(slug);
      if (existing) {
        existing.count++;
      } else {
        genreMap.set(slug, {
          id: String(g.id || slug),
          name: g.name,
          slug,
          count: 1,
        });
      }
    }

    const c = (item.country || "").trim();
    if (c) countryMap.set(c, (countryMap.get(c) || 0) + 1);
  }

  const stats: CatalogStats = {
    catalogTotal: cat.items.length,
    movies,
    series,
    genres: [...genreMap.values()].sort((a, b) => b.count - a.count),
    countries: [...countryMap.entries()]
      .map(([code, count]) => ({
        code,
        name: COUNTRY_NAMES[code] || code,
        count,
      }))
      .sort((a, b) => b.count - a.count),
  };

  _statsCache = { data: stats, at: Date.now() };
  return stats;
}
