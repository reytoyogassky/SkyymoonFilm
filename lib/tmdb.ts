import type { MovieDetail, MovieListItem } from "./types";

const BASE = "https://api.themoviedb.org/3";
const TOKEN = process.env.TMDB_API_TOKEN ?? "";

const cache = new Map<string, { at: number; data: unknown }>();

function cacheGet<T>(key: string, ttlMs: number): T | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  return null;
}

function cacheSet<T>(key: string, data: T) {
  if (cache.size > 400) cache.clear();
  cache.set(key, { at: Date.now(), data });
}

async function tmdbFetch<T>(path: string, ttlMs = 10 * 60 * 1000): Promise<T> {
  const cached = cacheGet<T>(path, ttlMs);
  if (cached) return cached;
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  const data = (await res.json()) as T;
  cacheSet(path, data);
  return data;
}

export const GENRE_NAMES: Record<number, string> = {
  28: "Aksi",
  12: "Petualangan",
  16: "Animasi",
  35: "Komedi",
  80: "Kejahatan",
  99: "Dokumenter",
  18: "Drama",
  10751: "Keluarga",
  14: "Fantasi",
  36: "Sejarah",
  27: "Horor",
  10402: "Musik",
  9648: "Misteri",
  10749: "Romantis",
  878: "Sci-Fi",
  10770: "Film TV",
  53: "Thriller",
  10752: "Perang",
  37: "Barat",
};

export interface GenreInfo {
  id: number;
  name: string;
}

interface Page<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

interface TmdbMovie {
  id: number;
  title?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  runtime?: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  production_countries?: { iso_3166_1: string; name: string }[];
  spoken_languages?: { english_name: string; iso_639_1: string }[];
}

interface TmdbTv {
  id: number;
  name?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
}

const BLOCKED_TV_IDS = new Set<number>([310518]);

const TV_GENRE_NAMES: Record<number, string> = {  10759: "Aksi & Petualangan",
  16: "Animasi",
  35: "Komedi",
  80: "Kejahatan",
  99: "Dokumenter",
  18: "Drama",
  10751: "Keluarga",
  10762: "Anak-anak",
  9648: "Misteri",
  10763: "Berita",
  10764: "Reality",
  10765: "Sci-Fi & Fantasi",
  10766: "Sinetron",
  10767: "Talk Show",
  10768: "Perang & Politik",
  37: "Barat",
};

function mapTvItem(m: TmdbTv): MovieListItem {
  const vote = Number(m.vote_average ?? 0);
  const seed = m.name || m.original_name || String(m.id);
  return {
    id: String(m.id),
    slug: `tv-${m.id}`,
    title: m.name || m.original_name || "",
    posterPath: posterOf(m, seed),
    backdropPath: backdropOf(m, seed),
    releaseDate: m.first_air_date ?? "",
    voteAverage: vote > 0 ? vote.toFixed(1) : "",
    quality: "",
    country: "",
    runtime: 0,
    genres: (m.genre_ids ?? []).slice(0, 3).map((id) => ({
      id: String(id),
      name: TV_GENRE_NAMES[id] ?? GENRE_NAMES[id] ?? String(id),
    })),
    hasVideo: true,
    overview: m.overview ?? "",
  };
}

export type MovieListKey = "popular" | "trending" | "now_playing" | "upcoming" | "top_rated" | "tv_popular";

const LIST_PATHS: Record<Exclude<MovieListKey, "tv_popular">, (page: number) => string> = {
  popular: (p) => `/movie/popular?language=id-ID&page=${p}`,
  trending: (p) => `/trending/movie/week?language=id-ID&page=${p}`,
  now_playing: (p) => `/movie/now_playing?language=id-ID&region=ID&page=${p}`,
  upcoming: (p) => `/movie/upcoming?language=id-ID&region=ID&page=${p}`,
  top_rated: (p) => `/movie/top_rated?language=id-ID&page=${p}`,
};

