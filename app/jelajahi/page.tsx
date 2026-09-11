"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { X, Loader2, ChevronDown, Search } from "lucide-react";
import { idlixImage, yearOf } from "@/lib/media";
import type { MovieListItem } from "@/lib/types";
import type { ContentSource } from "@/lib/catalog";
import MovieCard from "@/components/MovieCard";
import PageLoader from "@/components/PageLoader";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type MediaType = "all" | "movie" | "tv";

const TYPE_OPTIONS: { key: MediaType; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "movie", label: "Film" },
  { key: "tv", label: "Series" },
];

const SOURCE_OPTIONS: { key: ContentSource; label: string }[] = [
  { key: "all", label: "Semua Sumber" },
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

interface GenreInfo { id: string; name: string; slug: string; count: number }
interface CountryInfo { code: string; name: string; count: number }

// ---------------------------------------------------------------------------
// URL sync
// ---------------------------------------------------------------------------

function syncUrl(
  pathname: string,
  current: URLSearchParams,
  overrides: Record<string, string | null>,
) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === "") params.delete(k);
    else if ((k === "type" && v === "all") || (k === "sort" && v === "popular") || (k === "source" && v === "all"))
      params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
}

// ---------------------------------------------------------------------------
// Modern Pill button with enhanced styling
// ---------------------------------------------------------------------------

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-none px-5 py-2.5 rounded-xl text-[13px] font-bold cursor-pointer transition-all duration-300 whitespace-nowrap hover:scale-105"
      style={{
        color: active ? "#fff" : "#A0AEC0",
        background: active 
          ? "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)" 
          : "rgba(255,255,255,0.05)",
        border: `1px solid ${active ? "rgba(157,78,221,0.5)" : "rgba(255,255,255,0.1)"}`,
        boxShadow: active ? "0 4px 12px rgba(123,44,191,0.3)" : "none",
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modern Dropdown select
// ---------------------------------------------------------------------------

function FilterSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="relative flex-none">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="appearance-none cursor-pointer pl-5 pr-10 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-300 disabled:opacity-40 hover:scale-105"
        style={{
          color: value ? "#FFFFFF" : "#A0AEC0",
          background: value 
            ? "linear-gradient(135deg, rgba(123,44,191,0.2), rgba(157,78,221,0.15))" 
            : "rgba(255,255,255,0.05)",
          border: `1px solid ${value ? "rgba(157,78,221,0.4)" : "rgba(255,255,255,0.1)"}`,
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: "#1A1F3A", color: "#FFFFFF" }}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-transform"
        style={{ color: value ? "#9D4EDD" : "#718096" }}
      />
    </div>
  );
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

  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>(() => (searchParams.get("type") as MediaType) || "all");
  const [sort, setSort] = useState<"popular" | "latest">(() => (searchParams.get("sort") as "popular" | "latest") || "popular");
  const [activeGenre, setActiveGenre] = useState<string | null>(() => searchParams.get("genre") || null);
  const [activeCountry, setActiveCountry] = useState<string | null>(() => searchParams.get("country") || null);
  const [source, setSource] = useState<ContentSource>(() => (searchParams.get("source") as ContentSource) || "all");

  useEffect(() => {
    const urlQuery = searchParams.get("q")?.trim() ?? "";
    setQuery(urlQuery);
  }, [searchParams]);

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



  // Fetch genres & countries
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

  const buildBrowseUrl = useCallback(
    (pg: number) => {
      const params = new URLSearchParams({ sort, page: String(pg), limit: "60", type: mediaType, source });
      if (activeGenre) params.set("genre", activeGenre);
      if (activeCountry) params.set("country", activeCountry);
      return `/api/catalog/browse?${params}`;
    },
    [sort, mediaType, activeGenre, activeCountry, source],
  );

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
    [buildBrowseUrl],
  );

  // Initial load & filter change
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
        if (!cancelled) { setError((e as Error).message); setInitialLoading(false); }
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
        const params = new URLSearchParams({ q, type: mediaType, source });
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



  // Setters with URL sync
  const switchType = (t: MediaType) => { if (t === mediaType) return; setQuery(""); setMediaType(t); syncUrl(pathname, searchParams, { type: t, q: null }); };
  const switchSort = (s: "popular" | "latest") => { if (s === sort) return; setQuery(""); setSort(s); syncUrl(pathname, searchParams, { sort: s, q: null }); };
  const switchSource = (s: ContentSource) => {
    if (s === source) return;
    setQuery(""); setSource(s);
    if (s === "ngefilm") { setActiveCountry("ID"); setActiveGenre(null); }
    syncUrl(pathname, searchParams, { source: s, q: null, country: s === "ngefilm" ? "ID" : activeCountry, genre: s === "ngefilm" ? null : activeGenre });
  };
  const switchGenre = (slug: string | null) => { setQuery(""); setActiveGenre(slug); syncUrl(pathname, searchParams, { genre: slug, q: null }); };
  const switchCountry = (code: string | null) => { setQuery(""); setActiveCountry(code); syncUrl(pathname, searchParams, { country: code, q: null }); };
  const handleQueryChange = (q: string) => { setQuery(q); syncUrl(pathname, searchParams, { q: q.trim() || null }); };

  const resetFilters = () => {
    setActiveGenre(null); setActiveCountry(null); setSource("all");
    syncUrl(pathname, searchParams, { genre: null, country: null, source: null });
  };

  // Derived
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

  const genreOptions = useMemo(() => {
    if (genres.length > 0) return genres.map((g) => ({ slug: g.slug, name: GENRE_NAMES[g.slug] || g.name, count: g.count }));
    return ["action", "adventure", "animation", "comedy", "crime", "drama", "fantasy", "horror", "mystery", "romance", "thriller", "science-fiction", "family", "war", "history"]
      .map((s) => ({ slug: s, name: GENRE_NAMES[s] || s, count: 0 }));
  }, [genres]);

  const countryOptions = useMemo(() => {
    if (countries.length > 0) return countries.map((c) => ({ code: c.code, name: COUNTRY_NAMES[c.code] || c.name || c.code }));
    return Object.entries(COUNTRY_NAMES).map(([code, name]) => ({ code, name }));
  }, [countries]);

  const hasActiveFilters = !!(activeGenre || activeCountry || source !== "all");

  if (initialLoading) return <PageLoader />;

  return (
    <div className="relative pb-24" style={{ animation: "slideUp .4s ease both" }}>
      {/* ────────── MODERN STICKY TOOLBAR ────────── */}
      <div
        className="sticky top-[72px] z-30 px-6 sm:px-8 lg:px-12 py-6"
        style={{
          background: "rgba(10,14,39,0.95)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Modern Filters row */}
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
          {/* Type pills */}
          {TYPE_OPTIONS.map((t) => (
            <Pill key={t.key} active={mediaType === t.key} onClick={() => switchType(t.key)}>
              {t.label}
            </Pill>
          ))}

          {/* Divider */}
          <div className="w-px h-6 flex-none rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />

          {/* Sort pills */}
          <Pill active={sort === "popular"} onClick={() => switchSort("popular")}>Popular</Pill>
          <Pill active={sort === "latest"} onClick={() => switchSort("latest")}>Latest</Pill>

          {/* Divider */}
          <div className="w-px h-6 flex-none rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />

          {/* Source dropdown */}
          <FilterSelect
            value={source === "all" ? "" : source}
            onChange={(v) => switchSource((v || "all") as ContentSource)}
            options={[
              { value: "", label: "All Sources" },
              { value: "idlix", label: "IDLIX" },
              { value: "ngefilm", label: "NgeFilm" },
            ]}
          />

          {/* Genre dropdown */}
          {source !== "ngefilm" && (
            <FilterSelect
              value={activeGenre ?? ""}
              onChange={(v) => switchGenre(v || null)}
              options={[
                { value: "", label: "Genre" },
                ...genreOptions.map((g) => ({ value: g.slug, label: g.name })),
              ]}
            />
          )}

          {/* Country dropdown */}
          <FilterSelect
            value={activeCountry ?? ""}
            onChange={(v) => switchCountry(v || null)}
            disabled={source === "ngefilm"}
            options={[
              { value: "", label: "Country" },
              ...countryOptions.map((c) => ({ value: c.code, label: c.name })),
            ]}
          />

          {/* Reset button */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex-none flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold cursor-pointer transition-all duration-300 hover:scale-105"
              style={{ 
                color: "#9D4EDD", 
                background: "rgba(157,78,221,0.15)", 
                border: "1px solid rgba(157,78,221,0.3)" 
              }}
            >
              <X className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ────────── MODERN HEADING ────────── */}
      <div className="px-6 sm:px-8 lg:px-12 pt-8 pb-4 flex items-end justify-between gap-4">
        <div>
          <h1 
            className="font-black text-[32px] sm:text-[40px] tracking-tight mb-2"
            style={{ 
              fontFamily: "Space Grotesk, sans-serif",
              letterSpacing: "-0.02em"
            }}
          >
            {heading}
          </h1>
          {!query.trim() && total > 0 && (
            <p className="text-[14px] font-medium text-white/50">
              {total.toLocaleString("id-ID")} titles available
            </p>
          )}
        </div>
      </div>

      {/* ────────── MODERN GRID ────────── */}
      <div className="px-6 sm:px-8 lg:px-12">
        {error ? (
          <div className="py-24 text-center">
            <div className="inline-flex flex-col items-center gap-4 px-8 py-6 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(157,78,221,0.2)" }}>
                <X className="w-6 h-6 text-[#9D4EDD]" />
              </div>
              <p className="text-[15px] font-semibold text-[#9D4EDD]">{error}</p>
            </div>
          </div>
        ) : loadingBrowse && items.length === 0 ? (
          <div className="py-32 text-center flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-[#9D4EDD] animate-spin" />
            <span className="text-[14px] font-medium text-white/50">Loading catalog...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-32 text-center flex flex-col items-center gap-6">
            <div
              className="w-20 h-20 rounded-2xl grid place-items-center"
              style={{ 
                background: "linear-gradient(135deg, rgba(123,44,191,0.1), rgba(157,78,221,0.05))", 
                border: "1px solid rgba(157,78,221,0.2)" 
              }}
            >
              <Search className="w-8 h-8 text-[#9D4EDD]" />
            </div>
            <div>
              <h3 className="font-bold text-[22px] mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {query.trim() ? `No results for "${query}"` : "No titles found"}
              </h3>
              <p className="text-[15px] text-white/50">
                Try different keywords or adjust your filters above.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {items.map((movie, idx) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  showTypeBadge
                  index={idx}
                />
              ))}
            </div>

            {!query.trim() && page < totalPages && (
              <div className="flex justify-center mt-16">
                <button
                  onClick={() => loadBrowse(page + 1, false)}
                  disabled={loadingBrowse}
                  className="flex items-center gap-3 px-8 py-4 rounded-2xl text-[15px] font-bold text-white transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
                    boxShadow: "0 8px 24px rgba(123,44,191,0.4)",
                  }}
                >
                  {loadingBrowse ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <span>Load More</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12l-7 7m0 0l-7-7m7 7V5"/>
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
