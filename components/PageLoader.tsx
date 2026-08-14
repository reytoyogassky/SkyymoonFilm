"use client";

import Image from "next/image";

export default function PageLoader() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-[28px]"
      style={{ background: "#080405" }}
    >
      {/* Sky-mark */}
      <div style={{ animation: "loaderPulse 1.8s ease-in-out infinite" }}>
        <Image
          src="/assets/sky-mark.png"
          alt="SKYMOON"
          width={96}
          height={96}
          priority
        />
      </div>

      {/* Progress bar */}
      <div
        className="w-[200px] h-[5px] rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.10)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, #e11d2e, #ff5566)",
            animation: "loaderBar 1.6s ease-in-out infinite",
            width: "45%",
          }}
        />
      </div>
    </div>
  );
}
