"use client";

import Link from "next/link";
import { useWatchlist } from "@/lib/client-store";
import { idlixImage, yearOf } from "@/lib/media";

export default function DaftarSayaPage() {
  const { list } = useWatchlist();

  return (
    <div className="relative px-6 sm:px-8 lg:px-12 pt-16 pb-24">
      <div className="flex items-end justify-between gap-8 mb-10">
        <div className="flex flex-col gap-3">
          <h1 className="font-extrabold text-[44px] tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>My List</h1>
          <p className="text-[16px] text-white/60">
            {list.length} titles saved · ready to watch anytime
          </p>
        </div>
        <Link
          href="/jelajahi"
          className="px-6 py-3.5 rounded-xl text-[14px] font-semibold text-white transition-all duration-300 hover:scale-105 whitespace-nowrap"
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          + Add Titles
        </Link>
      </div>

      {list.length === 0 ? (
        <div 
          className="py-24 px-12 rounded-2xl text-center flex flex-col items-center gap-5 border-dashed" 
          style={{ 
            background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))", 
            border: "2px dashed rgba(255,255,255,0.2)" 
          }}
        >
          <div className="font-bold text-[24px]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Your list is empty</div>
          <div className="text-[15px] text-white/60 max-w-[420px] leading-relaxed">
            Save any title from the detail page to watch later.
          </div>
          <Link
            href="/jelajahi"
            className="mt-3 px-8 py-4 rounded-xl text-[15px] font-bold text-white transition-all duration-300 hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
              boxShadow: "0 8px 24px rgba(123,44,191,0.4)",
            }}
          >
            Browse Catalog
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {list.map((movie) => (
            <Link
              key={movie.slug}
              href={`/movie/${movie.slug}`}
              className="flex flex-col gap-3 cursor-pointer hover:-translate-y-2 transition-all duration-300"
            >
              <div
                className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gradient-to-br from-[#1A1F3A] to-[#0D1128]"
                style={{
                  border: "1px solid rgba(255,255,255,0.15)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                }}
              >
                {movie.posterPath ? (
                  <img
                    src={idlixImage(movie.posterPath, "w342")}
                    alt={movie.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.03)_0_10px,transparent_10px_20px)]" />
                )}
              </div>
              <div className="font-semibold text-[15px] leading-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{movie.title}</div>
              <div className="text-[13px] text-white/50">{yearOf(movie.releaseDate)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
