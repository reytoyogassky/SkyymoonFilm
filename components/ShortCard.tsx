"use client";

import { motion } from "motion/react";

interface Short {
  id: string;
  title: string;
  dur: string;
  rating: string;
  meta: string;
  poster: string;
}

interface ShortCardProps {
  short: Short;
  index: number;
}

export default function ShortCard({ short, index }: ShortCardProps) {
  return (
    <div className="flex-none cursor-pointer w-[158px]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.05 }}
      >
        <div className="relative overflow-hidden stripe-bg-alt aspect-[9/16] rounded-[14px] border border-white/8 transition-colors hover:border-[#7B2CBF]/70 group">
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#05040A]/90 from-4% to-transparent to-55%" />
          
          {/* Placeholder initial */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl text-white/8 sora font-extrabold">
              {short.title[0]}
            </span>
          </div>
          
          {/* Bottom info */}
          <div className="absolute left-[10px] right-[10px] bottom-[10px] flex flex-col gap-[5px]">
            <span className="text-[9.5px] font-mono text-[#D6C4FF]">
              {short.dur}
            </span>
            <span className="text-[12.5px] font-bold leading-[1.25]">
              {short.title}
            </span>
          </div>
          
          {/* Play icon */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity bg-[#7B2CBF]/85">
            <span className="w-0 h-0 border-l-[10px] border-l-white border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-[2px]" />
          </div>
        </div>
        
        {/* Rating + meta */}
        <div className="flex items-center gap-[6px] text-[11.5px] mt-[9px]">
          <span className="text-[#FFD66E]">★ {short.rating}</span>
          <span className="text-[#4E4667]">|</span>
          <span className="text-[#8E85AD]">{short.meta}</span>
        </div>
      </motion.div>
    </div>
  );
}
