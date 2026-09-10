"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, Loader2, Star, Clapperboard, Tv, Layers, Globe, TrendingUp, Clock } from "lucide-react";
import { idlixImage, yearOf } from "@/lib/media";
import type { MovieListItem } from "@/lib/types";
import PageLoader from "@/components/PageLoader";

interface GenreChip {
  id: number;
  name: string;
  count?: number;
}

type MediaType = "all" | "movie" | "tv";

const TYPE_TABS: { key: MediaType; label: string; icon: typeof Layers }[] = [
  { key: "all", label: "Semua", icon: Layers },
  { key: "movie", label: "Film", icon: Clapperboard },
  { key: "tv", label: "Series", icon: Tv },
];

const GENRE_NAMES: Record<string, string> = {
  action: "Aksi", adventure: "Petualangan", animation: "Animasi", comedy: "Komedi",
  crime: "Kejahatan", documentary: "Dokumenter", drama: "Drama", family: "Keluarga",
  fantasy: "Fantasi", history: "Sejarah", horror: "Horor", kids: "Anak",
  music: "Musik", mystery: "Misteri", reality: "Reality", romance: "Romantis",
  "science-fiction": "Sci-Fi", soap: "Sinetron", talk: "Talk Show",
  thriller: "Thriller", "tv-movie": "Film TV",
  war: "Perang", western: "Barat",
};

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

const COUNTRIES = Object.keys(COUNTRY_NAMES).map((slug) => ({ slug, name: COUNTRY_NAMES[slug] }));

export default function JelajahiPage() {
  return (
    <Suspense
      fallback={<PageLoader />}
    >
      <JelajahiContent />
    </Suspense>
  );
}

