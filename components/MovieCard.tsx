"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Play, Star } from "lucide-react";
import { idlixImage, yearOf } from "@/lib/media";
import type { MovieListItem } from "@/lib/types";

interface MovieCardProps {
  movie: MovieListItem & { isSeries?: boolean };
  rank?: number;
  badge?: string;
  showTypeBadge?: boolean;
  index?: number;
  variant?: "poster" | "wide";
}

export default function MovieCard({
  movie,
  rank,
  badge,
  showTypeBadge,
  index = 0,
  variant = "poster",
}: MovieCardProps) {
  const rating = movie.voteAverage ? Number(movie.voteAverage) : 0;
  const ratingLabel = rating > 0 ? rating.toFixed(1) : null;
  const isSeries = movie.isSeries || movie.slug?.startsWith("tv-");
  const typeBadge = showTypeBadge ? (isSeries ? "SERIES" : "FILM") : null;
  const topRightBadge = badge ?? typeBadge;
  const isWide = variant === "wide";

  return (
    <Link
      href={`/movie/${movie.slug}`}
      className="group flex-none cursor-pointer"
      style={{ width: isWide ? "320px" : "min(180px, 42vw)" }}
      draggable={false}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ 
          duration: 0.5, 
          delay: index * 0.06,
          ease: [0.34, 1.56, 0.64, 1]
        }}
        whileHover={{ y: -8, transition: { duration: 0.3 } }}
      >
        {/* Card Container */}
        <div className="relative overflow-hidden rounded-2xl">
          {/* Poster / Thumbnail */}
          <div
            className="relative overflow-hidden bg-gradient-to-br from-[#1A1F3A] via-[#252B48] to-[#131829]"
            style={{
              height: isWide ? "180px" : "270px",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            }}
          >
            {/* Image */}
            {movie.posterPath && !isWide && (
              <motion.img
                src={idlixImage(movie.posterPath, "w342")}
                alt={movie.title}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.4 }}
              />
            )}
            {movie.backdropPath && isWide && (
              <motion.img
                src={idlixImage(movie.backdropPath, "w780")}
                alt={movie.title}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.4 }}
              />
            )}

            {/* Gradient overlay on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Play button overlay */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
              initial={false}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-2xl"
                style={{
                  background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
                }}
                whileHover={{ scale: 1.2, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
              >
                <Play className="w-7 h-7 text-white ml-1" fill="white" />
              </motion.div>
            </motion.div>

            {/* Rank badge - Large number style */}
            {rank !== undefined && (
              <motion.div
                className="absolute top-3 left-3 w-10 h-10 rounded-xl grid place-items-center font-black text-lg backdrop-blur-md"
                style={{
                  background: "linear-gradient(135deg, rgba(123,44,191,0.95), rgba(157,78,221,0.95))",
                  border: "1px solid rgba(255,255,255,0.2)",
                  boxShadow: "0 4px 12px rgba(123,44,191,0.6)",
                  fontFamily: "Space Grotesk, sans-serif",
                }}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: index * 0.06 + 0.3, type: "spring", stiffness: 200 }}
              >
                {rank}
              </motion.div>
            )}

            {/* Type badge - Modern pill style */}
            {topRightBadge && (
              <motion.span
                className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-[9px] font-bold tracking-widest backdrop-blur-md"
                style={{
                  background: "rgba(0,0,0,0.7)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.06 + 0.2 }}
              >
                {topRightBadge}
              </motion.span>
            )}

            {/* Rating badge - Bottom left */}
            {ratingLabel && (
              <motion.div
                className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg backdrop-blur-md flex items-center gap-1.5"
                style={{
                  background: "rgba(0,0,0,0.7)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 + 0.25 }}
              >
                <Star className="w-3.5 h-3.5 text-yellow-400" fill="#FBBF24" />
                <span className="text-xs font-bold text-white">{ratingLabel}</span>
              </motion.div>
            )}

            {/* Border glow on hover */}
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#7B2CBF] rounded-2xl transition-all duration-300 pointer-events-none" 
                 style={{ boxShadow: "0 0 0 0 rgba(123,44,191,0)" }} />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity duration-300 pointer-events-none"
                 style={{ boxShadow: "0 0 30px rgba(123,44,191,0.5)" }} />
          </div>

          {/* Info section with new typography */}
          <div className="mt-3 px-1">
            <h3 
              className="font-bold text-[15px] leading-tight line-clamp-2 mb-1.5 group-hover:text-[#9D4EDD] transition-colors duration-200"
              style={{ fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.01em" }}
            >
              {movie.title}
            </h3>

            <div className="flex items-center gap-2 text-[12px] text-white/50">
              {movie.releaseDate && (
                <span className="font-medium">{yearOf(movie.releaseDate)}</span>
              )}
              {movie.genres?.[0]?.name && (
                <>
                  <span className="text-white/30">•</span>
                  <span className="text-white/40">{movie.genres[0].name}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
