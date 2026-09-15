"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Play, Star } from "lucide-react";
import { getNetworkBySlug } from "@/lib/networks";

interface NetworkItem {
  id: string;
  slug: string;
  title: string;
  posterPath: string;
  backdropPath: string;
  releaseDate: string;
  voteAverage: string;
  quality: string;
  country: string;
  isSeries: boolean;
  overview: string;
}

export default function NetworkSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState("");
  const [items, setItems] = useState<NetworkItem[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");
  const [sort, setSort] = useState<"default" | "latest" | "popular">("default");

  useEffect(() => {
    params.then((p) => setSlug(p.slug));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setPage(1);
    setHasMore(true);
    fetch(`/api/network/${slug}?type=${filter}&sort=${sort}&page=1`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setItems(d.data);
          setHasMore(d.hasMore);
          if (d.logos) setLogos(d.logos);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug, filter, sort]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/network/${slug}?type=${filter}&sort=${sort}&page=${nextPage}`);
      const d = await res.json();
      if (d.ok && d.data.length > 0) {
        setItems((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const newItems = d.data.filter((i: NetworkItem) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
        setPage(nextPage);
        setHasMore(d.hasMore);
      } else {
        setHasMore(false);
      }
    } catch {}
    setLoadingMore(false);
  };

  const network = getNetworkBySlug(slug);
  if (!network) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/50">Network not found</p>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen px-6 sm:px-8 lg:px-12 pt-28 pb-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Back + Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link
            href="/network"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white text-[14px] font-semibold mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Semua Network
          </Link>

          <div className="flex items-center gap-5 mb-6">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden"
              style={{
                background: "rgba(157,78,221,0.13)",
                border: "1px solid rgba(157,78,221,0.27)",
              }}
            >
              {logos[network.slug] ? (
                <div
                  className="w-10 h-10"
                  style={{ color: "#fff" }}
                  dangerouslySetInnerHTML={{ __html: logos[network.slug] }}
                />
              ) : (
                <span className="text-[18px] font-extrabold" style={{ color: "#9D4EDD" }}>
                  {network.name.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <h1
                className="text-[28px] sm:text-[36px] font-extrabold"
                style={{ fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.02em" }}
              >
                {network.name}
              </h1>
              <p className="text-white/50 text-[14px]">
                Film & Series dari {network.name}
              </p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2">
            {(["all", "movie", "tv"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-300"
                style={{
                  background: filter === f ? "rgba(157,78,221,0.2)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${filter === f ? "rgba(157,78,221,0.4)" : "rgba(255,255,255,0.1)"}`,
                  color: filter === f ? "#fff" : "rgba(255,255,255,0.6)",
                }}
              >
                {f === "all" ? "Semua" : f === "movie" ? "Film" : "Series"}
              </button>
            ))}
            <div className="w-px h-5 bg-white/10 mx-1" />
            {([
              { key: "default", label: "Semua" },
              { key: "latest", label: "Terbaru" },
              { key: "popular", label: "Populer" },
            ] as const).map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-300"
                style={{
                  background: sort === s.key ? "rgba(157,78,221,0.2)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${sort === s.key ? "rgba(157,78,221,0.4)" : "rgba(255,255,255,0.1)"}`,
                  color: sort === s.key ? "#fff" : "rgba(255,255,255,0.6)",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Content Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#9D4EDD] border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center py-32">
            <p className="text-white/40 text-[15px]">Tidak ada konten ditemukan</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {items.map((item, idx) => (
                <Link
                  key={item.id}
                  href={`/movie/${item.slug}`}
                  className="group"
                >
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.5) }}
                  >
                    <div className="relative overflow-hidden rounded-xl aspect-[2/3]">
                      {item.posterPath ? (
                        <img
                          src={item.posterPath}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#1A1F3A] to-[#0A0E27] flex items-center justify-center">
                          <Play className="w-10 h-10 text-white/20" />
                        </div>
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      {/* Play button */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center shadow-2xl"
                          style={{ background: "#9D4EDD" }}
                        >
                          <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                        </div>
                      </div>

                      {/* Type badge */}
                      <span
                        className="absolute top-2 left-2 text-[9px] font-bold px-2 py-1 rounded-md backdrop-blur-sm"
                        style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)" }}
                      >
                        {item.isSeries ? "SERIES" : "FILM"}
                      </span>

                      {/* Rating */}
                      {item.voteAverage && parseFloat(item.voteAverage) > 0 && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-md backdrop-blur-sm flex items-center gap-1" style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)" }}>
                          <Star className="w-3 h-3 text-yellow-400" fill="#FBBF24" />
                          {parseFloat(item.voteAverage).toFixed(1)}
                        </span>
                      )}

                      {/* Quality badge */}
                      {item.quality && (
                        <span
                          className="absolute bottom-2 left-2 text-[9px] font-bold px-2 py-1 rounded-md backdrop-blur-sm"
                          style={{ background: "rgba(157,78,221,0.8)", color: "#fff" }}
                        >
                          {item.quality}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <div className="mt-2 px-0.5">
                      <h3
                        className="text-[13px] font-semibold text-white/90 line-clamp-2 group-hover:text-white transition-colors leading-tight"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        {item.title}
                      </h3>
                      {item.releaseDate && (
                        <p className="text-[11px] text-white/40 mt-1">
                          {item.releaseDate.split("-")[0] || item.releaseDate}
                        </p>
                      )}
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-8 py-3.5 rounded-xl text-[14px] font-bold transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "rgba(157,78,221,0.13)",
                    border: "1px solid rgba(157,78,221,0.27)",
                    color: "#fff",
                  }}
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Memuat...
                    </span>
                  ) : (
                    "Muat Lebih Banyak"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