function genreOf(g: number | { id: number; name?: string }): { id: string; name: string } {
  const id = typeof g === "number" ? g : g.id;
  const name = typeof g === "object" && g.name ? g.name : GENRE_NAMES[id] ?? String(id);
  return { id: String(id), name };
}

function placeholder(seed: string, kind: "poster" | "backdrop"): string {
  return `/api/placeholder?seed=${encodeURIComponent(seed)}&kind=${kind}`;
}

function posterOf(
  m: { poster_path?: string | null; backdrop_path?: string | null },
  seed: string
): string {
  return m.poster_path || m.backdrop_path || placeholder(seed, "poster");
}

function backdropOf(
  m: { poster_path?: string | null; backdrop_path?: string | null },
  seed: string
): string {
  return m.backdrop_path || m.poster_path || placeholder(seed, "backdrop");
}

export function mapListItem(m: TmdbMovie): MovieListItem {
  const vote = Number(m.vote_average ?? 0);
  const seed = m.title || m.original_title || String(m.id);
  return {
    id: String(m.id),
    slug: String(m.id),
    title: m.title || m.original_title || "",
    posterPath: posterOf(m, seed),
    backdropPath: backdropOf(m, seed),
    releaseDate: m.release_date ?? "",
    voteAverage: vote > 0 ? vote.toFixed(1) : "",
    quality: "",
    country: "",
    runtime: Number(m.runtime ?? 0),
    genres: (m.genre_ids ?? []).slice(0, 3).map(genreOf),
    hasVideo: true,
    overview: m.overview ?? "",
  };
}

export async function getMovieList(
  key: MovieListKey,
  page = 1
): Promise<{ items: MovieListItem[]; total: number; totalPages: number }> {
  if (key === "tv_popular") {
    const data = await tmdbFetch<Page<TmdbTv>>(
      `/tv/popular?language=id-ID&page=${page}`,
      5 * 60 * 1000
    );
    return {
      items: data.results
        .filter((m) => !BLOCKED_TV_IDS.has(m.id))
        .map(mapTvItem),
      total: data.total_results,
      totalPages: data.total_pages,
    };
  }
  const data = await tmdbFetch<Page<TmdbMovie>>(LIST_PATHS[key](page), 5 * 60 * 1000);
  return {
    items: data.results.map(mapListItem),
    total: data.total_results,
    totalPages: data.total_pages,
  };
}

export async function discoverByGenre(
  genreId: number,
  page = 1,
  mediaType: "movie" | "tv" = "movie"
) {
  const isTv = mediaType === "tv";
  const data = await tmdbFetch<Page<TmdbTv>>(
    `/${isTv ? "discover/tv" : "discover/movie"}?language=id-ID&with_genres=${genreId}&sort_by=popularity.desc&page=${page}`,
    10 * 60 * 1000
  );
  return {
    items: data.results.map((m) => (isTv ? mapTvItem(m as TmdbTv) : mapListItem(m as TmdbMovie))),
    total: data.total_results,
    totalPages: data.total_pages,
  };
}

export async function getGenres(mediaType: "movie" | "tv" = "movie"): Promise<GenreInfo[]> {
  const isTv = mediaType === "tv";
  const data = await tmdbFetch<{ genres: GenreInfo[] }>(
    `/genre/${isTv ? "tv" : "movie"}/list?language=id-ID`,
    24 * 60 * 60 * 1000
  );
  return data.genres.map((g) => ({
    id: g.id,
    name: isTv ? TV_GENRE_NAMES[g.id] ?? g.name : GENRE_NAMES[g.id] ?? g.name,
  }));
}

export interface GenreCount extends GenreInfo {
  count: number;
}

export async function getGenreCounts(ids: number[], mediaType: "movie" | "tv" = "movie"): Promise<GenreCount[]> {
  const isTv = mediaType === "tv";
  const names = await getGenres(isTv ? "tv" : "movie");
  const settled = await Promise.allSettled(
    ids.map((id) =>
      tmdbFetch<Page<TmdbMovie>>(`/${isTv ? "discover/tv" : "discover/movie"}?with_genres=${id}&page=1`, 24 * 60 * 60 * 1000)
    )
  );
  return ids.map((id, i) => ({
    id,
    name: names.find((n) => n.id === id)?.name ?? String(id),
    count: settled[i].status === "fulfilled" ? settled[i].value.total_results : 0,
  }));
}

