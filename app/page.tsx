"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tmdbImage, yearOf, type MovieListItem } from "@/lib/types";
import DragCarousel from "@/components/DragCarousel";
import MovieCard from "@/components/MovieCard";
import PageLoader from "@/components/PageLoader";

interface GenreCount {
  id: number;
  name: string;
  count: number;
}

interface Stats {
  catalogTotal: number;
  popularAvg: number;
  genres: GenreCount[];
}

export default function HomePage() {
  const [popular, setPopular] = useState<MovieListItem[]>([]);
  const [newReleases, setNewReleases] = useState<(MovieListItem & { isSeries?: boolean })[]>([]);
  const [popularSeries, setPopularSeries] = useState<MovieListItem[]>([]);
  const [indoMovies, setIndoMovies] = useState<(MovieListItem & { isSeries?: boolean })[]>([]);
  const [indoSeries, setIndoSeries] = useState<(MovieListItem & { isSeries?: boolean })[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/movies?list=idlix_popular&page=1").then((r) => r.json()),
      fetch("/api/movies?list=idlix_latest&page=1").then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/nge/list?type=movie&order=date&page=1").then((r) => r.json()),
      fetch("/api/nge/list?type=tv&order=date&page=1").then((r) => r.json()),
    ])
      .then(([pop, fresh, statsData, indoMoviesData, indoSeriesData]) => {
        if (!mounted) return;
        const all = (pop.data || []) as (MovieListItem & { isSeries?: boolean })[];
        setPopular(all.filter((x) => !x.isSeries));
        setPopularSeries(all.filter((x) => x.isSeries));
        setNewReleases((fresh.data || []) as (MovieListItem & { isSeries?: boolean })[]);
        setIndoMovies((indoMoviesData.data || []) as (MovieListItem & { isSeries?: boolean })[]);
        setIndoSeries((indoSeriesData.data || []) as (MovieListItem & { isSeries?: boolean })[]);
        if (statsData && !statsData.error) setStats(statsData);
        setLoading(false);
      })
      .catch(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const [heroIdx, setHeroIdx] = useState(0);
  const [heroTick, setHeroTick] = useState(0);
  const heroCount = Math.min(popular.length, 5);

  useEffect(() => {
    if (heroCount <= 1) return;
    const id = setTimeout(() => setHeroIdx((i) => (i + 1) % heroCount), 10000);
    return () => clearTimeout(id);
  }, [heroCount, heroIdx, heroTick]);

  const goToSlide = (i: number) => {
    setHeroIdx(i);
    setHeroTick((t) => t + 1);
  };

  const featured = popular[heroIdx] ?? popular[0];
  const newIds = new Set(newReleases.map((m) => m.id));

  // "Baru Rilis" = campuran film & series terbaru dari IDLIX
  const mixedNewReleases = newReleases.slice(0, 15);

  if (loading) return <PageLoader />;

  return (
    <div className="relative">
      {/* Hero Section */}
      {featured && (
        <section className="px-4 sm:px-6 lg:px-10 pt-[30px] sm:pt-[38px]">
          <div
            className="relative min-h-[560px] sm:min-h-[540px] lg:aspect-[21/9] rounded-[22px] sm:rounded-[30px] overflow-hidden"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 40px 100px -30px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.14)",
            }}
          >
            {/* Backdrop layers */}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(150deg, #24080f, #12070a 60%, #0a0507)" }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "repeating-linear-gradient(52deg, rgba(255,255,255,0.045) 0 10px, transparent 10px 22px)",
              }}
            />
            {featured.backdropPath && (
              <img
                key={featured.slug}
                src={tmdbImage(featured.backdropPath, "w1280")}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ animation: "heroFade 0.7s ease" }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, rgba(6,3,4,0.95) 5%, rgba(6,3,4,0.72) 45%, rgba(6,3,4,0.32) 78%), linear-gradient(0deg, rgba(6,3,4,0.95), transparent 60%)",
              }}
            />

            {/* Hero content */}
            <div className="absolute inset-0 flex items-end">
              <div className="w-full px-[22px] sm:px-[36px] lg:px-[50px] pb-[26px] sm:pb-[36px] lg:pb-[46px] flex items-end justify-between gap-[34px]">
                <div className="max-w-[640px] min-w-0 flex-1 flex flex-col gap-[15px] sm:gap-[19px]">
                  <div className="flex items-center gap-[10px] flex-wrap">
                    <span
                      className="px-3 py-1.5 rounded-full text-[11.5px] font-bold tracking-[0.13em] accent-gradient"
                    >
                      POPULER SAAT INI
                    </span>
                    <span
                      className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold tracking-[0.08em] backdrop-blur-[10px]"
                      style={{
                        background: "rgba(255,255,255,0.09)",
                        border: "1px solid rgba(255,255,255,0.16)",
                      }}
                    >
                      {yearOf(featured.releaseDate)} · {newIds.has(featured.id) ? "Baru rilis" : "Terlaris"}
                    </span>
                  </div>
                  <h1
                    className="sora font-extrabold leading-[0.98] tracking-[-0.03em] m-0"
                    style={{
                      fontSize: "clamp(30px,4.6vw,72px)",
                      textShadow: "0 20px 60px rgba(0,0,0,0.7)",
                    }}
                  >
                    {featured.title}
                  </h1>
                  <div className="flex items-center gap-[13px] text-[14px] text-white/72 flex-wrap">
                    <span className="text-[#ff5566] font-bold">
                      {featured.voteAverage ? `${Math.round(Number(featured.voteAverage) * 10)}% cocok` : "Rekomendasi"}
                    </span>
                    <span>{yearOf(featured.releaseDate)}</span>
                    <span
                      className="px-[7px] py-[2px] rounded-[5px] text-xs"
                      style={{ border: "1px solid rgba(255,255,255,0.28)" }}
                    >
                      {featured.genres?.[0]?.name || "Film"}
                    </span>
                  </div>
                  <p
                    className="text-[15.5px] sm:text-[16.5px] leading-[1.6] text-white/72 max-w-[520px] m-0 line-clamp-3"
                    style={{ textWrap: "pretty" } as object}
                  >
                    {featured.overview || "Film pilihan minggu ini dengan kualitas terbaik dan subtitle lengkap."}
                  </p>
                  <div className="flex items-center gap-[13px] pt-1 flex-wrap">
                    <Link
                      href={`/movie/${featured.slug}`}
                      className="flex items-center gap-[10px] px-[26px] sm:px-[30px] py-[13px] sm:py-[15px] rounded-full text-[14.5px] sm:text-[15.5px] font-bold text-white accent-gradient accent-shadow hover:brightness-110 transition-all"
                    >
                      <span className="w-0 h-0 border-l-[11px] border-l-white border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent" />
                      Tonton Sekarang
                    </Link>
                    <Link
                      href={`/movie/${featured.slug}`}
                      className="px-[22px] sm:px-[26px] py-[13px] sm:py-[15px] rounded-full text-[14.5px] sm:text-[15.5px] font-semibold text-white glass-button hover:bg-white/15 transition-all"
                    >
                      Detail
                    </Link>
                  </div>
                </div>

              </div>
            </div>

            {/* Dot indicators */}
            {heroCount > 1 && (
              <div className="absolute bottom-[18px] right-[50px] flex gap-[8px] items-center">
                {Array.from({ length: heroCount }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToSlide(i)}
                    className="rounded-full transition-all"
                    style={{
                      width: i === heroIdx ? "22px" : "7px",
                      height: "7px",
                      background: i === heroIdx ? "#e11d2e" : "rgba(255,255,255,0.35)",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}


      {/* Populer Saat Ini */}
      <section className="px-4 sm:px-6 lg:px-10 pt-[34px] sm:pt-[44px]">
        <div className="flex items-baseline gap-[15px] mb-[18px]">
          <h2 className="sora font-bold text-[23px] m-0">Populer Saat Ini</h2>
          <span className="text-[13px] text-white/42">Diurutkan dari yang paling banyak ditonton</span>
        </div>
        {loading ? (
          <div className="text-sm text-white/50">Memuat...</div>
        ) : (
          <DragCarousel>
            {popular.slice(0, 15).map((movie, idx) => (
              <MovieCard key={movie.id} movie={movie} rank={idx + 1} />
            ))}
          </DragCarousel>
        )}
      </section>

      {/* Populer Series */}
      {!loading && popularSeries.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-10 pt-[34px] sm:pt-[44px]">
          <div className="flex items-baseline justify-between mb-[18px]">
            <h2 className="sora font-bold text-[23px] m-0">Populer Series</h2>
            <Link href="/jelajahi" className="text-[13.5px] font-semibold text-white/55 hover:text-white transition-colors">
              Lihat semua →
            </Link>
          </div>
          <DragCarousel>
            {popularSeries.slice(0, 15).map((series, idx) => (
              <MovieCard key={series.id} movie={series} rank={idx + 1} badge="SERIES" />
            ))}
          </DragCarousel>
        </section>
      )}

      {/* Baru Rilis - campur film & series */}
      {!loading && mixedNewReleases.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-10 pt-[34px] sm:pt-[44px]">
          <div className="flex items-baseline gap-[15px] mb-[18px]">
            <h2 className="sora font-bold text-[23px] m-0">Baru Rilis</h2>
            <span className="text-[13px] text-white/42">Film &amp; serial terbaru</span>
          </div>
          <DragCarousel>
            {mixedNewReleases.map((item, idx) => (
              <MovieCard key={`${item.id}-${idx}`} movie={item} showTypeBadge />
            ))}
          </DragCarousel>
        </section>
      )}

      {/* Film Indonesia Terbaru */}
      {!loading && indoMovies.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-10 pt-[34px] sm:pt-[44px]">
          <div className="flex items-baseline justify-between mb-[18px]">
            <h2 className="sora font-bold text-[23px] m-0">Film Indonesia Terbaru</h2>
            <span className="text-[13px] text-white/42">Karya dalam negeri terbaru</span>
          </div>
          <DragCarousel>
            {indoMovies.slice(0, 15).map((movie, idx) => (
              <MovieCard key={movie.id} movie={movie} rank={idx + 1} badge="INDONESIA" />
            ))}
          </DragCarousel>
        </section>
      )}

      {/* Series Indonesia Terbaru */}
      {!loading && indoSeries.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-10 pt-[34px] sm:pt-[44px]">
          <div className="flex items-baseline justify-between mb-[18px]">
            <h2 className="sora font-bold text-[23px] m-0">Series Indonesia Terbaru</h2>
            <span className="text-[13px] text-white/42">Serial lokal terbaru</span>
          </div>
          <DragCarousel>
            {indoSeries.slice(0, 15).map((series, idx) => (
              <MovieCard key={series.id} movie={series} rank={idx + 1} badge="SERIES" />
            ))}
          </DragCarousel>
        </section>
      )}

      {/* Genre Section */}
      {stats?.genres && stats.genres.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-10 pt-[34px] sm:pt-[44px]">
          <h2 className="sora font-bold text-[23px] mb-[18px] m-0">Jelajahi Genre</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[14px]">
            {stats.genres.slice(0, 12).map((genre) => (
              <Link
                key={genre.id}
                href={`/jelajahi?genre=${genre.id}`}
                className="group relative overflow-hidden cursor-pointer transition-all hover:-translate-y-1"
                style={{
                  padding: "22px 20px 22px 20px",
                  borderRadius: "20px",
                  background: "linear-gradient(150deg, rgba(255,255,255,0.10), rgba(255,255,255,0.025))",
                  border: "1px solid rgba(255,255,255,0.11)",
                  backdropFilter: "blur(22px)",
                  WebkitBackdropFilter: "blur(22px)",
                  boxShadow: "0 8px 32px -12px rgba(0,0,0,0.7)",
                }}
              >
                {/* Red glow corner */}
                <div className="absolute right-[-30px] bottom-[-30px] w-[100px] h-[100px] rounded-full transition-opacity group-hover:opacity-150"
                  style={{ background: "radial-gradient(circle, rgba(225,29,46,0.22), transparent 68%)" }}
                />
                <div className="sora font-bold text-[18px] leading-tight text-white group-hover:text-[#ff5566] transition-colors">{genre.name}</div>
                <div className="mt-[8px] text-[13px] text-white/50 group-hover:text-[#ff5566]/70 transition-colors">
                  {genre.count >= 1000
                    ? `${(genre.count / 1000).toFixed(1).replace(".", ",")} rb`
                    : genre.count} judul
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Stats Section */}
      {stats && (
        <section className="px-4 sm:px-6 lg:px-10 pt-[46px] sm:pt-[60px]">
          <div
            className="relative overflow-hidden rounded-[22px] sm:rounded-[28px] p-[24px] sm:p-[36px] lg:p-[44px]"
            style={{
              background: "linear-gradient(140deg, rgba(255,255,255,0.11), rgba(255,255,255,0.03))",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(22px) saturate(150%)",
              WebkitBackdropFilter: "blur(22px) saturate(150%)",
              boxShadow: "0 30px 80px -30px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            <div
              className="absolute right-[-80px] top-[-80px] w-[340px] h-[340px] rounded-full blur-[10px]"
              style={{ background: "radial-gradient(circle, rgba(255,50,72,0.16), transparent 68%)" }}
            />
            <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-[28px] lg:gap-[40px]">
              <div className="flex flex-col gap-[10px]">
                <h2 className="sora font-extrabold text-[24px] sm:text-[30px] lg:text-[32px] tracking-[-0.02em] m-0">
                  Tontonan seru untuk semua suasana hati.
                </h2>
                <p className="text-[14.5px] sm:text-[15.5px] leading-[1.6] text-white/62 m-0">
                  Ribuan film dan serial dikurasi setiap minggu — subtitle Indonesia, kualitas gambar jernih, dan mudah ditonton di mana saja.
                </p>
              </div>
              <div className="flex gap-[24px] sm:gap-[30px] flex-shrink-0">
                <div className="flex flex-col gap-1">
                  <span className="sora font-extrabold text-[26px] sm:text-[30px]">
                    {stats.catalogTotal ? stats.catalogTotal.toLocaleString("id-ID") : "—"}
                  </span>
                  <span className="text-[12px] sm:text-[12.5px] text-white/50">judul tersedia</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="sora font-extrabold text-[26px] sm:text-[30px]">
                    9,4
                  </span>
                  <span className="text-[12px] sm:text-[12.5px] text-white/50">rata-rata ulasan</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="sora font-extrabold text-[26px] sm:text-[30px]">{stats.genres.length}</span>
                  <span className="text-[12px] sm:text-[12.5px] text-white/50">kategori genre</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="h-[70px]" />
    </div>
  );
}