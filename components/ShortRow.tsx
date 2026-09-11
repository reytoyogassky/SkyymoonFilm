"use client";

import DragCarousel from "@/components/DragCarousel";
import ShortCard from "@/components/ShortCard";

interface Short {
  id: string;
  title: string;
  dur: string;
  rating: string;
  meta: string;
  poster: string;
}

interface ShortRowProps {
  title: string;
  subtitle: string;
  items: Short[];
}

export default function ShortRow({ title, subtitle, items }: ShortRowProps) {
  return (
    <section className="px-10 pt-8">
      <div className="flex items-center justify-between gap-4 mb-[6px]">
        <h2 className="sora text-[19px] font-bold m-0">{title}</h2>
        <span className="text-[13px] text-[#9D4EDD] cursor-pointer">
          Mode Pendek
        </span>
      </div>
      <div className="text-xs text-[#8E85AD] mb-4">{subtitle}</div>
      <DragCarousel>
        {items.map((item, idx) => (
          <ShortCard key={item.id} short={item} index={idx} />
        ))}
      </DragCarousel>
    </section>
  );
}
