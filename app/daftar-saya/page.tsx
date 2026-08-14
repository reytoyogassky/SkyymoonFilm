"use client";

import Link from "next/link";
import { useWatchlist } from "@/lib/client-store";
import { tmdbImage, yearOf } from "@/lib/media";

export default function DaftarSayaPage() {
  const { list } = useWatchlist();

  return (
    <div className="relative px-4 sm:px-6 lg:px-10 pt-[48px] pb-[90px]">
      <div className="flex items-end justify-between gap-8 mb-[26px]">
        <div className="flex flex-col gap-2">
          <h1 className="sora font-extrabold text-[40px] tracking-tight">Daftar Saya</h1>
          <p className="text-[15px] text-white/55">
            {list.length} judul disimpan · siap ditonton kapan saja
          </p>
        </div>
        <Link
          href="/jelajahi"
          className="px-6 py-3 rounded-full text-sm font-semibold text-white glass-button hover:bg-white/16 transition-colors whitespace-nowrap"
        >
          + Tambah judul
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="py-[80px] px-10 rounded-[26px] text-center flex flex-col items-center gap-[14px] border-dashed" style={{ background: "linear-gradient(150deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))", border: "1px dashed rgba(255,255,255,0.16)" }}>
          <div className="sora font-bold text-[21px]">Daftar Anda masih kosong</div>
          <div className="text-[14.5px] text-white/55 max-w-[380px]">
            Simpan judul apa pun dari halaman detail untuk ditonton nanti.
          </div>
          <Link
            href="/jelajahi"
            className="mt-2 px-7 py-3 rounded-full text-[14.5px] font-bold text-white accent-gradient hover:brightness-110 transition-all"
          >
            Jelajahi katalog
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-[22px]">
          {list.map((movie) => (
            <Link
              key={movie.slug}
              href={`/movie/${movie.slug}`}
              className="flex flex-col gap-[10px] cursor-pointer hover:-translate-y-1 transition-transform"
            >
              <div
                className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-gradient-to-br from-[#2a0a12] to-[#0e0608]"
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  boxShadow: "0 18px 44px -20px rgba(0,0,0,0.85)",
                }}
              >
                {movie.posterPath ? (
                  <img
                    src={tmdbImage(movie.posterPath, "w342")}
                    alt={movie.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_8px,transparent_8px_18px)]" />
                )}
              </div>
              <div className="sora font-semibold text-[14.5px] leading-tight">{movie.title}</div>
              <div className="text-[12px] text-white/45">{yearOf(movie.releaseDate)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
