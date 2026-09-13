"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Play, Plus, Check, Clock, Star, Users, Film, Tv } from "lucide-react";
import { idlixImage, yearOf } from "@/lib/media";
import type { MovieDetail as MovieDetailType } from "@/lib/types";
import { useHistory, useWatchlist, useProgress } from "@/lib/client-store";
import type { IdlixEpisode, IdlixSeason } from "@/lib/idlix";
import Player from "./Player";
import PageLoader from "./PageLoader";

interface VideoInfo {
  name: string;
  key: string;
  site: string;
  type: string;
}

interface TmdbCastItem {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

interface TmdbCrewItem {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface TmdbVideoItem {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

interface TmdbSimilarItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
}

interface TmdbData {
  tagline: string;
  voteAverage: number;
  voteCount: number;
  status: string;
  originalLanguage: string;
  budget: number;
  revenue: number;
  productionCompanies: { id: number; name: string; logo_path: string | null }[];
  cast: TmdbCastItem[];
  crew: TmdbCrewItem[];
  directors: TmdbCrewItem[];
  videos: TmdbVideoItem[];
  similar: TmdbSimilarItem[];
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  logoPath: string | null;
}

interface DetailPayload {
  movie: MovieDetailType;
  videos: VideoInfo[];
  languages: string[];
  certification: string;
  _source?: string;
  _pageUrl?: string;
  _episodes?: { number: string; title: string; url: string }[];
  tmdb?: TmdbData;
}

interface EpisodeItem {
  id: string;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
}

const LANG_NAMES: Record<string, string> = {
  en: "English", id: "Indonesia", ko: "Korea", ja: "Jepang",
  zh: "Mandarin", th: "Thailand", hi: "Hindi", fr: "Prancis",
  de: "Jerman", es: "Spanyol", pt: "Portugis", it: "Italia",
  tr: "Turki", ar: "Arab", ru: "Rusia", pl: "Polandia",
};

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

function buildNgefilmSeasons(
  episodes: { number: string; title: string; url: string }[]
): IdlixSeason[] {
  return [{
    id: "1",
    seasonNumber: 1,
    name: "Season 1",
    posterPath: "",
    episodes: episodes.map((ep, i) => ({
      id: ep.url || `ep-${i}`,
      episodeNumber: parseInt(ep.number) || i + 1,
      name: ep.title || `Episode ${ep.number}`,
      overview: "",
      stillPath: "",
      airDate: "",
      runtime: 0,
      hasVideo: true,
      seasonNumber: 1,
    })),
  }];
}

// Score ring component
function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const pct = Math.round(score * 10);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 70 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold" style={{ color }}>
        {pct}<span className="text-[8px]">%</span>
      </span>
    </div>
  );
}

