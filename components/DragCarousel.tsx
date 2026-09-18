"use client";

import { useRef } from "react";
import { motion } from "motion/react";

export default function DragCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      ref={ref}
      className="flex gap-[22px] overflow-x-auto pb-[2px] pt-[10px] no-scrollbar select-none"
      style={{ WebkitOverflowScrolling: "touch" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.div>
  );
}
