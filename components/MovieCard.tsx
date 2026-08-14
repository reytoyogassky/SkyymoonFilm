"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Star } from "lucide-react";
import { tmdbImage, yearOf, type MovieListItem } from "@/lib/types";

interface MovieCardProps {
  movie: MovieListItem & { isSeries?: boolean };
  rank?: number;
  badge?: string;
  showTypeBadge?: boolean;
  index?: number;
}

export default function MovieCard({ movie, rank, badge, showTypeBadge, index = 0 }: MovieCardProps) {
  const rating = movie.voteAverage ? Number(movie.voteAverage) : 0;
  const ratingLabel = rating > 0 ? rating.toFixed(1) : null;
  const isSeries = movie.isSeries || movie.slug?.startsWith("tv-");
  const typeBadge = showTypeBadge ? (isSeries ? "SERIES" : "FILM") : null;
  const topRightBadge = badge ?? typeBadge;

  return (
    <Link
      href={`/movie/${movie.slug}`}
      className="group flex-none w-[176px] flex flex-col gap-[10px] cursor-pointer"
      draggable={false}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.05 }}
        whileHover={{ y: -8, transition: { duration: 0.2 } }}
      >
        {/* Poster */}
        <motion.div
          className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-gradient-to-br from-[#2a0a12] to-[#0e0608]"
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 18px 44px -20px rgba(0,0,0,0.85)",
          }}
          whileHover={{ 
            scale: 1.02,
            boxShadow: "0 24px 56px -24px rgba(225,29,46,0.5)",
            borderColor: "rgba(255,85,102,0.3)",
            transition: { duration: 0.3 }
          }}
        >
          {movie.posterPath ? (
            <img
              src={tmdbImage(movie.posterPath, "w342")}
              alt={movie.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_8px,transparent_8px_18px)]" />
          )}

          {/* Rank badge — top left */}
          {rank !== undefined && (
            <motion.div
              className="absolute top-[10px] left-[10px] w-[28px] h-[28px] rounded-[8px] grid place-items-center sora font-extrabold text-[13px] text-white group-hover:text-[#ff5566] transition-colors"
              style={{
                background: "rgba(10,4,6,0.72)",
                border: "1px solid rgba(255,255,255,0.18)",
                backdropFilter: "blur(14px)",
              }}
              whileHover={{ scale: 1.15, rotate: 5 }}
            >
              {rank}
            </motion.div>
          )}

          {/* Type badge — top right */}
          {topRightBadge && (
            <span
              className="absolute top-[10px] right-[10px] px-[7px] py-[3px] rounded-full text-[9px] font-bold tracking-[0.1em] whitespace-nowrap text-white group-hover:text-[#ff5566] transition-colors"
              style={{
                background: "rgba(10,4,6,0.72)",
                border: "1px solid rgba(255,255,255,0.18)",
                backdropFilter: "blur(10px)",
              }}
            >
              {topRightBadge}
            </span>
          )}

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
        </motion.div>

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
      </motion.div>
    </Link>
  );
}