export interface TmdbVideo {
  name: string;
  key: string;
  site: string;
  type: string;
  size: number;
  official?: boolean;
}

export interface TmdbDetail {
  movie: MovieDetail;
  videos: TmdbVideo[];
  languages: string[];
  certification: string;
  collection: { id: number; name: string } | null;
}

export async function getMovieDetail(id: string): Promise<TmdbDetail> {
  const [detail, detailEn, credits, videos, releases] = await Promise.all([
    tmdbFetch<TmdbMovie & { belongs_to_collection?: { id: number; name: string } | null }>(
      `/movie/${id}?language=id-ID`,
      10 * 60 * 1000
    ),
    tmdbFetch<TmdbMovie>(
      `/movie/${id}?language=en-US`,
      10 * 60 * 1000
    ).catch(() => null),
    tmdbFetch<{ cast: unknown[]; crew: { job?: string; name?: string }[] }>(
      `/movie/${id}/credits?language=id-ID`,
      10 * 60 * 1000
    ),
    tmdbFetch<{ results: TmdbVideo[] }>(`/movie/${id}/videos?language=id-ID`, 10 * 60 * 1000).catch(() => ({
      results: [],
    })),
    tmdbFetch<{
      results: { iso_3166_1: string; release_dates: { certification: string }[] }[];
    }>(`/movie/${id}/release_dates`, 24 * 60 * 60 * 1000).catch(() => ({ results: [] })),
  ]);

  const vote = Number(detail.vote_average ?? 0);
  const director = credits.crew.find((c) => c.job === "Director")?.name ?? "";
  const certification =
    releases.results.find((r) => r.iso_3166_1 === "ID")?.release_dates?.[0]?.certification ??
    releases.results.find((r) => r.iso_3166_1 === "US")?.release_dates?.[0]?.certification ??
    "";

  const movie: MovieDetail = {
    id: String(detail.id),
    slug: String(detail.id),
    title: detail.title || detail.original_title || "",
    posterPath: posterOf(detail, detail.title || detail.original_title || String(detail.id)),
    backdropPath: backdropOf(detail, detail.title || detail.original_title || String(detail.id)),
    releaseDate: detail.release_date ?? "",
    voteAverage: vote > 0 ? vote.toFixed(1) : "",
    runtime: Number(detail.runtime ?? 0),
    quality: "",
    country: detail.production_countries?.[0]?.iso_3166_1 ?? "",
    overview: detail.overview || detailEn?.overview || "",
    director,
    genres: (detail.genres ?? []).map(genreOf),
    cast: (credits.cast as { id: number; name: string; character?: string; profile_path?: string | null }[])
      .slice(0, 14)
      .map((c) => ({
        id: String(c.id),
        name: c.name,
        character: c.character ?? "",
        profilePath: c.profile_path ?? "",
      })),
    contentType: "movie",
  };

  return {
    movie,
    videos: videos.results.filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")),
    languages: (detail.spoken_languages ?? [])
      .map((l) => l.english_name)
      .filter(Boolean)
      .slice(0, 3),
    certification,
    collection: detail.belongs_to_collection ?? null,
  };
}

