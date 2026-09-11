"use client";

import Link from "next/link";

interface Short {
  id: string;
  title: string;
  dur: string;
  rating: string;
  meta: string;
  poster: string;
}

interface PendekHeroProps {
  short: Short;
}

export default function PendekHero({ short }: PendekHeroProps) {
  return (
    <section className="relative overflow-hidden min-h-[520px] -mt-[68px]">
      <div className="absolute inset-0 stripe-bg" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#05040A] via-[#05040A]/74 via-48% to-[#05040A]/10 to-86%" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#05040A] from-1% to-transparent to-52%" />

      <div className="relative flex gap-7 items-end flex-wrap px-10 pt-[150px] pb-[46px]">
        {/* 9:16 poster */}
        <div className="relative flex-none overflow-hidden stripe-bg-alt w-[170px] aspect-[9/16] rounded-[14px] border border-white/12 shadow-[0_22px_60px_rgba(0,0,0,0.6)]">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl text-white/10 sora font-extrabold">
              {short.title[0]}
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3 min-w-[280px]">
          <span className="self-start text-[10px] tracking-[0.16em] uppercase px-[11px] py-[6px] rounded-full font-mono bg-purple-500/22 border border-purple-500/50 text-[#D6C4FF]">
            FILM PENDEK PILIHAN
          </span>
          <h1 className="sora text-[46px] leading-[1.04] font-extrabold tracking-tight m-0">
            {short.title}
          </h1>
          <div className="text-[13px] font-bold text-[#D6CEE9]">
            {short.meta} · {short.dur}
          </div>
          <p className="m-0 max-w-[560px] text-[13.5px] leading-[1.62] text-[#A79EC2]">
            Sebuah perjalanan yang mengubah segalanya. Film pendek ini
            mengisahkan cerita yang menyentuh tentang keberanian dan
            pengorbanan dalam waktu yang singkat namun berkesan.
          </p>
          <div className="flex items-center gap-[10px] mt-2 flex-wrap">
            <button className="flex items-center gap-[9px] px-[21px] py-[11px] rounded-lg text-[13px] font-bold text-white bg-[#7B2CBF] shadow-[0_10px_28px_rgba(123,44,191,0.42)] border-none cursor-pointer">
              <span className="w-0 h-0 border-l-[8px] border-l-white border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent" />
              Putar Sekarang
            </button>
            <Link
              href="/pendek"
              className="flex items-center gap-[9px] px-[19px] py-[11px] rounded-lg text-[13px] font-medium text-[#F4F1FB] border border-white/20 bg-white/5 cursor-pointer"
            >
              Mode Pendek
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
