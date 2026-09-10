"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, Loader2, Star, Clapperboard, Tv, Layers, Globe, TrendingUp, Clock, Database } from "lucide-react";
import { idlixImage, yearOf } from "@/lib/media";
import type { MovieListItem } from "@/lib/types";
import type { ContentSource } from "@/lib/catalog";
import PageLoader from "@/components/PageLoader";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type MediaType = "all" | "movie" | "tv";

const TYPE_TABS: { key: MediaType; label: string; icon: typeof Layers }[] = [
  { key: "all", label: "Semua", icon: Layers },
  { key: "movie", label: "Film", icon: Clapperboard },
  { key: "tv", label: "Series", icon: Tv },
];

const SOURCE_TABS: { key: ContentSource; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "idlix", label: "IDLIX" },
  { key: "ngefilm", label: "NgeFilm" },
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

interface GenreInfo {
  id: string;
  name: string;
  slug: string;
  count: number;
}

interface CountryInfo {
  code: string;
  name: string;
  count: number;
}

// ---------------------------------------------------------------------------
// URL sync helper
// ---------------------------------------------------------------------------

function syncUrl(
  pathname: string,
  current: URLSearchParams,
  overrides: Record<string, string | null>
) {
  const params = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(overrides)) {
    // Remove params that equal the default value
    if (v === null || v === "") {
      params.delete(k);
    } else if (
      (k === "type" && v === "all") ||
      (k === "sort" && v === "popular") ||
      (k === "source" && v === "all")
    ) {
      params.delete(k);
    } else {
      params.set(k, v);
    }
  }
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JelajahiPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <JelajahiContent />
    </Suspense>
  );
}

function JelajahiContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Read all filters from URL on init
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [mediaType, setMediaType] = useState<MediaType>(
    () => (searchParams.get("type") as MediaType) || "all"
  );
  const [sort, setSort] = useState<"popular" | "latest">(
    () => (searchParams.get("sort") as "popular" | "latest") || "popular"
  );
  const [activeGenre, setActiveGenre] = useState<string | null>(
    () => searchParams.get("genre") || null
  );
  const [activeCountry, setActiveCountry] = useState<string | null>(
    () => searchParams.get("country") || null
  );
  const [source, setSource] = useState<ContentSource>(
    () => (searchParams.get("source") as ContentSource) || "all"
  );

  // Data state
  const [genres, setGenres] = useState<GenreInfo[]>([]);
  const [countries, setCountries] = useState<CountryInfo[]>([]);
  const [items, setItems] = useState<MovieListItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [scrolled, setScrolled] = useState(false);

  // Fetch genres & countries from full catalog stats
  useEffect(() => {
    fetch("/api/catalog/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok !== false) {
          if (Array.isArray(d.genres)) setGenres(d.genres);
          if (Array.isArray(d.countries)) setCountries(d.countries);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Build a single unified browse URL
  const buildBrowseUrl = useCallback(
    (pg: number) => {
      const params = new URLSearchParams({
        sort,
        page: String(pg),
        limit: "60",
        type: mediaType,
        source,
      });
      if (activeGenre) params.set("genre", activeGenre);
      if (activeCountry) params.set("country", activeCountry);
      return `/api/catalog/browse?${params}`;
    },
    [sort, mediaType, activeGenre, activeCountry, source]
  );

  // Load more (append)
  const loadBrowse = useCallback(
    async (nextPage: number, replace = true) => {
      setLoadingBrowse(true);
      setError("");
      try {
        const res = await fetch(buildBrowseUrl(nextPage));
        if (!res.ok) throw new Error("gagal memuat katalog");
        const d = await res.json();
        const newItems = (d.data || []) as MovieListItem[];
        setItems((prev) => (replace ? newItems : [...prev, ...newItems]));
        setTotal(d.pagination?.total ?? 0);
        setTotalPages(d.pagination?.totalPages ?? 1);
        setPage(nextPage);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingBrowse(false);
      }
    },
    [buildBrowseUrl]
  );

  // Initial load & filter change → single API call
  useEffect(() => {
    if (query.trim()) return;
    let cancelled = false;
    setItems([]);
    setPage(0);
    setInitialLoading(true);

    fetch(buildBrowseUrl(1))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("gagal memuat katalog"))))
      .then((d) => {
        if (cancelled) return;
        setItems((d.data || []) as MovieListItem[]);
        setTotal(d.pagination?.total ?? 0);
        setTotalPages(d.pagination?.totalPages ?? 1);
        setPage(1);
        setInitialLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError((e as Error).message);
          setInitialLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [query, buildBrowseUrl]);

  // Search with debounce
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const timer = setTimeout(async () => {
      setInitialLoading(false);
      setSearching(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q, type: mediaType, source,
        });
        const res = await fetch(`/api/catalog/search?${params}`);
        if (!res.ok) throw new Error("gagal mencari");
        const d = await res.json();
        setItems(d.data || []);
        setTotal(d.pagination?.total ?? d.data?.length ?? 0);
      } catch (e) {
        setError((e as Error).message);
        setItems([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, mediaType, source]);

  // Filter setters that also sync URL
  const switchType = (t: MediaType) => {
    if (t === mediaType) return;
    setQuery("");
    setMediaType(t);
    syncUrl(pathname, searchParams, { type: t, q: null });
  };

  const switchSort = (s: "popular" | "latest") => {
    if (s === sort) return;
    setQuery("");
    setSort(s);
    syncUrl(pathname, searchParams, { sort: s, q: null });
  };

  const switchSource = (s: ContentSource) => {
    if (s === source) return;
    setQuery("");
    setSource(s);
    // NgeFilm only has ID content → auto-set country
    const countryOverride = s === "ngefilm" ? "ID" : activeCountry;
    const genreOverride = s === "ngefilm" ? null : activeGenre;
    if (s === "ngefilm") {
      setActiveCountry("ID");
      setActiveGenre(null);
    }
    syncUrl(pathname, searchParams, {
      source: s,
      q: null,
      country: countryOverride,
      genre: genreOverride,
    });
  };

  const switchGenre = (slug: string | null) => {
    setQuery("");
    setActiveGenre(slug);
    syncUrl(pathname, searchParams, { genre: slug, q: null });
  };

  const switchCountry = (code: string | null) => {
    setQuery("");
    setActiveCountry(code);
    syncUrl(pathname, searchParams, { country: code, q: null });
  };

  const handleQueryChange = (q: string) => {
    setQuery(q);
    syncUrl(pathname, searchParams, { q: q.trim() || null });
  };

  const resetFilters = () => {
    setActiveGenre(null);
    setActiveCountry(null);
    setSource("all");
    syncUrl(pathname, searchParams, {
      genre: null,
      country: null,
      source: null,
    });
  };

  // Derived values
  const activeGenreName = activeGenre ? (GENRE_NAMES[activeGenre] || genres.find((g) => g.slug === activeGenre)?.name || activeGenre) : undefined;
  const activeCountryName = activeCountry ? (COUNTRY_NAMES[activeCountry] || activeCountry) : undefined;

  const heading = query.trim()
    ? `Hasil untuk "${query}"`
    : (() => {
        const parts: string[] = [];
        if (activeGenreName) parts.push(activeGenreName);
        if (activeCountryName) parts.push(activeCountryName);
        const typeLabel = mediaType === "movie" ? "Film" : mediaType === "tv" ? "Series" : "";
        if (parts.length > 0) return [typeLabel, ...parts].filter(Boolean).join(" ");
        return typeLabel || "Semua judul";
      })();

  // Genre options from catalog (or fallback hardcoded list)
  const genreOptions = useMemo(() => {
    if (genres.length > 0) {
      return genres.map((g) => ({
        slug: g.slug,
        name: GENRE_NAMES[g.slug] || g.name,
        count: g.count,
      }));
    }
    // Fallback
    return ["action", "adventure", "animation", "comedy", "crime", "drama", "fantasy", "horror", "mystery", "romance", "thriller", "science-fiction", "family", "war", "history"].map((s) => ({
      slug: s,
      name: GENRE_NAMES[s] || s,
      count: 0,
    }));
  }, [genres]);

  // Country options: merge catalog countries with static list
  const countryOptions = useMemo(() => {
    if (countries.length > 0) {
      return countries.map((c) => ({
        code: c.code,
        name: COUNTRY_NAMES[c.code] || c.name || c.code,
      }));
    }
    return Object.entries(COUNTRY_NAMES).map(([code, name]) => ({ code, name }));
  }, [countries]);

  const hasActiveFilters = !!(activeGenre || activeCountry || source !== "all");

  if (initialLoading) return <PageLoader />;

  return (
    <div className="relative px-4 sm:px-6 lg:px-10 pt-[38px] pb-24">
      {/* Hero Header - Collapsible */}
      <motion.section
        className="relative overflow-hidden rounded-[26px] glass-panel px-6 sm:px-9 pb-7 sm:pb-8 transition-all duration-500"
        style={{ paddingTop: scrolled ? "1.5rem" : "2rem" }}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0, height: scrolled ? "auto" : "auto" }}
        transition={{ duration: 0.5 }}
      >
        <div
          className="absolute top-[-90px] right-[-70px] w-[340px] h-[340px] rounded-full pointer-events-none transition-opacity duration-500"
          style={{
            background: "radial-gradient(circle, rgba(225,29,46,0.22), transparent 68%)",
            opacity: scrolled ? 0 : 1,
          }}
        />
        <div className="relative">
          <motion.div
            className="flex items-center gap-2 text-[11px] font-bold tracking-[0.32em] text-[#ff5566]"
            animate={{ opacity: scrolled ? 0 : 1, height: scrolled ? 0 : "auto" }}
            transition={{ duration: 0.3 }}
          >
            <span className="w-[26px] h-[1.5px] rounded-full bg-[#ff5566]/70" />
            EKSPLORASI
          </motion.div>
          <motion.h1
            className="sora font-extrabold leading-[1.08]"
            animate={{ fontSize: scrolled ? "1.5rem" : "2.375rem", marginTop: scrolled ? "0" : "0.75rem" }}
            transition={{ duration: 0.3 }}
          >
            Jelajahi{" "}
            <span style={{ background: "linear-gradient(120deg, #ff5566 10%, #e11d2e 90%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              Katalog
            </span>
          </motion.h1>
          <motion.p
            className="text-[14.5px] sm:text-[15.5px] text-white/55 max-w-[560px] leading-relaxed overflow-hidden"
            animate={{ opacity: scrolled ? 0 : 1, height: scrolled ? 0 : "auto", marginTop: scrolled ? 0 : "0.625rem" }}
            transition={{ duration: 0.3 }}
          >
            Temukan film dan serial dari IDLIX serta NgeFilm — saring berdasarkan genre, negara, sumber, atau cari judul favoritmu.
          </motion.p>

          <motion.div
            className="flex flex-wrap items-center gap-2 overflow-hidden"
            animate={{ opacity: scrolled ? 0 : 1, height: scrolled ? 0 : "auto", marginTop: scrolled ? 0 : "1.125rem" }}
            transition={{ duration: 0.3 }}
          >
            <span className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[12.5px] font-semibold text-white/75 bg-white/6 border border-white/12">
              <Layers className="w-3.5 h-3.5 text-[#ff5566]" />
              {total.toLocaleString("id-ID")} judul
            </span>
            <span className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[12.5px] font-semibold text-white/75 bg-white/6 border border-white/12">
              <Clapperboard className="w-3.5 h-3.5 text-[#ff5566]" />
              {genreOptions.length} genre
            </span>
            <span className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[12.5px] font-semibold text-white/75 bg-white/6 border border-white/12">
              <Globe className="w-3.5 h-3.5 text-[#ff5566]" />
              {countryOptions.length} negara
            </span>
          </motion.div>

          {/* Search Bar */}
          <motion.div
            className="relative group flex items-center gap-[14px] px-5 rounded-[18px] transition-all duration-300 bg-white/6 border border-white/12 backdrop-blur-xl focus-within:bg-white/8 focus-within:border-[#ff5566]/40 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.9)]"
            animate={{ paddingTop: scrolled ? "0.625rem" : "0.9375rem", paddingBottom: scrolled ? "0.625rem" : "0.9375rem", marginTop: scrolled ? "0.75rem" : "1.375rem" }}
            transition={{ duration: 0.3 }}
          >
            <Search className="w-5 h-5 text-white/45 flex-none transition-colors duration-300 group-focus-within:text-[#ff5566]" />
            <input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Cari judul, aktor, atau genre…"
              className="flex-1 py-1 text-[16.5px] text-white bg-transparent border-none focus:outline-none placeholder:text-white/40"
            />
            <AnimatePresence mode="wait">
              {searching && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-[#ff5566] animate-spin" />
                  <span className="text-[13px] text-white/40">Mencari...</span>
                </motion.div>
              )}
              {!searching && query.trim() && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => handleQueryChange("")}
                  className="p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                >
                  <X className="w-4 h-4 text-white/50" />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </motion.section>

      {/* Genre & Country Filters */}
      <motion.div
        className="mt-5 rounded-[20px] px-4 sm:px-6 py-[18px] shadow-[0_26px_60px_-30px_rgba(0,0,0,0.9)]"
        style={{ background: "rgba(11,5,7,0.97)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(22px) saturate(150%)", WebkitBackdropFilter: "blur(22px) saturate(150%)" }}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {/* Genre dropdown */}
          {source !== "ngefilm" && (
            <div className="flex items-center gap-2 flex-1 min-w-[140px]">
              <span className="flex-none text-[10px] font-bold tracking-[0.16em] text-white/30 uppercase">Genre</span>
              <select
                value={activeGenre ?? ""}
                onChange={(e) => switchGenre(e.target.value || null)}
                className="flex-1 bg-white/[0.04] text-white/80 text-[13px] px-3 py-[7px] rounded-[8px] cursor-pointer appearance-none outline-none focus:ring-1 focus:ring-[#e11d2e]/40 transition-all"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <option value="" className="bg-[#1c0a10]">Semua Genre</option>
                {genreOptions.map((g) => (
                  <option key={g.slug} value={g.slug} className="bg-[#1c0a10]">
                    {g.name}{g.count > 0 ? ` (${g.count})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Country dropdown */}
          <div className="flex items-center gap-2 flex-1 min-w-[140px]">
            <span className="flex-none text-[10px] font-bold tracking-[0.16em] text-white/30 uppercase">Negara</span>
            <select
              value={activeCountry ?? ""}
              onChange={(e) => switchCountry(e.target.value || null)}
              disabled={source === "ngefilm"}
              className="flex-1 bg-white/[0.04] text-white/80 text-[13px] px-3 py-[7px] rounded-[8px] cursor-pointer appearance-none outline-none focus:ring-1 focus:ring-[#e11d2e]/40 transition-all disabled:opacity-50"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <option value="" className="bg-[#1c0a10]">Semua Negara</option>
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code} className="bg-[#1c0a10]">{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Sticky Filter Panel - Type + Sort + Source */}
      <motion.div
        className="sticky top-[80px] z-30 mt-5 rounded-[20px] px-4 sm:px-6 py-[18px] shadow-[0_26px_60px_-30px_rgba(0,0,0,0.9)]"
        style={{ background: "rgba(11,5,7,0.97)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(22px) saturate(150%)", WebkitBackdropFilter: "blur(22px) saturate(150%)" }}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type tabs */}
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

          {/* Sort tabs */}
          <div className="flex items-center gap-1 p-[3px] rounded-[11px] bg-white/[0.04] border border-white/[0.08]">
            {([
              { key: "popular", label: "Populer", icon: TrendingUp },
              { key: "latest", label: "Terbaru", icon: Clock },
            ] as const).map((opt) => {
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

          {/* Source tabs */}
          <div className="flex items-center gap-1 p-[3px] rounded-[11px] bg-white/[0.04] border border-white/[0.08]">
            {SOURCE_TABS.map((tab) => {
              const active = source === tab.key;
              return (
                <motion.button
                  key={tab.key}
                  onClick={() => switchSource(tab.key)}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-[7px] rounded-[9px] text-[12.5px] font-semibold cursor-pointer transition-all whitespace-nowrap"
                  style={{
                    color: active ? "#fff" : "rgba(255,255,255,0.55)",
                    background: active ? "linear-gradient(135deg, #e11d2e, #91091a)" : "transparent",
                    boxShadow: active ? "0 4px 16px -6px rgba(225,29,46,0.5)" : "none",
                  }}
                  whileTap={{ scale: 0.96 }}
                >
                  <Database className={`w-[14px] h-[14px] ${active ? "text-white" : "text-white/40"}`} />
                  {tab.label}
                </motion.button>
              );
            })}
          </div>

          {/* Reset button */}
          {hasActiveFilters && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              onClick={resetFilters}
              className="flex items-center gap-1 px-2.5 py-[6px] rounded-full text-[11px] font-semibold text-white/50 hover:text-white/80 bg-white/[0.04] border border-white/[0.08] cursor-pointer transition-colors ml-auto"
            >
              <X className="w-3 h-3" />
              Reset filter
            </motion.button>
          )}
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
          <motion.div className="py-[70px] text-center text-red-400 text-[14.5px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {error}
          </motion.div>
        ) : loadingBrowse && items.length === 0 ? (
          <motion.div className="py-[70px] text-center flex flex-col items-center gap-3 text-white/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 className="w-8 h-8 text-[#ff5566] animate-spin" />
            <span className="text-sm">Memuat...</span>
          </motion.div>
        ) : items.length === 0 ? (
          <motion.div className="py-[70px] text-center flex flex-col items-center gap-[14px]" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="w-[64px] h-[64px] rounded-[20px] grid place-items-center bg-white/6 border border-white/10">
              <Search className="w-7 h-7 text-white/35" />
            </div>
            <div className="sora font-bold text-[20px]">
              {query.trim() ? `Tidak ada hasil untuk "${query}"` : "Belum ada judul"}
            </div>
            <div className="text-[14.5px] text-white/50">Coba kata kunci lain atau pilih salah satu filter di atas.</div>
          </motion.div>
        ) : (
          <motion.div
            key={`${query.trim() || "browse"}-${activeGenre}-${source}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-[22px]">
              {items.map((movie, idx) => {
                const isSeries = movie.slug?.startsWith("tv-") || movie.isSeries === true;
                const rating = movie.voteAverage ? Number(movie.voteAverage) : 0;
                const ratingLabel = rating > 0 ? rating.toFixed(1) : null;
                return (
                  <motion.div
                    key={movie.id}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    whileHover={{ y: -6 }}
                  >
                    <Link href={`/movie/${movie.slug}`} className="group flex flex-col gap-[10px] cursor-pointer">
                      <div
                        className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-gradient-to-br from-[#2a0a12] to-[#0e0608] transition-all"
                        style={{ border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 18px 44px -20px rgba(0,0,0,0.85)" }}
                      >
                        {movie.posterPath ? (
                          <img src={idlixImage(movie.posterPath, "w342")} alt={movie.title} loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_8px,transparent_8px_18px)]" />
                        )}

                        {/* Source + Type badge — top right */}
                        <div className="absolute top-[10px] right-[10px] flex items-center gap-1">
                          {movie.source === "ngefilm" && (
                            <span
                              className="px-[6px] py-[2px] rounded-full text-[8px] font-bold tracking-[0.08em] text-emerald-400"
                              style={{ background: "rgba(10,4,6,0.72)", border: "1px solid rgba(52,211,153,0.3)", backdropFilter: "blur(10px)" }}
                            >
                              NG
                            </span>
                          )}
                          <span
                            className="px-[7px] py-[3px] rounded-full text-[9px] font-bold tracking-[0.1em] whitespace-nowrap text-white group-hover:text-[#ff5566] transition-colors"
                            style={{ background: "rgba(10,4,6,0.72)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(10px)" }}
                          >
                            {isSeries ? "SERIES" : "FILM"}
                          </span>
                        </div>

                        {/* Rating badge — bottom left */}
                        {ratingLabel && (
                          <div
                            className="absolute bottom-[10px] left-[10px] flex items-center gap-[4px] px-[8px] py-[4px] rounded-full text-[11px] font-bold transition-colors"
                            style={{ background: "rgba(10,4,6,0.78)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(10px)" }}
                          >
                            <Star className="w-3 h-3 text-[#fbbf24] fill-[#fbbf24]" />
                            <span className="text-white group-hover:text-[#ff5566] transition-colors">{ratingLabel}</span>
                          </div>
                        )}
                      </div>

                      <div className="sora font-semibold text-[14px] leading-tight text-white group-hover:text-[#ff5566] transition-colors line-clamp-2">
                        {movie.title}
                      </div>

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
              <motion.div className="flex justify-center mt-[38px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <motion.button
                  onClick={() => loadBrowse(page + 1, false)}
                  disabled={loadingBrowse}
                  className="flex items-center gap-2 px-[30px] py-[14px] rounded-full text-[14.5px] font-bold text-white accent-gradient accent-shadow transition-all disabled:opacity-50 cursor-pointer"
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
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
