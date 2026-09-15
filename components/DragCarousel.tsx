"use client";

import {
  useRef,
  useEffect,
  Children,
  cloneElement,
  isValidElement,
} from "react";
import { motion } from "motion/react";

export default function DragCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // Double the items so we can loop seamlessly
  const childArr = Children.toArray(children);
  const doubled = [
    ...childArr.map((child, i) =>
      isValidElement(child)
        ? cloneElement(child as React.ReactElement<{ key?: string; index?: number }>, { 
            key: `main_${i}`,
            index: i 
          })
        : child
    ),
    ...childArr.map((child, i) =>
      isValidElement(child)
        ? cloneElement(child as React.ReactElement<{ key?: string; index?: number }>, { 
            key: `loop_${i}`,
            index: i + childArr.length
          })
        : child
    ),
  ];

  // Infinite loop: jump seamlessly when crossing the midpoint
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const checkLoop = () => {
      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half - 10) {
        el.scrollLeft = el.scrollLeft - half;
      } else if (el.scrollLeft <= 10) {
        el.scrollLeft = el.scrollLeft + half;
      }
    };

    el.addEventListener('scroll', checkLoop, { passive: true });
    return () => el.removeEventListener('scroll', checkLoop);
  }, []);

  return (
    <motion.div
      ref={ref}
      className="flex gap-[22px] overflow-x-auto pb-[2px] pt-[10px] no-scrollbar select-none"
      style={{ WebkitOverflowScrolling: "touch" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {doubled}
    </motion.div>
  );
}
