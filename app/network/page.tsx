"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { NETWORKS } from "@/lib/networks";

export default function NetworkPage() {
  const [logos, setLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/network/logos")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setLogos(d.logos); })
      .catch(() => {});
  }, []);

  return (
    <motion.div
      className="min-h-screen px-6 sm:px-8 lg:px-12 pt-28 pb-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1
            className="text-[32px] sm:text-[42px] font-extrabold mb-3"
            style={{ fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.02em" }}
          >
            Browse by Network
          </h1>
          <p className="text-white/55 text-[15px] max-w-[520px] leading-relaxed">
            Jelajahi film dan series berdasarkan jaringan streaming favoritmu.
          </p>
        </motion.div>

        {/* Network Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
          {NETWORKS.map((network, idx) => (
            <Link
              key={network.slug}
              href={`/network/${network.slug}`}
              className="group"
            >
              <motion.div
                className="relative rounded-2xl overflow-hidden aspect-[4/5] flex flex-col items-center justify-center gap-5 cursor-pointer transition-all duration-300"
                style={{
                  background: `linear-gradient(135deg, ${network.color}22, ${network.color}08)`,
                  border: `1px solid ${network.color}33`,
                }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                whileHover={{
                  scale: 1.04,
                  boxShadow: `0 20px 50px ${network.color}33`,
                  borderColor: `${network.color}88`,
                }}
              >
                {/* Glow effect */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(circle at center, ${network.color}15, transparent 70%)`,
                  }}
                />

                {/* Logo */}
                <div className="relative z-10 w-[120px] h-[60px] flex items-center justify-center">
                  {logos[network.slug] ? (
                    <div
                      className="max-w-full max-h-full"
                      style={{ color: "#fff" }}
                      dangerouslySetInnerHTML={{ __html: logos[network.slug] }}
                    />
                  ) : (
                    <span
                      className="text-[22px] font-extrabold"
                      style={{ color: network.color, fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      {network.name}
                    </span>
                  )}
                </div>

                {/* Name */}
                <span
                  className="relative z-10 text-[15px] font-bold text-white/80 group-hover:text-white transition-colors"
                  style={{ fontFamily: "Space Grotesk, sans-serif" }}
                >
                  {network.name}
                </span>

                {/* Arrow hint */}
                <div
                  className="absolute bottom-4 right-4 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1"
                  style={{
                    background: `${network.color}33`,
                    border: `1px solid ${network.color}55`,
                  }}
                >
                  <span className="text-white/80 text-[14px]">→</span>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
