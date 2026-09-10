"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Play, Plus, Check, Clock } from "lucide-react";
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

interface DetailPayload {
  movie: MovieDetailType;
  videos: VideoInfo[];
  languages: string[];
  certification: string;
}

interface EpisodeItem {
  id: string;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
}

export default function MovieDetail({ slug }: { slug: string }) {
  const [movie, setMovie] = useState<MovieDetailType | null>(null);
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [certification, setCertification] = useState("");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [error, setError] = useState("");
  const [streamReady, setStreamReady] = useState(false);

  // TV episode state
  const [seasons, setSeasons] = useState<IdlixSeason[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [currentSeasonIdx, setCurrentSeasonIdx] = useState(0);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | undefined>(undefined);
  const [currentEpisodeName, setCurrentEpisodeName] = useState<string | undefined>(undefined);

  const { has, toggle } = useWatchlist();
  const { record } = useHistory();
  const { map: progressMap } = useProgress();

  useEffect(() => {
    fetch(`/api/movies/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("gagal ambil detail"))))
      .then((d: DetailPayload) => {
        setMovie(d.movie);
        setVideos(d.videos || []);
        setLanguages(d.languages || []);
        setCertification(d.certification || "");
        if (d.movie.contentType === "tv") {
          setSeasonsLoading(true);
          fetch(`/api/tv-episodes/${slug}`)
            .then((r) => r.json())
            .then((data: { seasons: IdlixSeason[] }) => {
              const s = data.seasons ?? [];
              setSeasons(s);
              // default to first season that has episodes
              const firstIdx = s.findIndex((x) => x.episodes.length > 0);
              if (firstIdx >= 0) setCurrentSeasonIdx(firstIdx);
            })
            .catch(() => {})
            .finally(() => setSeasonsLoading(false));
        }
        triggerPrefetch(d.movie.contentType);
      })
      .catch((e) => setError((e as Error).message));
  }, [slug]);

  const triggerPrefetch = (contentType?: string) => {
    if (!contentType) return;
    const isTv = contentType === "tv";
    const epId = isTv ? seasons[currentSeasonIdx]?.episodes?.[0]?.id : undefined;
    const params = new URLSearchParams();
    if (isTv) params.set("type", "tv");
    if (epId) params.set("episodeId", epId);
    const qs = params.toString();
    fetch(`/api/prefetch/${slug}${qs ? "?" + qs : ""}`).catch(() => {});
  };

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

  if (error) return <div className="px-4 sm:px-10 py-20 text-center text-red-400">{error}</div>;
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
        onClose={() => setPlayerOpen(false)}
      />,
      document.body
    );
  }

  const isSaved = has(slug);
  const runtime = movie.runtime ? `${Math.floor(movie.runtime / 60)}j ${movie.runtime % 60}m` : "";
  const scoreLabel =
    movie.voteAverage && Number(movie.voteAverage) > 0
      ? `${Math.round(Number(movie.voteAverage) * 10)}% cocok`
      : "Rekomendasi";
  const isFilm = movie.contentType !== "tv";
  const castNames = movie.cast.slice(0, 3).map((c) => c.name).join(", ");
  const ageBadge = certification || "17+";

  // Watch progress
  const saved = progressMap[slug];
  const hasProgress = saved && saved.time > 10 && saved.duration > 0 && saved.time < saved.duration - 30;
  const progressPct = hasProgress ? Math.round((saved.time / saved.duration) * 100) : 0;
  const fmtTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const p = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  };

  return (
    <motion.div 
      className="relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Backdrop Hero */}
      <div className="relative">
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute inset-0"
            style={{ background: "linear-gradient(120deg, #3a0f1b 0%, #230b13 44%, #14080c 78%, #0a0507 100%)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />
          {movie.backdropPath && (
            <motion.img
              src={idlixImage(movie.backdropPath, "w1280")}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-30"
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.3 }}
              transition={{ duration: 1 }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: "repeating-linear-gradient(52deg, rgba(255,255,255,0.05) 0 10px, transparent 10px 22px)",
            }}
          />
          <div
            className="absolute right-[-60px] top-[-120px] w-[620px] h-[620px] rounded-full blur-[20px]"
            style={{ background: "radial-gradient(circle, rgba(255,52,74,0.42), transparent 66%)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(8,4,5,0.93) 4%, rgba(8,4,5,0.62) 44%, rgba(8,4,5,0.14) 76%), linear-gradient(0deg, #080405 2%, rgba(8,4,5,0.35) 42%, transparent 78%)",
            }}
          />
        </div>
        <div className="relative px-4 sm:px-6 lg:px-10 pt-[30px] sm:pt-[36px] pb-[26px] flex flex-col gap-[26px]">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <motion.div
              whileHover={{ x: -4 }}
              transition={{ duration: 0.2 }}
            >
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-[18px] py-[10px] rounded-full text-[13.5px] font-semibold text-white glass-button hover:bg-white/16 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali
              </Link>
            </motion.div>
          </motion.div>
          <div className="flex flex-col sm:flex-row gap-[22px] sm:gap-[34px] items-start sm:items-end">
            <motion.div
              className="relative w-full sm:w-[180px] lg:w-[214px] flex-none max-w-[214px] aspect-[2/3] rounded-[20px] overflow-hidden bg-gradient-to-br from-[#2a0a12] to-[#0e0608]"
              style={{
                border: "1px solid rgba(255,255,255,0.16)",
                boxShadow: "0 30px 70px -24px rgba(0,0,0,0.9)",
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              whileHover={{ scale: 1.02 }}
            >
              {movie.posterPath ? (
                <img src={idlixImage(movie.posterPath, "w342")} alt={movie.title} className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_8px,transparent_8px_18px)]" />
              )}
            </motion.div>
            <motion.div 
              className="flex flex-col gap-[17px] pb-[6px]"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="flex gap-[10px]">
                <span className="px-3 py-1.5 rounded-full text-[11.5px] font-bold tracking-[0.12em] accent-gradient">
                  {isFilm ? "FILM" : "SERIAL"}
                </span>
                <span
                  className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold backdrop-blur-[10px]"
                  style={{
                    background: "rgba(255,255,255,0.09)",
                    border: "1px solid rgba(255,255,255,0.16)",
                  }}
                >
                  {movie.genres?.[0]?.name || "Umum"}
                </span>
              </div>
              <h1
                className="sora font-extrabold leading-none tracking-[-0.03em] m-0"
                style={{ fontSize: "clamp(34px,4.2vw,58px)" }}
              >
                {movie.title}
              </h1>
              <div className="flex items-center gap-[14px] text-[14px] text-white/70">
                <span className="text-[#ff5566] font-bold">{scoreLabel}</span>
                <span>{yearOf(movie.releaseDate)}</span>
                <span
                  className="px-[7px] py-[2px] rounded-[5px] text-xs"
                  style={{ border: "1px solid rgba(255,255,255,0.28)" }}
                >
                  {ageBadge}
                </span>
                {runtime && <span>{runtime}</span>}
              </div>
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                <motion.button
                  onClick={() => startPlay()}
                  className="flex items-center gap-[10px] px-[30px] py-[15px] rounded-full text-[15.5px] font-bold text-white accent-gradient accent-shadow transition-all overflow-hidden relative group"
                  whileHover={{ scale: 1.05, boxShadow: "0 8px 24px rgba(225,29,46,0.4)" }}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.6 }}
                  />
                  {hasProgress ? (
                    <>
                      <Play className="w-5 h-5 relative z-10" fill="white" />
                      <span className="relative z-10">Lanjutkan dari {fmtTime(saved.time)}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 relative z-10" fill="white" />
                      <span className="relative z-10">Tonton Sekarang</span>
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
                  className="flex items-center gap-2 px-[24px] py-[15px] rounded-full text-[15px] font-semibold text-white glass-button transition-all"
                  style={{
                    background: isSaved ? "rgba(225,29,46,0.22)" : "rgba(255,255,255,0.08)",
                    borderColor: isSaved ? "rgba(255,90,110,0.45)" : "rgba(255,255,255,0.18)",
                  }}
                  whileHover={{ 
                    scale: 1.05,
                    boxShadow: isSaved ? "0 8px 24px rgba(225,29,46,0.3)" : "0 8px 24px rgba(255,255,255,0.1)"
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isSaved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {isSaved ? "Tersimpan" : "Daftar Saya"}
                </motion.button>
              </div>
              {hasProgress && (
                <div className="flex items-center gap-3 mt-1">
                  <div className="w-[200px] h-[4px] rounded-full overflow-hidden bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${progressPct}%`,
                        background: "linear-gradient(90deg, #e11d2e, #ff5566)",
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-white/40">
                    {fmtTime(saved.time)} / {fmtTime(saved.duration)} ({progressPct}%)
                  </span>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="px-4 sm:px-6 lg:px-10 py-[34px] pb-[80px] grid grid-cols-1 lg:grid-cols-[1.55fr_0.85fr] gap-[34px]">
        <div className="min-w-0 flex flex-col gap-[30px]">
          {movie.overview && (
            <p className="text-[16.5px] leading-[1.7] text-white/72 m-0" style={{ textWrap: "pretty" } as object}>
              {movie.overview}
            </p>
          )}

          {/* Episode List — TV series only, inside left column */}
          {!isFilm && (seasonsLoading || seasons.length > 0) && (() => {
            if (seasonsLoading) {
              return (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ff5566]"></div>
                </div>
              );
            }
            if (seasons.length === 0) return null;
            const currentSeason = seasons[currentSeasonIdx] ?? seasons[0];
            const eps = currentSeason?.episodes ?? [];
            return (
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-[14px]">
                  <h2 className="sora font-bold text-[20px] m-0">Episode</h2>
                  <span className="text-[13px] text-white/40">
                    Musim {currentSeason.seasonNumber} · {eps.length} episode
                  </span>
                </div>

                {/* Season tabs */}
                {seasons.length > 1 && (
                  <motion.div 
                    className="flex gap-[8px] mb-[14px] flex-wrap"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    {seasons.map((s, i) => (
                      <motion.button
                        key={s.id}
                        onClick={() => setCurrentSeasonIdx(i)}
                        className="px-[14px] py-[7px] rounded-full text-[12.5px] font-semibold transition-all"
                        style={
                          i === currentSeasonIdx
                            ? { background: "linear-gradient(135deg,#e11d2e,#ff5566)", color: "#fff" }
                            : {
                                background: "rgba(255,255,255,0.07)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "rgba(255,255,255,0.55)",
                              }
                        }
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Musim {s.seasonNumber}
                      </motion.button>
                    ))}
                  </motion.div>
                )}

                {/* Episode rows or empty state */}
                <AnimatePresence mode="wait">
                  {eps.length === 0 ? (
                    <motion.div 
                      className="p-[24px] rounded-[16px] text-center" 
                      style={{
                        background: "linear-gradient(135deg, rgba(80,15,25,0.3), rgba(12,5,8,0.6))",
                        border: "1px solid rgba(180,30,50,0.1)",
                      }}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <p className="text-[14px] text-white/50 m-0">
                        Episode untuk musim {currentSeason.seasonNumber} belum tersedia
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div 
                      className="flex flex-col gap-[6px]"
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
                          className="group/ep flex flex-col gap-[6px] p-[16px] rounded-[12px] text-left w-full cursor-pointer relative overflow-hidden"
                          style={{
                            background: "linear-gradient(135deg, rgba(80,15,25,0.5), rgba(12,5,8,0.85))",
                            border: "1px solid rgba(180,30,50,0.14)",
                          }}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: idx * 0.05 }}
                          whileHover={{ 
                            x: 4,
                            borderColor: "rgba(255,85,102,0.4)",
                            boxShadow: "0 4px 16px rgba(225,29,46,0.2)"
                          }}
                        >
                          {/* Play icon overlay on hover */}
                          <motion.div
                            className="absolute right-4 top-1/2 -translate-y-1/2"
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileHover={{ opacity: 1, scale: 1 }}
                          >
                            <div className="w-10 h-10 rounded-full bg-[#ff5566]/20 backdrop-blur-sm flex items-center justify-center border border-[#ff5566]/30">
                              <Play className="w-4 h-4 text-[#ff5566] ml-0.5" fill="#ff5566" />
                            </div>
                          </motion.div>

                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[14px] font-semibold leading-snug group-hover/ep:text-[#ff5566] transition-colors">
                              E{String(ep.episodeNumber).padStart(2, "0")}. {ep.name}
                            </span>
                            {ep.runtime > 0 && (
                              <span className="text-[12px] text-white/38 flex-none flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {ep.runtime}m
                              </span>
                            )}
                          </div>
                          {ep.overview && (
                            <p className="text-[12.5px] text-white/50 leading-[1.5] line-clamp-2 m-0 group-hover/ep:text-white/70 transition-colors">
                              {ep.overview}
                            </p>
                          )}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })()}

          {/* Cuplikan & klip (trailer asli) */}
          {videos.length > 0 && (
            <div>
              <h2 className="sora font-bold text-[21px] mb-[16px] m-0">Cuplikan &amp; klip</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[16px]">
                {videos.slice(0, 3).map((clip) => (
                  <a
                    key={clip.key}
                    href={`https://www.youtube.com/watch?v=${clip.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-[16px] overflow-hidden cursor-pointer transition-colors"
                    style={{
                      border: "1px solid rgba(255,255,255,0.11)",
                      background: "linear-gradient(150deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))",
                      backdropFilter: "blur(22px)",
                      WebkitBackdropFilter: "blur(22px)",
                    }}
                  >
                    <div className="relative aspect-video grid place-items-center bg-gradient-to-br from-[#2a0a12] to-[#100609]">
                      <img
                        src={`https://img.youtube.com/vi/${clip.key}/hqdefault.jpg`}
                        alt={clip.name}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover opacity-70"
                      />
                      <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_8px,transparent_8px_17px)]" />
                      <div
                        className="relative w-[42px] h-[42px] rounded-full grid place-items-center"
                        style={{
                          background: "rgba(255,255,255,0.14)",
                          border: "1px solid rgba(255,255,255,0.3)",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        <span className="w-0 h-0 border-l-[10px] border-l-white border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent ml-[3px]" />
                      </div>
                    </div>
                    <div className="px-[14px] py-[12px] flex flex-col gap-1">
                      <div className="text-[14px] font-semibold">{clip.name}</div>
                      <div className="text-[12.5px] text-white/45">Trailer resmi · YouTube</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Info Sidebar */}
        <div className="min-w-0 flex flex-col gap-[18px]">
          <div
            className="p-[24px] rounded-[22px] flex flex-col gap-[15px]"
            style={{
              background: "linear-gradient(150deg, rgba(255,255,255,0.11), rgba(255,255,255,0.035))",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(22px)",
              WebkitBackdropFilter: "blur(22px)",
              boxShadow: "0 22px 54px -26px rgba(0,0,0,0.85)",
            }}
          >
            <div className="text-[11px] tracking-[0.16em] font-bold text-white/45">INFORMASI</div>
            <div className="flex flex-col gap-3 text-[14px]">
              {movie.director && (
                <div className="flex justify-between gap-[14px]">
                  <span className="text-white/45 flex-none">Sutradara</span>
                  <span className="text-right">{movie.director}</span>
                </div>
              )}
              {castNames && (
                <div className="flex justify-between gap-[14px]">
                  <span className="text-white/45 flex-none">Pemeran</span>
                  <span className="text-right">{castNames}</span>
                </div>
              )}
              {movie.genres.length > 0 && (
                <div className="flex justify-between gap-[14px]">
                  <span className="text-white/45 flex-none">Genre</span>
                  <span className="text-right">{movie.genres.map((g) => g.name).join(", ")}</span>
                </div>
              )}
              {movie.country && (
                <div className="flex justify-between gap-[14px]">
                  <span className="text-white/45 flex-none">Negara</span>
                  <span className="text-right">{movie.country}</span>
                </div>
              )}
              {languages.length > 0 && (
                <div className="flex justify-between gap-[14px]">
                  <span className="text-white/45">Audio</span>
                  <span className="text-right">{languages.join(", ")}</span>
                </div>
              )}
              <div className="flex justify-between gap-[14px]">
                <span className="text-white/45">Subtitel</span>
                <span className="text-right">ID, EN</span>
              </div>
              <div className="flex justify-between gap-[14px]">
                <span className="text-white/45 flex-none">Rilis</span>
                <span className="text-right">{yearOf(movie.releaseDate)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </motion.div>
  );
}