export async function getTvDetail(id: string): Promise<TmdbDetail> {
  interface TmdbTvDetail {
    id: number;
    name?: string;
    original_name?: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    first_air_date?: string;
    vote_average?: number;
    episode_run_time?: number[];
    genres?: { id: number; name: string }[];
    origin_country?: string[];
    spoken_languages?: { english_name: string; iso_639_1: string }[];
    created_by?: { name: string }[];
  }

  const [detail, detailEn, credits, videos] = await Promise.all([
    tmdbFetch<TmdbTvDetail>(`/tv/${id}?language=id-ID`, 10 * 60 * 1000),
    tmdbFetch<TmdbTvDetail>(`/tv/${id}?language=en-US`, 10 * 60 * 1000).catch(() => null),
    tmdbFetch<{ cast: unknown[]; crew: { job?: string; name?: string }[] }>(
      `/tv/${id}/credits?language=id-ID`,
      10 * 60 * 1000
    ),
    tmdbFetch<{ results: TmdbVideo[] }>(`/tv/${id}/videos?language=id-ID`, 10 * 60 * 1000).catch(() => ({
      results: [],
    })),
  ]);

  const vote = Number(detail.vote_average ?? 0);
  const runtime = detail.episode_run_time?.[0] ?? 0;
  const creator = detail.created_by?.[0]?.name ?? credits.crew.find((c) => c.job === "Director")?.name ?? "";

  const movie: MovieDetail = {
    id: String(detail.id),
    slug: `tv-${detail.id}`,
    title: detail.name || detail.original_name || "",
    posterPath: posterOf(detail, detail.name || detail.original_name || String(detail.id)),
    backdropPath: backdropOf(detail, detail.name || detail.original_name || String(detail.id)),
    releaseDate: detail.first_air_date ?? "",
    voteAverage: vote > 0 ? vote.toFixed(1) : "",
    runtime,
    quality: "",
    country: detail.origin_country?.[0] ?? "",
    overview: detail.overview || detailEn?.overview || "",
    director: creator,
    genres: (detail.genres ?? []).map((g) => ({
      id: String(g.id),
      name: TV_GENRE_NAMES[g.id] ?? GENRE_NAMES[g.id] ?? g.name,
    })),
    cast: (credits.cast as { id: number; name: string; character?: string; profile_path?: string | null }[])
      .slice(0, 14)
      .map((c) => ({
        id: String(c.id),
        name: c.name,
        character: c.character ?? "",
        profilePath: c.profile_path ?? "",
      })),
    contentType: "tv",
  };

  return {
    movie,
    videos: videos.results.filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")),
    languages: (detail.spoken_languages ?? [])
      .map((l) => l.english_name)
      .filter(Boolean)
      .slice(0, 3),
    certification: "",
    collection: null,
  };
}

export interface TmdbSearchItem extends MovieListItem {
  overview: string;
}

export async function searchMovies(q: string, page = 1, mediaType: "movie" | "tv" | "all" = "all") {
  if (mediaType === "tv") {
    const data = await tmdbFetch<Page<TmdbTv>>(
      `/search/tv?language=id-ID&query=${encodeURIComponent(q)}&page=${page}`,
      5 * 60 * 1000
    );
    return {
      items: data.results.map((m) => ({ ...mapTvItem(m), overview: m.overview ?? "" })),
      total: data.total_results,
      totalPages: data.total_pages,
    };
  }

  if (mediaType === "all") {
    const [movieData, tvData] = await Promise.all([
      tmdbFetch<Page<TmdbMovie>>(
        `/search/movie?language=id-ID&query=${encodeURIComponent(q)}&page=${page}`,
        5 * 60 * 1000
      ),
      tmdbFetch<Page<TmdbTv>>(
        `/search/tv?language=id-ID&query=${encodeURIComponent(q)}&page=${page}`,
        5 * 60 * 1000
      ),
    ]);
    const items = [
      ...movieData.results.map((m) => ({ ...mapListItem(m), overview: m.overview ?? "" })),
      ...tvData.results.map((m) => ({ ...mapTvItem(m), overview: m.overview ?? "" })),
    ];
    return {
      items,
      total: movieData.total_results + tvData.total_results,
      totalPages: Math.max(movieData.total_pages, tvData.total_pages),
    };
  }

  const data = await tmdbFetch<Page<TmdbMovie>>(
    `/search/movie?language=id-ID&query=${encodeURIComponent(q)}&page=${page}`,
    5 * 60 * 1000
  );
  return {
    items: data.results.map((m) => ({ ...mapListItem(m), overview: m.overview ?? "" })),
    total: data.total_results,
    totalPages: data.total_pages,
  };
}