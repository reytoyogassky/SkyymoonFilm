"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Play, Info, ArrowRight } from "lucide-react";
import { idlixImage, yearOf } from "@/lib/media";
import type { MovieListItem } from "@/lib/types";
import DragCarousel from "@/components/DragCarousel";
import MovieCard from "@/components/MovieCard";
import PageLoader from "@/components/PageLoader";

interface GenreCount {
  id: string;
  name: string;
  slug: string;
  count: number;
}

interface Stats {
  catalogTotal: number;
  genres: GenreCount[];
}

export default function HomePage() {
  const [popularMovies, setPopularMovies] = useState<MovieListItem[]>([]);
  const [popularSeries, setPopularSeries] = useState<MovieListItem[]>([]);
  const [latestMovies, setLatestMovies] = useState<MovieListItem[]>([]);
  const [latestSeries, setLatestSeries] = useState<MovieListItem[]>([]);
  const [ngefilmPopularMovies, setNgefilmPopularMovies] = useState<MovieListItem[]>([]);
  const [ngefilmPopularSeries, setNgefilmPopularSeries] = useState<MovieListItem[]>([]);
  const [ngefilmLatestMovies, setNgefilmLatestMovies] = useState<MovieListItem[]>([]);
  const [ngefilmLatestSeries, setNgefilmLatestSeries] = useState<MovieListItem[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<MovieListItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [featuredLogo, setFeaturedLogo] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/catalog/browse?sort=popular&page=1&limit=200&source=idlix").then(r => r.json()),
      fetch("/api/catalog/browse?sort=latest&page=1&limit=200&source=idlix").then(r => r.json()),
      fetch("/api/catalog/browse?sort=popular&page=1&limit=20&source=ngefilm&type=movie").then(r => r.json()),
      fetch("/api/catalog/browse?sort=popular&page=1&limit=20&source=ngefilm&type=tv").then(r => r.json()),
      fetch("/api/catalog/browse?sort=latest&page=1&limit=20&source=ngefilm&type=movie").then(r => r.json()),
      fetch("/api/catalog/browse?sort=latest&page=1&limit=20&source=ngefilm&type=tv").then(r => r.json()),
      fetch("/api/catalog/stats").then(r => r.json()),
    ])
      .then(([pop, fresh, ngPopMovies, ngPopSeries, ngLatestMovies, ngLatestSeries, statsData]) => {
        if (!mounted) return;
        const popularData = (pop.data || []) as (MovieListItem & { isSeries?: boolean })[];
        const latestData = (fresh.data || []) as (MovieListItem & { isSeries?: boolean })[];
        
        setPopularMovies(popularData.filter(x => !x.isSeries).slice(0, 15));
        setPopularSeries(popularData.filter(x => x.isSeries).slice(0, 15));
        setLatestMovies(latestData.filter(x => !x.isSeries).slice(0, 15));
        setLatestSeries(latestData.filter(x => x.isSeries).slice(0, 15));
        setNgefilmPopularMovies((ngPopMovies.data || []) as MovieListItem[]);
        setNgefilmPopularSeries((ngPopSeries.data || []) as MovieListItem[]);
        setNgefilmLatestMovies((ngLatestMovies.data || []) as MovieListItem[]);
        setNgefilmLatestSeries((ngLatestSeries.data || []) as MovieListItem[]);
        setRecentlyAdded(latestData.slice(0, 20));
        
        if (statsData && !statsData.error) setStats(statsData);
        setLoading(false);
      })
      .catch(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  /* Hero auto-rotate */
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroTick, setHeroTick] = useState(0);
  const heroCount = Math.min(popularMovies.length, 5);

  const featured = popularMovies[heroIdx] ?? popularMovies[0];

  useEffect(() => {
    if (!featured?.slug) return;
    
    fetch(`/api/catalog/${featured.slug}`)
      .then((r) => r.json())
      .then((data) => {
        // Try TMDB logo first, then IDLIX logo
        const logo = data?.tmdb?.logoPath || data?.movie?.logoPath;
        if (logo) {
          const logoUrl = logo.startsWith("http") ? logo : `https://image.tmdb.org/t/p/w500${logo}`;
          const img = document.createElement('img');
          img.src = logoUrl;
          img.onload = () => setFeaturedLogo(logo);
          img.onerror = () => setFeaturedLogo(null);
        } else {
          setFeaturedLogo(null);
        }
      })
      .catch(() => setFeaturedLogo(null));
  }, [featured?.slug]);

  useEffect(() => {
    if (heroCount <= 1) return;
    const id = setTimeout(
      () => setHeroIdx((i) => (i + 1) % heroCount),
      12000
    );
    return () => clearTimeout(id);
  }, [heroCount, heroIdx, heroTick]);

  const goToSlide = (i: number) => {
    setHeroIdx(i);
    setHeroTick((t) => t + 1);
  };

  const spotlight = popularMovies[2] ?? popularMovies[0];
  const genreSpot = popularMovies[3] ?? popularMovies[1];

  if (loading) return <PageLoader />;

  return (
    <div className="relative" style={{ animation: "sm-fade .3s ease both" }}>
      {/* ═══════════ HERO SECTION - CINE SPHERE DESIGN ═══════════ */}
      {featured && (
        <section
          className="relative overflow-hidden"
          style={{ minHeight: "100dvh", paddingTop: "0", marginTop: "-100px" }}
        >
          {/* Modern gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0A0E27] via-[#1A1F3A] to-[#050814]" />
          
          {/* Animated gradient orbs */}
          <div
            className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full blur-[120px] opacity-30"
            style={{
              background: "radial-gradient(circle, rgba(123,44,191,0.6), transparent 70%)",
              animation: "skyFloat 20s ease-in-out infinite",
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full blur-[100px] opacity-20"
            style={{
              background: "radial-gradient(circle, rgba(157,78,221,0.5), transparent 70%)",
              animation: "skyFloat 15s ease-in-out infinite reverse",
            }}
          />

          {/* Backdrop image with modern treatment */}
          {featured.backdropPath && (
            <div key={`backdrop-${featured.slug}`} className="absolute inset-0" style={{ animation: "heroFade 0.8s ease-in-out" }}>
              <img
                src={idlixImage(featured.backdropPath, "w1280")}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  objectPosition: "center 20%",
                  opacity: 0.65,
                }}
              />
              {/* Minimal gradient overlay - hanya untuk text readability */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(10,14,39,0.88) 0%, rgba(10,14,39,0.5) 25%, rgba(10,14,39,0.1) 50%, transparent 70%)",
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(0deg, rgba(10,14,39,0.75) 0%, rgba(10,14,39,0.2) 15%, transparent 40%)",
                }}
              />
            </div>
          )}

          {/* Hero content with new layout */}
          <div
            key={`content-${featured.slug}`}
            className="relative h-full flex items-center"
            style={{
              padding: "clamp(100px, 15vw, 160px) clamp(16px, 5vw, 40px) clamp(40px, 8vw, 80px)",
              minHeight: "100dvh",
              animation: "heroFade 0.8s ease-in-out",
            }}
          >
            <div className="max-w-[720px]">
              {/* Premium badge */}
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="px-4 py-2 rounded-full text-[11px] font-bold tracking-widest backdrop-blur-xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(123,44,191,0.3), rgba(157,78,221,0.2))",
                    border: "1px solid rgba(157,78,221,0.4)",
                    boxShadow: "0 4px 16px rgba(123,44,191,0.3)",
                  }}
                >
                  FEATURED
                </span>
                {featured.voteAverage && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl"
                       style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <span className="text-yellow-400 text-sm">★</span>
                    <span className="text-sm font-bold">{parseFloat(featured.voteAverage).toFixed(1)}</span>
                  </div>
                )}
              </div>

              {/* Title with modern typography */}
              {featuredLogo ? (
                <img 
                  src={`https://image.tmdb.org/t/p/w500${featuredLogo}`}
                  alt={featured.title}
                  className="mb-5"
                  style={{ 
                    maxWidth: "min(420px, 70vw)",
                    height: "auto",
                    filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.8))",
                  }}
                />
              ) : (
                <h1
                  className="m-0 mb-5"
                  style={{
                    fontSize: "clamp(42px, 5.5vw, 72px)",
                    lineHeight: 1,
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    fontFamily: "Space Grotesk, sans-serif",
                    textShadow: "0 4px 24px rgba(0,0,0,0.5)",
                  }}
                >
                  {featured.title}
                </h1>
              )}

              {/* Meta info with new style */}
              <div className="flex items-center gap-3 mb-6 text-[14px] font-medium text-white/70 flex-wrap">
                <span className="text-[#9D4EDD] font-bold">{yearOf(featured.releaseDate)}</span>
                {featured.genres?.slice(0, 3).map((g, idx) => (
                  <span key={g.id}>
                    {idx > 0 && <span className="text-white/30 mr-3">•</span>}
                    {g.name}
                  </span>
                ))}
              </div>

              {/* Description */}
              <p
                className="m-0 mb-8 max-w-[560px] text-[15px] leading-[1.7] line-clamp-3"
                style={{ color: "#CBD5E0" }}
              >
                {featured.overview ||
                  "Nikmati film pilihan terbaik dengan kualitas premium dan subtitle lengkap. Tonton sekarang di Cine Sphere."}
              </p>

              {/* CTA Buttons with new design */}
              <div className="flex items-center gap-4 flex-wrap">
                <Link
                  href={`/movie/${featured.slug}`}
                  className="group flex items-center gap-3 px-8 py-4 rounded-2xl text-[15px] font-bold text-white cursor-pointer transition-all hover:scale-105"
                  style={{
                    background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
                    boxShadow: "0 12px 32px rgba(123,44,191,0.5), 0 0 0 1px rgba(255,255,255,0.1) inset",
                  }}
                >
                  <Play className="w-5 h-5" fill="white" />
                  <span>Watch Now</span>
                </Link>
                <Link
                  href={`/movie/${featured.slug}`}
                  className="flex items-center gap-3 px-8 py-4 rounded-2xl text-[15px] font-semibold text-white cursor-pointer transition-all hover:scale-105 hover:bg-white/10"
                  style={{
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.05)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                  }}
                >
                  <Info className="w-[18px] h-[18px]" />
                  <span>More Info</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Modern carousel dots */}
          {heroCount > 1 && (
            <div className="absolute left-0 right-0 bottom-12 flex justify-center gap-2">
              {Array.from({ length: heroCount }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToSlide(i)}
                  className="transition-all duration-300 rounded-full cursor-pointer"
                  style={{
                    width: i === heroIdx % heroCount ? "32px" : "8px",
                    height: "8px",
                    border: "none",
                    background:
                      i === heroIdx % heroCount
                        ? "linear-gradient(90deg, #7B2CBF 0%, #9D4EDD 100%)"
                        : "rgba(255,255,255,0.3)",
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ═══════════ CONTENT ROWS ═══════════ */}

      {/* Row: 1. Film Populer */}
      {popularMovies.length > 0 && (
        <CarouselSection title="Film Populer">
          {popularMovies.map((movie, idx) => (
            <MovieCard key={movie.id} movie={movie} rank={idx + 1} index={idx} />
          ))}
        </CarouselSection>
      )}

      {/* Row: 2. Series Populer */}
      {popularSeries.length > 0 && (
        <CarouselSection title="Series Populer">
          {popularSeries.map((movie, idx) => (
            <MovieCard key={movie.id} movie={movie} rank={idx + 1} index={idx} />
          ))}
        </CarouselSection>
      )}

      {/* Row: 3. Film Terbaru */}
      {latestMovies.length > 0 && (
        <CarouselSection title="Film Terbaru">
          {latestMovies.map((movie, idx) => (
            <MovieCard key={movie.id} movie={movie} index={idx} />
          ))}
        </CarouselSection>
      )}

      {/* Row: 4. Series Terbaru */}
      {latestSeries.length > 0 && (
        <CarouselSection title="Series Terbaru">
          {latestSeries.map((movie, idx) => (
            <MovieCard key={movie.id} movie={movie} index={idx} />
          ))}
        </CarouselSection>
      )}

      {/* ═══════════ SPOTLIGHT SECTION ═══════════ */}
      {spotlight && (
        <section
          className="relative mt-[38px] overflow-hidden"
          style={{ padding: "clamp(20px, 4vw, 38px) clamp(16px, 4vw, 40px)" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#1A1F3A] to-[#0A0E27]" />
          {spotlight.backdropPath && (
            <img
              src={idlixImage(spotlight.backdropPath, "w1280")}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, #0A0E27 2%, rgba(10,14,39,0.85) 48%, rgba(123,44,191,0.2) 100%)",
            }}
          />
          <div className="relative flex gap-[34px] items-center flex-wrap">
            <div
              className="flex-1 flex flex-col gap-[11px]"
              style={{ minWidth: "280px", maxWidth: "480px" }}
            >
              <div className="sora text-[16px] font-bold">
                Paling banyak ditonton bulan ini
              </div>
              <div
                className="text-[12px] -mt-[6px]"
                style={{ color: "#A0AEC0" }}
              >
                Judul yang jadi bahan obrolan semua orang
              </div>
              <div
                className="mt-[10px] text-[12px]"
                style={{
                  fontFamily: "ui-monospace, monospace",
                  color: "#A0AEC0",
                }}
              >
                {yearOf(spotlight.releaseDate)}
              </div>
              <h3
                className="sora m-0"
                style={{
                  fontSize: "36px",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                {spotlight.title}
              </h3>
              <div
                className="text-[12.5px] font-bold"
                style={{ color: "#CBD5E0" }}
              >
                {spotlight.genres?.map((g) => g.name).join(" · ") || "Film"}
              </div>
              <p
                className="m-0 text-[13px] leading-[1.6] line-clamp-3"
                style={{ color: "#A0AEC0" }}
              >
                {spotlight.overview || "Sinopsis belum tersedia."}
              </p>
              <div className="flex gap-[10px] mt-2 flex-wrap">
                <Link
                  href={`/movie/${spotlight.slug}`}
                  className="flex items-center gap-[8px] px-[18px] py-[10px] rounded-lg text-[12.5px] font-bold text-white transition-all hover:scale-105"
                  style={{ 
                    background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)", 
                    border: "none",
                    boxShadow: "0 8px 24px rgba(123,44,191,0.4)"
                  }}
                >
                  <span className="w-0 h-0 border-l-[7px] border-l-white border-t-[4.5px] border-t-transparent border-b-[4.5px] border-b-transparent" />
                  Putar Sekarang
                </Link>
                <Link
                  href={`/movie/${spotlight.slug}`}
                  className="px-[18px] py-[10px] rounded-lg text-[12.5px] text-white transition-all hover:border-[#7B2CBF]"
                  style={{
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.05)",
                  }}
                >
                  Detail
                </Link>
              </div>
            </div>
            {/* Monthly trending mini-carousel */}
            <div
              className="flex-1 flex gap-[16px] overflow-x-auto pb-1 cursor-grab"
              style={{
                minWidth: "300px",
                scrollBehavior: "smooth",
                scrollbarWidth: "none",
              }}
            >
              {popularMovies.slice(0, 6).map((m) => (
                <Link
                  key={m.id}
                  href={`/movie/${m.slug}`}
                  className="flex-none cursor-pointer"
                  style={{ width: "148px" }}
                >
                  <div
                    className="relative overflow-hidden"
                    style={{
                      height: "216px",
                      borderRadius: "10px",
                      border: "1px solid rgba(123,44,191,0.4)",
                      boxShadow: "0 14px 40px rgba(0,0,0,0.6)",
                    }}
                  >
                    {m.posterPath && (
                      <img
                        src={idlixImage(m.posterPath, "w342")}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {!m.posterPath && <div className="absolute inset-0 stripe-bg-alt" />}
                  </div>
                  <div
                    className="mt-[9px] text-[12.5px] font-bold line-clamp-1"
                  >
                    {m.title}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Row: 5. Film Indo Populer */}
      {ngefilmPopularMovies.length > 0 && (
        <CarouselSection title="Film Indonesia Populer">
          {ngefilmPopularMovies.map((movie, idx) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              rank={idx + 1}
              badge="ID"
              index={idx}
            />
          ))}
        </CarouselSection>
      )}

      {/* Row: 6. Series Indo Populer */}
      {ngefilmPopularSeries.length > 0 && (
        <CarouselSection title="Series Indonesia Populer">
          {ngefilmPopularSeries.map((movie, idx) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              rank={idx + 1}
              badge="ID"
              index={idx}
            />
          ))}
        </CarouselSection>
      )}

      {/* Row: 7. Film Indo Terbaru */}
      {ngefilmLatestMovies.length > 0 && (
        <CarouselSection title="Film Indonesia Terbaru">
          {ngefilmLatestMovies.map((movie, idx) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              badge="ID"
              index={idx}
            />
          ))}
        </CarouselSection>
      )}

      {/* Row: 8. Series Indo Terbaru */}
      {ngefilmLatestSeries.length > 0 && (
        <CarouselSection title="Series Indonesia Terbaru">
          {ngefilmLatestSeries.map((movie, idx) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              badge="ID"
              index={idx}
            />
          ))}
        </CarouselSection>
      )}

      {/* Row: 9. Baru Ditambahkan (Recently Scraped) */}
      {recentlyAdded.length > 0 && (
        <CarouselSection title="Baru Ditambahkan">
          {recentlyAdded.map((movie, idx) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              showTypeBadge
              index={idx}
            />
          ))}
        </CarouselSection>
      )}

      {/* ═══════════ FILM & DRAMA PENDEK (dummy) - COMING SOON ═══════════ */}
      <section style={{ padding: "38px 40px 0" }}>
        <div className="flex items-center justify-between gap-4 mb-[6px]">
          <h2 className="sora m-0 text-[19px] font-bold">
            Film &amp; Drama Pendek
          </h2>
          <span
            className="text-[13px] px-3 py-1 rounded-full"
            style={{ 
              color: "#A0AEC0",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              cursor: "not-allowed",
            }}
          >
            Coming Soon
          </span>
        </div>
        <div className="text-[12px] mb-4" style={{ color: "#A0AEC0" }}>
          Tayangan di bawah 45 menit, habis dalam sekali duduk
        </div>
        <div
          className="flex items-center justify-center p-20 rounded-2xl"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.1)",
          }}
        >
          <span className="text-[14px]" style={{ color: "#718096" }}>
            Fitur shorts akan segera hadir
          </span>
        </div>
      </section>

      {/* ═══════════ GENRE EXPLORE SECTION - REDESIGNED ═══════════ */}
      {genreSpot && (
        <section
          className="relative mt-[60px] overflow-hidden rounded-3xl mx-4 sm:mx-6 lg:mx-10"
          style={{ padding: "clamp(24px, 4vw, 48px) clamp(16px, 4vw, 52px)", minHeight: "400px" }}
        >
          {/* Modern background treatment */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#1A1F3A] via-[#252B48] to-[#0A0E27]" />
          
          {/* Backdrop with modern overlay */}
          {genreSpot.backdropPath && (
            <>
              <img
                src={idlixImage(genreSpot.backdropPath, "w1280")}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: 0.3 }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(105deg, rgba(10,14,39,0.95) 0%, rgba(10,14,39,0.85) 45%, rgba(10,14,39,0.3) 75%, transparent 100%)",
                }}
              />
            </>
          )}

          {/* Decorative gradient orb */}
          <div
            className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[100px] opacity-40"
            style={{
              background: "radial-gradient(circle, rgba(157,78,221,0.6), transparent 70%)",
            }}
          />

          {/* Content */}
          <div className="relative flex flex-col gap-5 max-w-[600px]" style={{ animation: "slideInRight 0.8s ease" }}>
            {/* Header badge */}
            <div className="flex items-center gap-3">
              <span
                className="px-4 py-2 rounded-full text-[11px] font-bold tracking-widest backdrop-blur-xl"
                style={{
                  background: "rgba(157,78,221,0.2)",
                  border: "1px solid rgba(157,78,221,0.3)",
                }}
              >
                EXPLORE GENRES
              </span>
            </div>

            <div>
              <h3
                className="m-0 mb-3"
                style={{
                  fontSize: "clamp(32px, 4vw, 48px)",
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  fontFamily: "Space Grotesk, sans-serif",
                  lineHeight: 1.1,
                }}
              >
                {genreSpot.title}
              </h3>
              
              <div className="flex items-center gap-3 text-[14px] font-medium text-white/70 mb-4">
                <span className="text-[#9D4EDD] font-bold">{yearOf(genreSpot.releaseDate)}</span>
                {genreSpot.genres?.slice(0, 2).map((g, idx) => (
                  <span key={g.id}>
                    {idx > 0 && <span className="text-white/30 mr-3">•</span>}
                    {g.name}
                  </span>
                ))}
              </div>
            </div>

            <p
              className="m-0 text-[15px] leading-[1.7] line-clamp-3"
              style={{ color: "#CBD5E0" }}
            >
              {genreSpot.overview || "Discover movies that match your mood tonight."}
            </p>

            <div className="flex gap-4 mt-2">
              <Link
                href={`/movie/${genreSpot.slug}`}
                className="flex items-center gap-3 px-6 py-3 rounded-xl text-[14px] font-bold text-white transition-all hover:scale-105"
                style={{ 
                  background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)", 
                  boxShadow: "0 8px 24px rgba(123,44,191,0.4)"
                }}
              >
                <Play className="w-4 h-4" fill="white" />
                <span>Watch Now</span>
              </Link>
              <Link
                href="/jelajahi"
                className="px-6 py-3 rounded-xl text-[14px] font-semibold text-white transition-all hover:scale-105 hover:bg-white/10"
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                Browse All
              </Link>
            </div>
          </div>

          {/* Genre tiles - Modern grid */}
          <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12">
            {(stats?.genres
              ? stats.genres.slice(0, 8).map((g) => g.name)
              : [
                  "Action",
                  "Drama",
                  "Comedy",
                  "Thriller",
                  "Fantasy",
                  "Mystery",
                  "Horror",
                  "Romance",
                ]
            ).map((name, i) => (
              <Link
                key={name}
                href={`/jelajahi?genre=${name.toLowerCase()}`}
                className="group flex items-center justify-center text-[15px] font-bold text-white cursor-pointer transition-all hover:scale-105"
                style={{
                  padding: "20px",
                  borderRadius: "16px",
                  background: i < 2
                    ? "linear-gradient(135deg, rgba(123,44,191,0.4) 0%, rgba(157,78,221,0.3) 100%)"
                    : "rgba(255,255,255,0.05)",
                  border: i < 2
                    ? "1px solid rgba(157,78,221,0.4)"
                    : "1px solid rgba(255,255,255,0.1)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                {name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ═══════════ FOOTER - MODERN DESIGN ═══════════ */}
      <footer
        className="mt-[80px]"
        style={{
          padding: "clamp(24px, 4vw, 48px) clamp(16px, 4vw, 40px)",
          background: "linear-gradient(180deg, transparent 0%, #050814 20%)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
            {/* Brand section */}
            <div className="flex flex-col gap-4">
              <Image
                src="/assets/skyy-logo.png"
                alt="SKYYMOVIE"
                width={1672}
                height={941}
                className="opacity-95"
                style={{ width: '220px', height: 'auto' }}
              />
              <p className="text-[14px] leading-relaxed text-white/60 max-w-[300px]">
                SKYYMOVIE - Your premium destination for movies and series. 
                Stream unlimited entertainment in stunning quality.
              </p>
              <div className="flex items-center gap-3">
                {/* Social icons placeholder */}
                <a href="#" className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#7B2CBF] transition-all">
                  <span className="text-white/70">𝕏</span>
                </a>
                <a href="#" className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#7B2CBF] transition-all">
                  <span className="text-white/70">IG</span>
                </a>
              </div>
            </div>

            {/* Links sections */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="font-bold text-[14px] mb-4 text-white/90" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  Browse
                </h4>
                <ul className="flex flex-col gap-3 text-[14px] text-white/60">
                  <li><a href="/jelajahi" className="hover:text-[#9D4EDD] transition-colors">Explore</a></li>
                  <li><a href="/pendek" className="hover:text-[#9D4EDD] transition-colors">Shorts</a></li>
                  <li><a href="/daftar-saya" className="hover:text-[#9D4EDD] transition-colors">My List</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-[14px] mb-4 text-white/90" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  Account
                </h4>
                <ul className="flex flex-col gap-3 text-[14px] text-white/60">
                  <li><a href="/masuk" className="hover:text-[#9D4EDD] transition-colors">Sign In</a></li>
                  <li><a href="/daftar" className="hover:text-[#9D4EDD] transition-colors">Register</a></li>
                  <li><a href="/akun" className="hover:text-[#9D4EDD] transition-colors">Settings</a></li>
                </ul>
              </div>
            </div>

            {/* Newsletter */}
            <div>
              <h4 className="font-bold text-[14px] mb-4 text-white/90" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                Stay Updated
              </h4>
              <p className="text-[13px] text-white/60 mb-4">
                Get notified about new releases and exclusive content.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[14px] text-white placeholder:text-white/40 focus:border-[#7B2CBF] focus:outline-none transition-all"
                />
                <button
                  className="px-5 py-2.5 rounded-xl font-semibold text-[14px] text-white transition-all hover:scale-105"
                  style={{
                    background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
                  }}
                >
                  Join
                </button>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-[13px] text-white/40">
            <span>© 2026 SKYY - Cine Sphere. All rights reserved.</span>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-white/70 transition-colors">Privacy</a>
              <a href="#" className="hover:text-white/70 transition-colors">Terms</a>
              <a href="#" className="hover:text-white/70 transition-colors">Help</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Reusable carousel section with modern design ── */
function CarouselSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ padding: "clamp(24px, 4vw, 48px) clamp(16px, 4vw, 40px) 0" }}>
      <div className="flex items-center justify-between gap-4 mb-6">
        <h2 
          className="m-0 text-[26px] font-black tracking-tight"
          style={{ 
            fontFamily: "Space Grotesk, sans-serif",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        <Link
          href="/jelajahi"
          className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer group transition-all"
          style={{ color: "#9D4EDD" }}
        >
          <span className="group-hover:translate-x-[-4px] transition-transform">View All</span>
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="group-hover:translate-x-1 transition-transform"
          >
            <ArrowRight className="w-4 h-4" />
          </svg>
        </Link>
      </div>
      <DragCarousel>{children}</DragCarousel>
    </section>
  );
}
