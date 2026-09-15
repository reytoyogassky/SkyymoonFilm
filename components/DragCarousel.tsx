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
  const velocityRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);
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

  const onStart = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    isDragging.current = true;
    dragDist.current = 0;
    velocityRef.current = 0;
    setGrabbing(true);
    startX.current = e.pageX - ref.current.getBoundingClientRect().left;
    startScroll.current = ref.current.scrollLeft;
    lastXRef.current = e.pageX;
    lastTimeRef.current = Date.now();
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !ref.current) return;
    const x = e.pageX - ref.current.getBoundingClientRect().left;
    const delta = startX.current - x;
    dragDist.current = Math.abs(delta);
    ref.current.scrollLeft = startScroll.current + delta;
    checkLoop(ref.current);
    const now = Date.now();
    const dt = now - lastTimeRef.current;
    if (dt > 0) velocityRef.current = (e.pageX - lastXRef.current) / dt;
    lastXRef.current = e.pageX;
    lastTimeRef.current = now;
  }, []);

  const onEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setGrabbing(false);
    if (!ref.current) return;
    const vx = velocityRef.current;
    if (Math.abs(vx) > 0.2) {
      const targetScroll = ref.current.scrollLeft - vx * 300;
      ref.current.scrollTo({ left: targetScroll, behavior: "smooth" });
    }
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragDist.current > 5) e.preventDefault();
  }, []);

  return (
    <motion.div
      ref={ref}
      className="flex gap-[22px] overflow-x-auto pb-[2px] pt-[10px] no-scrollbar select-none scroll-smooth"
      style={{ cursor: grabbing ? "grabbing" : "grab", WebkitOverflowScrolling: "touch" }}
      onMouseDown={onStart}
      onMouseMove={onMove}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
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