function JelajahiContent() {
  const searchParams = useSearchParams();
  const genreParam = searchParams.get("genre");
  const qParam = searchParams.get("q");

  const [genres, setGenres] = useState<GenreChip[]>([]);
  const [query, setQuery] = useState(() => qParam?.trim() ?? "");
  const [mediaType, setMediaType] = useState<MediaType>("all");
  const [sort, setSort] = useState<"popular" | "latest">("popular");
  const [activeGenre, setActiveGenre] = useState<string | null>(genreParam ?? null);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);

  const [items, setItems] = useState<(MovieListItem & { overview?: string })[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/stats`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.genres)) {
          setGenres(d.genres.map((g: { id: string; name: string; count: number }) => ({
            id: typeof g.id === "string" ? g.id : String(g.id),
            name: g.name,
            count: g.count,
          })));
        }
      })
      .catch(() => {});
  }, []);

  const buildBrowseUrl = useCallback((pg: number) => {
    const list = sort === "popular" ? "idlix_popular" : "idlix_latest";
    const params = new URLSearchParams({ list, page: String(pg), limit: "60", type: mediaType });
    if (activeGenre) params.set("genre", activeGenre);
    if (activeCountry) params.set("country", activeCountry);
    return `/api/movies?${params.toString()}`;
  }, [sort, mediaType, activeGenre, activeCountry]);

  const loadBrowse = useCallback(async (nextPage: number, replace = true) => {
    setLoadingBrowse(true);
    setError("");
    try {
      const res = await fetch(buildBrowseUrl(nextPage));
      if (!res.ok) throw new Error("gagal memuat katalog");
      const d = await res.json();
      const items = (d.data || []) as (MovieListItem & { overview?: string })[];
      setItems((prev) => (replace ? items : [...prev, ...items]));
      setTotal(d.pagination?.total ?? 0);
      setTotalPages(d.pagination?.totalPages ?? 1);
      setPage(nextPage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingBrowse(false);
    }
  }, [buildBrowseUrl]);

  useEffect(() => {
    if (query.trim()) return;
    let cancelled = false;
    setItems([]);
    setPage(0);
    setInitialLoading(true);
    fetch(buildBrowseUrl(1))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("gagal memuat katalog"))))
      .then((d: { data?: unknown[]; pagination?: { total?: number; totalPages?: number } }) => {
        if (cancelled) return;
        const all = (d.data || []) as (MovieListItem & { overview?: string })[];
        setItems(all);
        setTotal(d.pagination?.total ?? 0);
        setTotalPages(d.pagination?.totalPages ?? 1);
        setPage(1);
        setInitialLoading(false);
      })
      .catch((e) => {
        if (!cancelled) { setError((e as Error).message); setInitialLoading(false); }
      });
    return () => {
      cancelled = true;
    };
  }, [query, buildBrowseUrl]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const timer = setTimeout(async () => {
      setInitialLoading(false);
      setSearching(true);
      setError("");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${mediaType}`);
        if (!res.ok) throw new Error("gagal mencari");
        const d = await res.json();
        setItems(d.results || []);
        setTotal(d.pagination?.total ?? d.results?.length ?? 0);
      } catch (e) {
        setError((e as Error).message);
        setItems([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, mediaType]);

  const switchType = (t: MediaType) => {
    if (t === mediaType) return;
    setQuery("");
    setMediaType(t);
  };

  const switchSort = (s: "popular" | "latest") => {
    if (s === sort) return;
    setQuery("");
    setSort(s);
  };

  const switchCountry = (slug: string | null) => {
    setQuery("");
    setActiveCountry(slug);
  };

  const activeGenreName = activeGenre ? (GENRE_NAMES[activeGenre] || activeGenre) : undefined;
  const activeCountryName = activeCountry ? (COUNTRY_NAMES[activeCountry] || activeCountry) : undefined;

  const heading = query.trim()
    ? `Hasil untuk "${query}"`
    : (() => {
        const parts: string[] = [];
        if (activeGenreName) parts.push(activeGenreName);
        if (activeCountryName) parts.push(activeCountryName);
        const typeLabel = mediaType === "movie" ? "Film" : mediaType === "tv" ? "Series" : "";
        if (parts.length > 0) {
          return [typeLabel, ...parts].filter(Boolean).join(" ");
        }
        return typeLabel || "Semua judul";
      })();

  if (initialLoading) return <PageLoader />;

  return (
    <div className="relative px-4 sm:px-6 lg:px-10 pt-[38px] pb-24">
      {/* Hero Header */}
      <motion.section
        className="relative overflow-hidden rounded-[26px] glass-panel px-6 sm:px-9 pt-8 sm:pt-10 pb-7 sm:pb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div
          className="absolute top-[-90px] right-[-70px] w-[340px] h-[340px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(225,29,46,0.22), transparent 68%)" }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.32em] text-[#ff5566]">
            <span className="w-[26px] h-[1.5px] rounded-full bg-[#ff5566]/70" />
            EKSPLORASI
          </div>
          <h1 className="sora font-extrabold text-[30px] sm:text-[38px] leading-[1.08] mt-[12px]">
            Jelajahi{" "}
            <span
              style={{
                background: "linear-gradient(120deg, #ff5566 10%, #e11d2e 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Katalog
            </span>
          </h1>
          <p className="text-[14.5px] sm:text-[15.5px] text-white/55 mt-[10px] max-w-[560px] leading-relaxed">
            Temukan film dan serial dari IDLIX serta NgeFilm — saring berdasarkan genre, negara, atau cari judul favoritmu.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-[18px]">
            <span className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[12.5px] font-semibold text-white/75 bg-white/6 border border-white/12">
              <Layers className="w-3.5 h-3.5 text-[#ff5566]" />
              {total.toLocaleString("id-ID")} judul
            </span>
            <span className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[12.5px] font-semibold text-white/75 bg-white/6 border border-white/12">
              <Clapperboard className="w-3.5 h-3.5 text-[#ff5566]" />
              {genres.length} genre
            </span>
            <span className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[12.5px] font-semibold text-white/75 bg-white/6 border border-white/12">
              <Globe className="w-3.5 h-3.5 text-[#ff5566]" />
              {COUNTRIES.length} negara
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative group flex items-center gap-[14px] px-5 py-[15px] rounded-[18px] mt-[22px] transition-all duration-300 bg-white/6 border border-white/12 backdrop-blur-xl focus-within:bg-white/8 focus-within:border-[#ff5566]/40 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.9)]">
            <Search className="w-5 h-5 text-white/45 flex-none transition-colors duration-300 group-focus-within:text-[#ff5566]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari judul, aktor, atau genre…"
              className="flex-1 py-1 text-[16.5px] text-white bg-transparent border-none focus:outline-none placeholder:text-white/40"
            />

            <AnimatePresence mode="wait">
              {searching && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2"
                >
                  <Loader2 className="w-4 h-4 text-[#ff5566] animate-spin" />
                  <span className="text-[13px] text-white/40">Mencari...</span>
                </motion.div>
              )}

              {!searching && query.trim() && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setQuery("")}
                  className="p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-4 h-4 text-white/50" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.section>

      {/* Sticky Filter Panel */}
      <motion.div
        className="sticky top-[80px] z-30 mt-5 rounded-[20px] px-4 sm:px-6 py-[18px] shadow-[0_26px_60px_-30px_rgba(0,0,0,0.9)]"
        style={{
          background: "rgba(11,5,7,0.97)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(22px) saturate(150%)",
          WebkitBackdropFilter: "blur(22px) saturate(150%)",
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
      >
        {/* Top row: Type + Sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-[3px] rounded-[11px] bg-white/[0.04] border border-white/[0.08]">
            {TYPE_TABS.map((tab) => {
              const active = mediaType === tab.key;
              const Icon = tab.icon;
              return (
                <motion.button
                  key={tab.key}
                  onClick={() => switchType(tab.key)}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-[7px] rounded-[9px] text-[12.5px] font-semibold cursor-pointer transition-all whitespace-nowrap"
                  style={{
                    color: active ? "#fff" : "rgba(255,255,255,0.55)",
                    background: active ? "linear-gradient(135deg, #e11d2e, #91091a)" : "transparent",
                    boxShadow: active ? "0 4px 16px -6px rgba(225,29,46,0.5)" : "none",
                  }}
                  whileTap={{ scale: 0.96 }}
                >
                  <Icon className={`w-[14px] h-[14px] ${active ? "text-white" : "text-white/40"}`} />
                  {tab.label}
                </motion.button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 p-[3px] rounded-[11px] bg-white/[0.04] border border-white/[0.08]">
            {(
              [
                { key: "popular", label: "Populer", icon: TrendingUp },
                { key: "latest", label: "Terbaru", icon: Clock },
              ] as const
            ).map((opt) => {
              const active = sort === opt.key;
              const Icon = opt.icon;
              return (
                <motion.button
                  key={opt.key}
                  onClick={() => switchSort(opt.key)}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-[7px] rounded-[9px] text-[12.5px] font-semibold cursor-pointer transition-all whitespace-nowrap"
                  style={{
                    color: active ? "#fff" : "rgba(255,255,255,0.55)",
                    background: active ? "linear-gradient(135deg, #e11d2e, #91091a)" : "transparent",
                    boxShadow: active ? "0 4px 16px -6px rgba(225,29,46,0.5)" : "none",
                  }}
                  whileTap={{ scale: 0.96 }}
                >
                  <Icon className={`w-[14px] h-[14px] ${active ? "text-white" : "text-white/40"}`} />
                  {opt.label}
                </motion.button>
              );
            })}
          </div>

          {/* Active filter tags */}
          {(activeGenre || activeCountry) && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => { setActiveGenre(null); setActiveCountry(null); }}
              className="flex items-center gap-1 px-2.5 py-[6px] rounded-full text-[11px] font-semibold text-white/50 hover:text-white/80 bg-white/[0.04] border border-white/[0.08] cursor-pointer transition-colors ml-auto"
            >
              <X className="w-3 h-3" />
              Reset filter
            </motion.button>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06] my-3" />

        {/* Genre row */}
        <div className="flex items-center gap-2.5">
          <span className="flex-none w-[52px] text-[10px] font-bold tracking-[0.16em] text-white/30 uppercase text-right">
            Genre
          </span>
          <div className="relative flex-1 min-w-0">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {[{ slug: null as string | null, label: "Semua" }, ...(["action", "adventure", "animation", "comedy", "crime", "drama", "fantasy", "horror", "mystery", "romance", "thriller", "science-fiction", "family", "war", "history"]).map(s => ({ slug: s, label: GENRE_NAMES[s] || s }))].map((item) => {
                const active = activeGenre === item.slug;
                return (
                  <button
                    key={item.slug ?? "all"}
                    onClick={() => {
                      setQuery("");
                      setActiveGenre(item.slug);
                    }}
                    className="flex-none px-3 py-[5px] rounded-[8px] text-[12px] font-medium cursor-pointer transition-all whitespace-nowrap"
                    style={{
                      color: active ? "#fff" : "rgba(255,255,255,0.55)",
                      background: active ? "rgba(225,29,46,0.9)" : "rgba(255,255,255,0.04)",
                      boxShadow: active ? "0 2px 10px -4px rgba(225,29,46,0.5)" : "none",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Country row */}
        <div className="flex items-center gap-2.5 mt-2">
          <span className="flex-none w-[52px] text-[10px] font-bold tracking-[0.16em] text-white/30 uppercase text-right">
            Negara
          </span>
          <div className="relative flex-1 min-w-0">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {[{ slug: null as string | null, name: "Semua" }, ...COUNTRIES].map((item) => {
                const active = activeCountry === item.slug;
                return (
                  <button
                    key={item.slug ?? "all"}
                    onClick={() => switchCountry(item.slug)}
                    className="flex-none px-3 py-[5px] rounded-[8px] text-[12px] font-medium cursor-pointer transition-all whitespace-nowrap"
                    style={{
                      color: active ? "#fff" : "rgba(255,255,255,0.55)",
                      background: active ? "rgba(225,29,46,0.9)" : "rgba(255,255,255,0.04)",
                      boxShadow: active ? "0 2px 10px -4px rgba(225,29,46,0.5)" : "none",
                    }}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Results Heading */}
      <div className="flex items-center justify-between gap-4 mt-[30px] mb-[16px]">
        <h2 className="sora font-bold text-[20px] sm:text-[22px]">{heading}</h2>
        {!query.trim() && total > 0 && (
          <span className="flex-none px-3 py-[5px] rounded-full text-[12.5px] font-semibold text-white/60 bg-white/6 border border-white/10">
            {total.toLocaleString("id-ID")} judul
          </span>
        )}
      </div>

      {/* Results Grid */}
      <AnimatePresence mode="wait">
        {error ? (
          <motion.div 
            className="py-[70px] text-center text-red-400 text-[14.5px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.div>
        ) : loadingBrowse && items.length === 0 ? (
          <motion.div 
            className="py-[70px] text-center flex flex-col items-center gap-3 text-white/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 className="w-8 h-8 text-[#ff5566] animate-spin" />
            <span className="text-sm">Memuat...</span>
          </motion.div>
        ) : items.length === 0 ? (
          <motion.div 
            className="py-[70px] text-center flex flex-col items-center gap-[14px]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="w-[64px] h-[64px] rounded-[20px] grid place-items-center bg-white/6 border border-white/10">
              <Search className="w-7 h-7 text-white/35" />
            </div>
            <div className="sora font-bold text-[20px]">
              {query.trim() ? `Tidak ada hasil untuk "${query}"` : "Belum ada judul"}
            </div>
            <div className="text-[14.5px] text-white/50">Coba kata kunci lain atau pilih salah satu filter di atas.</div>
          </motion.div>
        ) : (          <motion.div
            key={query.trim() || activeGenre || "all"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-[22px]">
              {items.map((movie, idx) => {
                const isSeries = movie.slug?.startsWith("tv-") || movie.isSeries === true;
                const rating = movie.voteAverage ? Number(movie.voteAverage) : 0;
                const ratingLabel = rating > 0 ? rating.toFixed(1) : null;
                return (
                  <motion.div
                    key={movie.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    whileHover={{ y: -6 }}
                  >
                    <Link
                      href={`/movie/${movie.slug}`}
                      className="group flex flex-col gap-[10px] cursor-pointer"
                    >
                      <div
                        className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-gradient-to-br from-[#2a0a12] to-[#0e0608] transition-all"
                        style={{
                          border: "1px solid rgba(255,255,255,0.10)",
                          boxShadow: "0 18px 44px -20px rgba(0,0,0,0.85)",
                        }}
                      >
                        {movie.posterPath ? (
                          <img
                            src={idlixImage(movie.posterPath, "w342")}
                            alt={movie.title}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_8px,transparent_8px_18px)]" />
                        )}

                        {/* Type badge — top right */}
                        <span
                          className="absolute top-[10px] right-[10px] px-[7px] py-[3px] rounded-full text-[9px] font-bold tracking-[0.1em] whitespace-nowrap text-white group-hover:text-[#ff5566] transition-colors"
                          style={{
                            background: "rgba(10,4,6,0.72)",
                            border: "1px solid rgba(255,255,255,0.18)",
                            backdropFilter: "blur(10px)",
                          }}
                        >
                          {isSeries ? "SERIES" : "FILM"}
                        </span>

                        {/* Rating badge — bottom left */}
                        {ratingLabel && (
                          <div
                            className="absolute bottom-[10px] left-[10px] flex items-center gap-[4px] px-[8px] py-[4px] rounded-full text-[11px] font-bold transition-colors"
                            style={{
                              background: "rgba(10,4,6,0.78)",
                              border: "1px solid rgba(255,255,255,0.16)",
                              backdropFilter: "blur(10px)",
                            }}
                          >
                            <Star className="w-3 h-3 text-[#fbbf24] fill-[#fbbf24]" />
                            <span className="text-white group-hover:text-[#ff5566] transition-colors">{ratingLabel}</span>
                          </div>
                        )}
                      </div>

                      {/* Title */}
                      <div className="sora font-semibold text-[14px] leading-tight text-white group-hover:text-[#ff5566] transition-colors line-clamp-2">
                        {movie.title}
                      </div>

                      {/* Genre · Year */}
                      <div className="text-[12px] text-white/50 group-hover:text-[#ff5566]/70 transition-colors flex items-center gap-[6px]">
                        <span>{movie.genres?.[0]?.name || (isSeries ? "Series" : "Film")}</span>
                        {movie.releaseDate && (
                          <>
                            <span className="w-[3px] h-[3px] rounded-full bg-current inline-block" />
                            <span>{yearOf(movie.releaseDate)}</span>
                          </>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            {!query.trim() && page < totalPages && (
              <motion.div 
                className="flex justify-center mt-[38px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <motion.button
                  onClick={() => loadBrowse(page + 1, false)}
                  disabled={loadingBrowse}
                  className="flex items-center gap-2 px-[30px] py-[14px] rounded-full text-[14.5px] font-bold text-white accent-gradient accent-shadow transition-all disabled:opacity-50 cursor-pointer"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {loadingBrowse ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Memuat...
                    </>
                  ) : (
                    "Muat lebih banyak"
                  )}
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}