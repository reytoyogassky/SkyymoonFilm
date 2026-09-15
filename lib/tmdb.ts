const TMDB_BASE = "https://api.themoviedb.org/3";
const TOKEN = process.env.TMDB_API_TOKEN || "";

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function tmdbFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  if (!TOKEN) throw new Error("TMDB_API_TOKEN not set");
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("language", "id-ID");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TmdbCast {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrew {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbVideo {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TmdbSimilar {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
}

export interface TmdbContentRating {
  iso_3166_1: string;
  rating: string;
}

export interface TmdbEnriched {
  tmdbId: number;
  tagline: string;
  overview: string;
  runtime: number;
  voteAverage: number;
  voteCount: number;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  releaseDate: string;
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
  backdrops: { file_path: string; width: number; height: number }[];
  certification: string;
  genres: { id: number; name: string }[];
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
}

// ---------------------------------------------------------------------------
// Search TMDB to find matching title
// ---------------------------------------------------------------------------

interface TmdbSearchResult {
  results: {
    id: number;
    title?: string;
    name?: string;
    media_type: string;
    release_date?: string;
    first_air_date?: string;
    poster_path: string | null;
  }[];
}

export async function searchTmdb(
  title: string,
  year?: string,
  mediaType?: "movie" | "tv"
): Promise<{ id: number; mediaType: "movie" | "tv" } | null> {
  const type = mediaType || "multi";
  const params: Record<string, string> = { query: title };
  if (year) params.year = year;

  console.log(`[TMDB] search: /search/${type} query="${title}" year=${year}`);
  const data = await tmdbFetch<TmdbSearchResult>(`/search/${type}`, params);
  console.log(`[TMDB] search results: ${data.results?.length ?? 0}`);
  if (!data.results?.length) return null;

  const best = data.results[0];
  const mt = mediaType || (best.media_type === "tv" ? "tv" : "movie");
  console.log(`[TMDB] best match: id=${best.id} title="${best.title || best.name}" type=${best.media_type}`);
  return { id: best.id, mediaType: mt };
}

// ---------------------------------------------------------------------------
// Get enriched movie/tv detail
// ---------------------------------------------------------------------------

interface TmdbMovieDetail {
  id: number;
  title: string;
  tagline: string;
  overview: string;
  runtime: number;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  status: string;
  original_language: string;
  budget: number;
  revenue: number;
  production_companies: { id: number; name: string; logo_path: string | null }[];
  genres: { id: number; name: string }[];
  credits: { cast: TmdbCast[]; crew: TmdbCrew[] };
  videos: { results: TmdbVideo[] };
  similar: { results: TmdbSimilar[] };
  images?: { logos: { file_path: string; iso_639_1: string | null }[]; backdrops: { file_path: string; width: number; height: number }[] };
  releases?: { countries: { iso_3166_1: string; certification: string }[] };
  release_dates?: {
    results: { iso_3166_1: string; release_dates: { certification: string }[] }[];
  };
}

interface TmdbTvDetail {
  id: number;
  name: string;
  tagline: string;
  overview: string;
  episode_run_time: number[];
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  status: string;
  original_language: string;
  production_companies: { id: number; name: string; logo_path: string | null }[];
  genres: { id: number; name: string }[];
  number_of_seasons: number;
  number_of_episodes: number;
  credits: { cast: TmdbCast[]; crew: TmdbCrew[] };
  videos: { results: TmdbVideo[] };
  similar: { results: TmdbSimilar[] };
  images?: { logos: { file_path: string; iso_639_1: string | null }[]; backdrops: { file_path: string; width: number; height: number }[] };
  content_ratings?: { results: TmdbContentRating[] };
}

function extractCertification(detail: TmdbMovieDetail | TmdbTvDetail, type: "movie" | "tv"): string {
  if (type === "tv") {
    const tv = detail as TmdbTvDetail;
    const ratings = tv.content_ratings?.results || [];
    const id = ratings.find((r) => r.iso_3166_1 === "ID");
    const us = ratings.find((r) => r.iso_3166_1 === "US");
    return id?.rating || us?.rating || "";
  }
  const movie = detail as TmdbMovieDetail;
  const releases = movie.release_dates?.results || [];
  const id = releases.find((r) => r.iso_3166_1 === "ID");
  const us = releases.find((r) => r.iso_3166_1 === "US");
  const cert = id?.release_dates?.[0]?.certification || us?.release_dates?.[0]?.certification || "";
  return cert;
}

export async function getTmdbEnriched(
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<TmdbEnriched> {
  const append = mediaType === "movie"
    ? "credits,videos,similar,release_dates,images"
    : "credits,videos,similar,content_ratings,images";

  const detail = await tmdbFetch<TmdbMovieDetail | TmdbTvDetail>(
    `/${mediaType}/${tmdbId}`,
    { append_to_response: append, include_image_language: "en,null" }
  );

  const credits = (detail as TmdbMovieDetail).credits || { cast: [], crew: [] };
  const videos = ((detail as TmdbMovieDetail).videos?.results || [])
    .filter((v) => v.site === "YouTube")
    .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0));

  const similar = ((detail as TmdbMovieDetail).similar?.results || []).slice(0, 12);
  const directors = credits.crew.filter((c) => c.job === "Director");
  const certification = extractCertification(detail, mediaType);

  const logos = ((detail as TmdbMovieDetail).images?.logos || []);
  const enLogo = logos.find(l => l.iso_639_1 === "en");
  const anyLogo = logos.find(l => l.iso_639_1 === null) || logos[0];
  const logoPath = enLogo?.file_path || anyLogo?.file_path || null;

  const backdrops = ((detail as TmdbMovieDetail).images?.backdrops || []).slice(0, 12);

  const isMovie = mediaType === "movie";
  const d = detail as TmdbMovieDetail & TmdbTvDetail;

  return {
    tmdbId: detail.id,
    tagline: detail.tagline || "",
    overview: detail.overview || "",
    runtime: isMovie ? d.runtime || 0 : (d.episode_run_time?.[0] || 0),
    voteAverage: detail.vote_average || 0,
    voteCount: detail.vote_count || 0,
    posterPath: detail.poster_path,
    backdropPath: detail.backdrop_path,
    logoPath,
    releaseDate: isMovie ? d.release_date || "" : d.first_air_date || "",
    status: detail.status || "",
    originalLanguage: detail.original_language || "",
    budget: isMovie ? d.budget || 0 : 0,
    revenue: isMovie ? d.revenue || 0 : 0,
    productionCompanies: detail.production_companies || [],
    cast: credits.cast.slice(0, 20),
    crew: credits.crew.slice(0, 20),
    directors,
    videos: videos.slice(0, 5),
    similar,
    backdrops,
    certification,
    genres: detail.genres || [],
    numberOfSeasons: !isMovie ? d.number_of_seasons : undefined,
    numberOfEpisodes: !isMovie ? d.number_of_episodes : undefined,
  };
}

// ---------------------------------------------------------------------------
// Convenience: enrich by title search (for NgeFilm items with no TMDB ID)
// ---------------------------------------------------------------------------

export async function enrichByTitle(
  title: string,
  year?: string,
  mediaType?: "movie" | "tv"
): Promise<TmdbEnriched | null> {
  try {
    console.log(`[TMDB] enrichByTitle: "${title}" year=${year} type=${mediaType}`);
    const match = await searchTmdb(title, year, mediaType);
    console.log(`[TMDB] searchTmdb result: ${match ? `id=${match.id} type=${match.mediaType}` : "null"}`);
    if (!match) return null;
    return getTmdbEnriched(match.id, match.mediaType);
  } catch (e) {
    console.log(`[TMDB] enrichByTitle error: ${(e as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lightweight search for list cards — returns just poster, rating, genres
// ---------------------------------------------------------------------------

interface TmdbSearchItem {
  id: number;
  title?: string;
  name?: string;
  media_type: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  original_language?: string;
}

interface TmdbLightResult {
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  genres: string[];
  originalLanguage: string;
}

const GENRE_ID_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics",
};

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Check if most words overlap
  const wordsA = new Set(na.split(" "));
  const wordsB = nb.split(" ");
  const overlap = wordsB.filter(w => wordsA.has(w)).length;
  return overlap >= Math.ceil(wordsB.length * 0.6);
}

export async function searchTmdbLight(
  title: string,
  year?: string,
  mediaType?: "movie" | "tv"
): Promise<TmdbLightResult | null> {
  try {
    const type = mediaType || "multi";
    const params: Record<string, string> = { query: title };
    if (year) params.year = year;

    const data = await tmdbFetch<{ results: TmdbSearchItem[] }>(`/search/${type}`, params);
    if (!data.results?.length) return null;

    // Find best match where title is actually similar
    const tmdbTitle = (r: TmdbSearchItem) => r.title || r.name || "";
    let best = data.results.find(r => titlesMatch(title, tmdbTitle(r)));
    if (!best) best = data.results[0];

    // Reject if title doesn't match at all
    if (!titlesMatch(title, tmdbTitle(best))) return null;

    return {
      posterPath: best.poster_path,
      backdropPath: best.backdrop_path,
      voteAverage: best.vote_average || 0,
      genres: (best.genre_ids || []).slice(0, 3).map(id => GENRE_ID_MAP[id]).filter(Boolean),
      originalLanguage: best.original_language || "",
    };
  } catch {
    return null;
  }
}
