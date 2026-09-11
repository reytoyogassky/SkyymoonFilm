"use client";

import { Suspense } from "react";
import { motion } from "motion/react";
import AuthForm from "@/components/AuthForm";
import PageLoader from "@/components/PageLoader";

export default function DaftarPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <DaftarContent />
    </Suspense>
  );
}

function DaftarContent() {
  return (
    <div className="relative px-6 sm:px-8 lg:px-12 pt-16 pb-24 flex justify-center">
      <motion.div
        className="w-full max-w-[480px] flex flex-col gap-8"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-col gap-3">
          <h1 className="font-extrabold text-[40px] tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Create Account
          </h1>
          <p className="text-[16px] text-white/60 leading-relaxed">
            Start your journey with unlimited movies & shows.
          </p>
        </div>
        <motion.div 
          className="p-8 sm:p-10 rounded-2xl shadow-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(20px)",
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <AuthForm mode="register" />
        </motion.div>
      </motion.div>
    </div>
  );
}