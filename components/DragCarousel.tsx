"use client";

import {
  useRef,
  useCallback,
  useState,
  Children,
  cloneElement,
  isValidElement,
} from "react";
import { motion } from "motion/react";

export default function DragCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startScroll = useRef(0);
  const dragDist = useRef(0);
  const [grabbing, setGrabbing] = useState(false);

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

  const getX = (e: React.MouseEvent | React.TouchEvent) =>
    "touches" in e ? e.touches[0].pageX : (e as React.MouseEvent).pageX;

  /** Jump seamlessly when crossing the midpoint of the doubled list */
  const checkLoop = (el: HTMLDivElement) => {
    const half = el.scrollWidth / 2;
    if (el.scrollLeft >= half) {
      el.scrollLeft -= half;
      startScroll.current -= half;
    } else if (el.scrollLeft < 0) {
      el.scrollLeft += half;
      startScroll.current += half;
    }
  };

  const onStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!ref.current) return;
    isDragging.current = true;
    dragDist.current = 0;
    setGrabbing(true);
    startX.current = getX(e) - ref.current.getBoundingClientRect().left;
    startScroll.current = ref.current.scrollLeft;
  }, []);

  const onMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current || !ref.current) return;
    const x = getX(e) - ref.current.getBoundingClientRect().left;
    const delta = startX.current - x;
    dragDist.current = Math.abs(delta);
    ref.current.scrollLeft = startScroll.current + delta;
    checkLoop(ref.current);
  }, []);

  const onEnd = useCallback(() => {
    isDragging.current = false;
    setGrabbing(false);
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragDist.current > 5) e.preventDefault();
  }, []);

  return (
    <motion.div
      ref={ref}
      className="flex gap-[22px] overflow-x-auto pb-[2px] pt-[10px] no-scrollbar select-none"
      style={{ cursor: grabbing ? "grabbing" : "grab", touchAction: "pan-y" as const }}
      onMouseDown={onStart}
      onMouseMove={onMove}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onDragStart={(e) => e.preventDefault()}
      onClickCapture={onClickCapture}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {doubled}
    </motion.div>
  );
}
