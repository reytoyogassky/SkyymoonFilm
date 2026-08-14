"use client";

import { Suspense } from "react";
import { motion } from "motion/react";
import AuthForm from "@/components/AuthForm";
import PageLoader from "@/components/PageLoader";

export default function MasukPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MasukContent />
    </Suspense>
  );
}

function MasukContent() {
  return (
    <div className="relative px-4 sm:px-6 lg:px-10 pt-[52px] pb-[90px] flex justify-center">
      <motion.div
        className="w-full max-w-[440px] flex flex-col gap-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex flex-col gap-2">
          <h1 className="sora font-extrabold text-[34px] tracking-tight">Masuk</h1>
          <p className="text-[14.5px] text-white/50">
            Lanjutkan menonton film & serial favoritmu.
          </p>
        </div>
        <div className="p-6 sm:p-8 rounded-[24px] glass-panel shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)]">
          <AuthForm mode="login" />
        </div>
      </motion.div>
    </div>
  );
}