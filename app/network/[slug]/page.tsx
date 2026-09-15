"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Play, Star, Filter } from "lucide-react";
import { getNetworkBySlug, NETWORKS } from "@/lib/networks";

interface NetworkItem {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  releaseDate: string;
  overview: string;
  mediaType: "movie" | "tv";
}

export default function NetworkSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState("");
  const [items, setItems] = useState<NetworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");
  const [searching, setSearching] = useState<Record<string, boolean>>({});

  useEffect(() => {
    params.then((p) => setSlug(p.slug));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/network/${slug}?type=${filter}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setItems(d.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug, filter]);

  const network = getNetworkBySlug(slug);
  if (!network) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/50">Network not found</p>
      </div>
    );
  }

  const handlePlay = async (item: NetworkItem) => {
    const key = `${item.tmdbId}`;
    setSearching((prev) => ({ ...prev, [key]: true }));

    try {
      const query = encodeURIComponent(item.title);
      const typeParam = item.mediaType === "tv" ? "&type=tv" : "";
      const res = await fetch(`/api/catalog/search?q=${query}&limit=5${typeParam}`);
      const data = await res.json();

      if (data.ok && data.data && data.data.length > 0) {
        // Find best match by title similarity
        const match = data.data.find(
          (m: { title: string; slug: string }) =>
            m.title.toLowerCase().includes(item.title.toLowerCase()) ||
            item.title.toLowerCase().includes(m.title.toLowerCase())
        ) || data.data[0];
        window.location.href = `/movie/${match.slug}`;
      } else {
        // Fallback: open TMDB page
        const tmdbUrl = item.mediaType === "tv"
          ? `https://www.themoviedb.org/tv/${item.tmdbId}`
          : `https://www.themoviedb.org/movie/${item.tmdbId}`;
        window.open(tmdbUrl, "_blank");
      }
    } catch {
      window.open(`https://www.themoviedb.org/search?query=${encodeURIComponent(item.title)}`, "_blank");
    } finally {
      setSearching((prev) => ({ ...prev, [key]: false }));
    }
  };

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
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{
                background: `${network.color}22`,
                border: `1px solid ${network.color}44`,
              }}
            >
              <img
                src={network.logo}
                alt={network.name}
                className="w-8 h-8 object-contain"
                style={{ filter: "brightness(0) invert(1) opacity(0.9)" }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                }}
              />
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
                  background: filter === f ? `${network.color}33` : "rgba(255,255,255,0.06)",
                  border: `1px solid ${filter === f ? `${network.color}66` : "rgba(255,255,255,0.1)"}`,
                  color: filter === f ? "#fff" : "rgba(255,255,255,0.6)",
                }}
              >
                {f === "all" ? "Semua" : f === "movie" ? "Film" : "Series"}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {items.map((item, idx) => (
              <motion.div
                key={item.tmdbId}
                className="group cursor-pointer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.5) }}
                onClick={() => handlePlay(item)}
              >
                <div className="relative overflow-hidden rounded-xl aspect-[2/3]">
                  {item.posterPath ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
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
                      style={{ background: network.color }}
                    >
                      {searching[`${item.tmdbId}`] ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                      )}
                    </div>
                  </div>

                  {/* Type badge */}
                  <span
                    className="absolute top-2 left-2 text-[9px] font-bold px-2 py-1 rounded-md backdrop-blur-sm"
                    style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    {item.mediaType === "tv" ? "SERIES" : "FILM"}
                  </span>

                  {/* Rating */}
                  {item.voteAverage > 0 && (
                    <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-md backdrop-blur-sm flex items-center gap-1" style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)" }}>
                      <Star className="w-3 h-3 text-yellow-400" fill="#FBBF24" />
                      {item.voteAverage.toFixed(1)}
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
                      {item.releaseDate.split("-")[0]}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
