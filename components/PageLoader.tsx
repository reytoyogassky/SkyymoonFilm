"use client";

import Image from "next/image";

export default function PageLoader() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-[28px]"
      style={{ background: "#05040A" }}
    >
      {/* SKYYMOVIE logo */}
      <div style={{ animation: "loaderPulse 1.8s ease-in-out infinite" }}>
        <Image
          src="/assets/skyy-logo.png"
          alt="SKYYMOVIE"
          width={180}
          height={50}
          priority
          style={{ width: 'auto', height: 'auto', maxWidth: '180px', maxHeight: '50px' }}
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
            background: "linear-gradient(90deg, #7B2CBF, #9D4EDD)",
            animation: "loaderBar 1.6s ease-in-out infinite",
            width: "45%",
          }}
        />
      </div>
    </div>
  );
}