export default function MovieDetail({ slug }: { slug: string }) {
  const [movie, setMovie] = useState<MovieDetailType | null>(null);
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [certification, setCertification] = useState("");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [error, setError] = useState("");
  const [ngefilmSource, setNgefilmSource] = useState<string | undefined>(undefined);
  const [ngefilmEpisodes, setNgefilmEpisodes] = useState<{ number: string; title: string; url: string }[]>([]);
  const [tmdb, setTmdb] = useState<TmdbData | null>(null);

  // TV episode state
  const [seasons, setSeasons] = useState<IdlixSeason[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [currentSeasonIdx, setCurrentSeasonIdx] = useState(0);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | undefined>(undefined);
  const [currentEpisodeName, setCurrentEpisodeName] = useState<string | undefined>(undefined);

  const { has, toggle } = useWatchlist();
  const { record } = useHistory();
  const { map: progressMap } = useProgress();

  const seasonsRef = useRef(seasons);
  const currentSeasonIdxRef = useRef(currentSeasonIdx);
  seasonsRef.current = seasons;
  currentSeasonIdxRef.current = currentSeasonIdx;

  const doPrefetch = useCallback((contentType?: string) => {
    if (!contentType) return;
    const isTv = contentType === "tv";
    const epId = isTv ? seasonsRef.current[currentSeasonIdxRef.current]?.episodes?.[0]?.id : undefined;
    const params = new URLSearchParams();
    if (isTv) params.set("type", "tv");
    if (epId) params.set("episodeId", epId);
    const qs = params.toString();
    fetch(`/api/prefetch/${slug}${qs ? "?" + qs : ""}`).catch(() => {});
  }, [slug]);

  useEffect(() => {
    const cacheKey = `ngefilm_detail_v2_${slug}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const d: DetailPayload = JSON.parse(cached);
        if (d._source === "ngefilm") {
          setMovie(d.movie);
          setVideos(d.videos || []);
          setLanguages(d.languages || []);
          setCertification(d.certification || "");
          if (d.tmdb) setTmdb(d.tmdb);
          if (d._episodes && d._episodes.length > 0) {
            setSeasons(buildNgefilmSeasons(d._episodes));
            setCurrentSeasonIdx(0);
            setNgefilmSource(d._pageUrl || `https://new39.ngefilm.site/${slug}/`);
            setNgefilmEpisodes(d._episodes);
          } else {
            setNgefilmSource(d._pageUrl || `https://new39.ngefilm.site/${slug}/`);
          }
          return;
        }
      } catch {}
    }

    fetch(`/api/catalog/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("gagal ambil detail"))))
      .then((d: DetailPayload) => {
        if (d._source === "ngefilm") {
          try { sessionStorage.setItem(cacheKey, JSON.stringify(d)); } catch {}
        }
        setMovie(d.movie);
        setVideos(d.videos || []);
        setLanguages(d.languages || []);
        setCertification(d.certification || "");
        if (d.tmdb) setTmdb(d.tmdb);

        if (d._source === "ngefilm" && d._episodes && d._episodes.length > 0) {
          setSeasons(buildNgefilmSeasons(d._episodes));
          setCurrentSeasonIdx(0);
          setNgefilmSource(d._pageUrl || `https://new39.ngefilm.site/${slug}/`);
          setNgefilmEpisodes(d._episodes);
          doPrefetch(d.movie.contentType);
          return;
        }

        if (d._source === "ngefilm") {
          setNgefilmSource(d._pageUrl || `https://new39.ngefilm.site/${slug}/`);
        }

        if (d.movie.contentType === "tv") {
          setSeasonsLoading(true);
          fetch(`/api/catalog/${slug}/episodes`)
            .then((r) => r.json())
            .then((data: { seasons: IdlixSeason[] }) => {
              const s = data.seasons ?? [];
              setSeasons(s);
              const firstIdx = s.findIndex((x) => x.episodes.length > 0);
              if (firstIdx >= 0) setCurrentSeasonIdx(firstIdx);
            })
            .catch(() => {})
            .finally(() => setSeasonsLoading(false));
        }
        doPrefetch(d.movie.contentType);
      })
      .catch((e) => setError((e as Error).message));
  }, [slug, doPrefetch]);

  useEffect(() => {
    if (!movie) return;
    if (movie.contentType !== "tv") return;
    if (!seasons.length) return;
    const ep = seasons[currentSeasonIdx]?.episodes?.[0];
    if (!ep) return;
    const params = new URLSearchParams({ type: "tv", episodeId: ep.id });
    fetch(`/api/prefetch/${slug}?${params.toString()}`).catch(() => {});
  }, [slug, currentSeasonIdx, seasons.length, movie?.contentType]);

  const startPlay = (episodeId?: string, episodeName?: string) => {
    if (!movie) return;
    record({
      slug,
      title: movie.title,
      posterPath: movie.posterPath || "",
      releaseDate: movie.releaseDate || "",
      quality: "",
      country: movie.country || "",
    });
    setCurrentEpisodeId(episodeId);
    setCurrentEpisodeName(episodeName);
    setPlayerOpen(true);
  };

  if (error) return <div className="px-4 sm:px-10 py-20 text-center text-[#9D4EDD]">{error}</div>;
  if (!movie) return <PageLoader />;

  // Flat episode list for next-episode navigation
  const flatEpisodes: EpisodeItem[] = seasons.flatMap((s) =>
    s.episodes.map((e: IdlixEpisode) => ({
      id: e.id,
      episodeNumber: e.episodeNumber,
      seasonNumber: s.seasonNumber,
      name: e.name,
    }))
  );
  const currentFlatIdx = currentEpisodeId ? flatEpisodes.findIndex((e) => e.id === currentEpisodeId) : -1;
  const nextEpisode = currentFlatIdx >= 0 ? flatEpisodes[currentFlatIdx + 1] : undefined;

  if (playerOpen) {
    if (typeof document === "undefined") return null;

    let ngefilmUrl: string | undefined;
    if (ngefilmSource) {
      if (currentEpisodeId && currentEpisodeId.startsWith("http")) {
        ngefilmUrl = currentEpisodeId;
      } else if (ngefilmEpisodes.length > 0 && currentEpisodeId) {
        const epIdx = flatEpisodes.findIndex((e) => e.id === currentEpisodeId);
        if (epIdx >= 0 && ngefilmEpisodes[epIdx]) {
          ngefilmUrl = ngefilmEpisodes[epIdx].url;
        }
      }
      if (!ngefilmUrl && movie.contentType !== "tv") {
        ngefilmUrl = ngefilmSource;
      }
    }

    return createPortal(
      <Player
        slug={slug}
        title={movie.title}
        type={movie.contentType === "tv" ? "tv" : "movie"}
        episodeId={currentEpisodeId}
        episodeTitle={currentEpisodeName}
        onNextEpisode={nextEpisode ? () => {
          setCurrentEpisodeId(nextEpisode.id);
          setCurrentEpisodeName(nextEpisode.name);
        } : undefined}
        nextEpisodeName={nextEpisode?.name}
        ngefilmUrl={ngefilmUrl}
        onClose={() => setPlayerOpen(false)}
      />,
      document.body
    );
  }

  const isSaved = has(slug);
  const runtime = movie.runtime ? `${Math.floor(movie.runtime / 60)}j ${movie.runtime % 60}m` : "";
  const tmdbScore = tmdb?.voteAverage ?? (movie.voteAverage ? parseFloat(movie.voteAverage) : 0);
  const scoreLabel = tmdbScore > 0
    ? `${Math.round(tmdbScore * 10)}% cocok`
    : "Rekomendasi";
  const isFilm = movie.contentType !== "tv";
  const ageBadge = certification || "17+";

  // Extended cast: prefer TMDB data (has photos), fall back to provider data
  const displayCast = tmdb?.cast?.length
    ? tmdb.cast.slice(0, 15)
    : movie.cast.slice(0, 12).map(c => ({
        id: parseInt(c.id) || 0,
        name: c.name,
        character: c.character,
        profile_path: c.profilePath,
        order: 0,
      }));

  const directors = tmdb?.directors?.length
    ? tmdb.directors.map(d => d.name).join(", ")
    : movie.director;

  // Watch progress
  const saved = progressMap[slug];
  const hasProgress = saved && saved.time > 10 && saved.duration > 0 && saved.time < saved.duration - 30;
  const progressPct = hasProgress ? Math.round((saved.time / saved.duration) * 100) : 0;

  return (
    <motion.div
      className="relative -mt-[100px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* MODERN BACKDROP HERO */}
      <div className="relative min-h-[100vh] min-h-[100dvh]">
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #0A0E27 0%, #1A1F3A 50%, #0A0E27 100%)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          />
          {movie.backdropPath && (
            <motion.img
              src={idlixImage(movie.backdropPath, "w1280")}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.5, objectPosition: "center 20%" }}
              initial={{ scale: 1.05, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.5 }}
              transition={{ duration: 0.8 }}
            />
          )}
          <div
            className="absolute right-[-80px] top-[-100px] w-[500px] h-[500px] rounded-full blur-[100px]"
            style={{ background: "radial-gradient(circle, rgba(157,78,221,0.3), transparent 70%)" }}
          />
          <div
            className="absolute left-[-60px] bottom-[-80px] w-[400px] h-[400px] rounded-full blur-[90px]"
            style={{ background: "radial-gradient(circle, rgba(123,44,191,0.25), transparent 70%)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(10,14,39,0.88) 0%, rgba(10,14,39,0.5) 25%, rgba(10,14,39,0.1) 50%, transparent 70%), linear-gradient(0deg, rgba(10,14,39,0.75) 0%, rgba(10,14,39,0.2) 15%, transparent 40%)",
            }}
          />
        </div>
        <div className="relative px-6 sm:px-8 lg:px-12 pt-32 pb-10 flex flex-col gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl text-[14px] font-semibold text-white transition-all duration-300 hover:scale-105"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
          </motion.div>
          <div className="flex flex-col sm:flex-row gap-8 sm:gap-10 items-start sm:items-end">
            <motion.div
              className="relative w-full sm:w-[200px] lg:w-[240px] flex-none max-w-[240px] aspect-[2/3] rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(26,31,58,0.8), rgba(13,17,40,0.95))",
                border: "1px solid rgba(255,255,255,0.2)",
                boxShadow: "0 20px 60px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(157,78,221,0.2)",
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              whileHover={{ scale: 1.03, boxShadow: "0 24px 70px -20px rgba(123,44,191,0.5), 0 0 0 1px rgba(157,78,221,0.4)" }}
            >
              {movie.posterPath ? (
                <img src={idlixImage(movie.posterPath, "w500")} alt={movie.title} className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#1A1F3A] to-[#0A0E27]" />
              )}
              {tmdbScore > 0 && (
                <div className="absolute bottom-4 right-4">
                  <ScoreRing score={tmdbScore} size={52} />
                </div>
              )}
            </motion.div>
            <motion.div
              className="flex flex-col gap-5 pb-2"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="flex gap-2.5 flex-wrap">
                <span 
                  className="px-4 py-2 rounded-xl text-[12px] font-bold tracking-wider text-white"
                  style={{
                    background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
                    boxShadow: "0 4px 16px rgba(123,44,191,0.4)",
                  }}
                >
                  {isFilm ? "MOVIE" : "TV SERIES"}
                </span>
                {movie.genres?.slice(0, 3).map((g) => (
                  <span
                    key={g.id}
                    className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white/90 transition-all duration-300 hover:scale-105"
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.2)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                  }}
                >
                  {g.name}
                  </span>
                ))}
              </div>
              {tmdb?.logoPath ? (
                <img 
                  src={`https://image.tmdb.org/t/p/w500${tmdb.logoPath}`}
                  alt={movie.title}
                  className="max-w-[240px] sm:max-w-[320px] h-auto"
                  style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.8))" }}
                />
              ) : (
                <h1
                  className="font-extrabold leading-[0.95] tracking-tight m-0"
                  style={{ 
                    fontSize: "clamp(36px,5vw,64px)",
                    fontFamily: "Space Grotesk, sans-serif",
                  }}
                >
                  {movie.title}
                </h1>
              )}
              {tmdb?.tagline && (
                <p className="text-[15px] italic text-white/60 -mt-2 font-light">
                  &ldquo;{tmdb.tagline}&rdquo;
                </p>
              )}
              <div className="flex items-center gap-4 text-[15px] text-white/70 flex-wrap">
                {tmdbScore > 0 && (
                  <span className="flex items-center gap-1.5 text-[#22c55e] font-bold">
                    <Star className="w-4 h-4" fill="#22c55e" />
                    {tmdbScore.toFixed(1)}
                    {tmdb?.voteCount ? (
                      <span className="text-white/40 font-normal text-[13px] ml-0.5">({tmdb.voteCount.toLocaleString()})</span>
                    ) : null}
                  </span>
                )}
                <span className="font-semibold">{yearOf(movie.releaseDate)}</span>
                <span
                  className="px-2.5 py-1 rounded-lg text-[12px] font-semibold"
                  style={{ border: "1px solid rgba(255,255,255,0.3)" }}
                >
                  {ageBadge}
                </span>
                {runtime && <span>{runtime}</span>}
                {!isFilm && tmdb?.numberOfSeasons && (
                  <span className="flex items-center gap-1.5">
                    <Tv className="w-4 h-4" />
                    {tmdb.numberOfSeasons} Season{tmdb.numberOfSeasons > 1 ? "s" : ""}
                    {tmdb.numberOfEpisodes ? ` · ${tmdb.numberOfEpisodes} Ep` : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 pt-2 flex-wrap">
                <motion.button
                  onClick={() => startPlay()}
                  className="flex items-center gap-3 px-8 py-4 rounded-2xl text-[16px] font-bold text-white transition-all duration-300 overflow-hidden relative group"
                  style={{
                    background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
                    boxShadow: "0 8px 24px rgba(123,44,191,0.5)",
                  }}
                  whileHover={{ scale: 1.05, boxShadow: "0 12px 32px rgba(123,44,191,0.6)" }}
                  whileTap={{ scale: 0.98 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.5 }}
                  />
                  {hasProgress ? (
                    <>
                      <Play className="w-5 h-5 relative z-10" fill="white" />
                      <span className="relative z-10">Resume {fmtTime(saved.time)}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 relative z-10" fill="white" />
                      <span className="relative z-10">Watch Now</span>
                    </>
                  )}
                </motion.button>
                <motion.button
                  onClick={() =>
                    toggle({
                      slug,
                      title: movie.title,
                      posterPath: movie.posterPath || "",
                      releaseDate: movie.releaseDate || "",
                      quality: "",
                      country: movie.country || "ID",
                    })
                  }
                  className="flex items-center gap-2.5 px-6 py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-300"
                  style={{
                    background: isSaved ? "rgba(157,78,221,0.25)" : "rgba(255,255,255,0.1)",
                    border: isSaved ? "1px solid rgba(157,78,221,0.5)" : "1px solid rgba(255,255,255,0.2)",
                    backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  }}
                  whileHover={{
                    scale: 1.05,
                    boxShadow: isSaved ? "0 8px 24px rgba(157,78,221,0.4)" : "0 8px 24px rgba(255,255,255,0.15)"
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isSaved ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  {isSaved ? "Saved" : "My List"}
                </motion.button>
              </div>
              {hasProgress && (
                <div className="flex items-center gap-4 mt-1">
                  <div className="w-[240px] h-1.5 rounded-full overflow-hidden bg-white/10">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: "linear-gradient(90deg, #7B2CBF, #9D4EDD)",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  <span className="text-[12px] text-white/40 font-medium">
                    {fmtTime(saved.time)} / {fmtTime(saved.duration)} · {progressPct}%
                  </span>
                </div>
              )}
              {movie.overview && (
                <p className="text-[15px] leading-relaxed text-white/65 m-0 max-w-[560px] line-clamp-3">
                  {movie.overview}
                </p>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* MODERN CONTENT GRID */}
      <div className="px-6 sm:px-8 lg:px-12 py-12 grid grid-cols-1 lg:grid-cols-[1.6fr_0.9fr] gap-10">
        <div className="min-w-0 flex flex-col gap-10">
          {/* Cast Section */}
          {displayCast.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <h2 className="font-bold text-[24px] mb-5 m-0 flex items-center gap-2.5" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                <Users className="w-5 h-5 text-[#9D4EDD]" />
                Cast
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
                {displayCast.map((c, idx) => (
                  <motion.div
                    key={c.id || c.name}
                    className="flex-none w-[110px] flex flex-col items-center gap-3"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                    whileHover={{ y: -6, scale: 1.05 }}
                  >
                    <div
                      className="w-20 h-20 rounded-full overflow-hidden flex-none transition-all duration-300"
                      style={{
                        background: "linear-gradient(135deg, rgba(26,31,58,0.8), rgba(13,17,40,0.95))",
                        border: "2px solid rgba(157,78,221,0.3)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                      }}
                    >
                      {c.profile_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${c.profile_path}`}
                          alt={c.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/25 text-[24px] font-bold">
                          {c.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="text-center w-full">
                      <p className="text-[12px] font-semibold text-white/90 truncate">{c.name}</p>
                      <p className="text-[11px] text-white/45 truncate">{c.character}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Episode List (TV series only) */}
          {!isFilm && (seasonsLoading || seasons.length > 0) && (() => {
            if (seasonsLoading) {
              return (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#9D4EDD] border-t-transparent"></div>
                </div>
              );
            }
            if (seasons.length === 0) return null;
            const currentSeason = seasons[currentSeasonIdx] ?? seasons[0];
            const eps = currentSeason?.episodes ?? [];
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-bold text-[24px] m-0 flex items-center gap-2.5" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                    <Tv className="w-5 h-5 text-[#9D4EDD]" />
                    Episodes
                  </h2>
                  <span className="text-[14px] text-white/45 font-medium">
                    Season {currentSeason.seasonNumber} · {eps.length} episodes
                  </span>
                </div>

                {seasons.length > 1 && (
                  <div className="flex gap-2.5 mb-5 flex-wrap">
                    {seasons.map((s, i) => (
                      <motion.button
                        key={s.id}
                        onClick={() => setCurrentSeasonIdx(i)}
                        className="px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-300"
                        style={
                          i === currentSeasonIdx
                            ? { 
                                background: "linear-gradient(135deg,#7B2CBF,#9D4EDD)", 
                                color: "#fff",
                                boxShadow: "0 4px 16px rgba(123,44,191,0.4)",
                              }
                            : {
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.15)",
                                color: "rgba(255,255,255,0.6)",
                              }
                        }
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Season {s.seasonNumber}
                      </motion.button>
                    ))}
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {eps.length === 0 ? (
                    <motion.div
                      className="p-8 rounded-2xl text-center"
                      style={{
                        background: "linear-gradient(135deg, rgba(26,31,58,0.5), rgba(13,17,40,0.8))",
                        border: "1px solid rgba(157,78,221,0.2)",
                      }}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                    >
                      <p className="text-[15px] text-white/50 m-0">
                        Episodes for season {currentSeason.seasonNumber} are not available yet
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      className="flex flex-col gap-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      key={currentSeasonIdx}
                    >
                      {eps.map((ep: IdlixEpisode, idx: number) => (
                        <motion.button
                          key={ep.id}
                          onClick={() => startPlay(ep.id, ep.name)}
                          className="group/ep flex items-center gap-4 p-5 rounded-xl text-left w-full cursor-pointer relative overflow-hidden transition-all duration-300"
                          style={{
                            background: "linear-gradient(135deg, rgba(26,31,58,0.7), rgba(13,17,40,0.9))",
                            border: "1px solid rgba(157,78,221,0.2)",
                          }}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: idx * 0.04 }}
                          whileHover={{
                            x: 6,
                            borderColor: "rgba(157,78,221,0.5)",
                            boxShadow: "0 6px 20px rgba(123,44,191,0.3)"
                          }}
                        >
                          <div className="flex-1 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[15px] font-semibold leading-snug group-hover/ep:text-[#9D4EDD] transition-colors">
                                {String(ep.episodeNumber).padStart(2, "0")}. {ep.name}
                              </span>
                              {ep.runtime > 0 && (
                                <span className="text-[13px] text-white/40 flex-none flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5" />
                                  {ep.runtime}m
                                </span>
                              )}
                            </div>
                            {ep.overview && (
                              <p className="text-[13px] text-white/55 leading-relaxed line-clamp-2 m-0 group-hover/ep:text-white/75 transition-colors">
                                {ep.overview}
                              </p>
                            )}
                          </div>
                          <motion.div
                            className="flex-none"
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileHover={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <div 
                              className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300"
                              style={{
                                background: "rgba(157,78,221,0.2)",
                                border: "1px solid rgba(157,78,221,0.3)",
                              }}
                            >
                              <Play className="w-5 h-5 text-[#9D4EDD] ml-0.5" fill="#9D4EDD" />
                            </div>
                          </motion.div>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })()}

          {/* Trailers & Clips */}
          {videos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <h2 className="font-bold text-[24px] mb-5 m-0 flex items-center gap-2.5" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                <Film className="w-5 h-5 text-[#9D4EDD]" />
                Trailers &amp; Clips
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {videos.slice(0, 6).map((clip, idx) => (
                  <motion.a
                    key={clip.key}
                    href={`https://www.youtube.com/watch?v=${clip.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.03]"
                    style={{
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(255,255,255,0.05)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                    whileHover={{ boxShadow: "0 8px 24px rgba(123,44,191,0.3)" }}
                  >
                    <div className="relative aspect-video grid place-items-center bg-gradient-to-br from-[#1A1F3A] to-[#0D1128]">
                      <img
                        src={`https://img.youtube.com/vi/${clip.key}/hqdefault.jpg`}
                        alt={clip.name}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover opacity-80"
                      />
                      <div
                        className="relative w-14 h-14 rounded-full grid place-items-center transition-all duration-300 hover:scale-110"
                        style={{
                          background: "rgba(255,255,255,0.2)",
                          border: "2px solid rgba(255,255,255,0.4)",
                          backdropFilter: "blur(10px)",
                          WebkitBackdropFilter: "blur(10px)",
                        }}
                      >
                        <span className="w-0 h-0 border-l-[12px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1" />
                      </div>
                    </div>
                    <div className="px-4 py-3.5">
                      <div className="text-[14px] font-semibold truncate">{clip.name}</div>
                      <div className="text-[12px] text-white/45">{clip.type} · YouTube</div>
                    </div>
                  </motion.a>
                ))}
              </div>
            </motion.div>
          )}

          {/* Similar Movies/Shows */}
          {tmdb?.similar && tmdb.similar.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <h2 className="font-bold text-[24px] mb-5 m-0" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {isFilm ? "Similar Movies" : "Similar Shows"}
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
                {tmdb.similar.map((s, idx) => {
                  const simTitle = s.title || s.name || "";
                  const simSlug = simTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: idx * 0.05 }}
                    >
                      <Link
                        href={`/film/${simSlug}`}
                        className="flex-none w-[140px] group block"
                      >
                        <div
                          className="w-full aspect-[2/3] rounded-xl overflow-hidden mb-2.5 transition-all duration-300 group-hover:scale-105 relative"
                          style={{
                            background: "linear-gradient(135deg, rgba(26,31,58,0.6), rgba(13,17,40,0.9))",
                            border: "1px solid rgba(255,255,255,0.1)",
                            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                          }}
                        >
                          {s.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w342${s.poster_path}`}
                              alt={simTitle}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20 text-[12px] p-3 text-center">
                              {simTitle}
                            </div>
                          )}
                          {s.vote_average > 0 && (
                            <div className="absolute top-2 right-2">
                              <ScoreRing score={s.vote_average} size={36} />
                            </div>
                          )}
                        </div>
                        <p className="text-[13px] font-semibold text-white/85 truncate group-hover:text-[#9D4EDD] transition-colors">
                          {simTitle}
                        </p>
                        <p className="text-[11px] text-white/40">
                          {yearOf(s.release_date || s.first_air_date)}
                        </p>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>

        {/* MODERN INFO SIDEBAR */}
        <div className="min-w-0 flex flex-col gap-5">
          {/* Main info card */}
          <motion.div
            className="p-6 rounded-2xl flex flex-col gap-5"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
              border: "1px solid rgba(255,255,255,0.2)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-[11px] tracking-widest font-bold text-[#9D4EDD]">INFO</div>
            <div className="flex flex-col gap-4 text-[15px]">
              {directors && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50 flex-none font-medium">Director</span>
                  <span className="text-right font-semibold">{directors}</span>
                </div>
              )}
              {displayCast.length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50 flex-none font-medium">Cast</span>
                  <span className="text-right font-semibold">{displayCast.slice(0, 3).map(c => c.name).join(", ")}</span>
                </div>
              )}
              {movie.genres.length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50 flex-none font-medium">Genres</span>
                  <span className="text-right font-semibold">{movie.genres.map((g) => g.name).join(", ")}</span>
                </div>
              )}
              {movie.country && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50 flex-none font-medium">Country</span>
                  <span className="text-right font-semibold">{movie.country}</span>
                </div>
              )}
              {tmdb?.originalLanguage && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50 flex-none font-medium">Language</span>
                  <span className="text-right font-semibold">{LANG_NAMES[tmdb.originalLanguage] || tmdb.originalLanguage}</span>
                </div>
              )}
              {languages.length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50 font-medium">Audio</span>
                  <span className="text-right font-semibold">{languages.join(", ")}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-white/50 font-medium">Subtitles</span>
                <span className="text-right font-semibold">ID, EN</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-white/50 flex-none font-medium">Release</span>
                <span className="text-right font-semibold">{movie.releaseDate || "-"}</span>
              </div>
              {tmdb?.status && (
                <div className="flex justify-between gap-4">
                  <span className="text-white/50 flex-none font-medium">Status</span>
                  <span className="text-right font-semibold">{tmdb.status}</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Financial info (movies only) */}
          {isFilm && tmdb && (tmdb.budget > 0 || tmdb.revenue > 0) && (
            <motion.div
              className="p-6 rounded-2xl flex flex-col gap-4"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                border: "1px solid rgba(255,255,255,0.15)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="text-[11px] tracking-widest font-bold text-[#9D4EDD]">BOX OFFICE</div>
              <div className="flex flex-col gap-4 text-[15px]">
                {tmdb.budget > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-white/50 font-medium">Budget</span>
                    <span className="text-right font-bold">{fmtMoney(tmdb.budget)}</span>
                  </div>
                )}
                {tmdb.revenue > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-white/50 font-medium">Revenue</span>
                    <span className="text-right font-bold" style={{ color: tmdb.revenue > tmdb.budget ? "#22c55e" : "#ef4444" }}>
                      {fmtMoney(tmdb.revenue)}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Production companies */}
          {tmdb?.productionCompanies && tmdb.productionCompanies.length > 0 && (
            <motion.div
              className="p-6 rounded-2xl flex flex-col gap-4"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                border: "1px solid rgba(255,255,255,0.15)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="text-[11px] tracking-widest font-bold text-[#9D4EDD]">PRODUCTION</div>
              <div className="flex flex-wrap gap-3">
                {tmdb.productionCompanies.slice(0, 5).map((company) => (
                  <div
                    key={company.id}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl transition-all duration-300 hover:scale-105"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    {company.logo_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${company.logo_path}`}
                        alt={company.name}
                        className="h-5 w-auto object-contain brightness-0 invert opacity-70"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-[13px] text-white/65 font-medium">{company.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="h-12" />
    </motion.div>
  );
}
