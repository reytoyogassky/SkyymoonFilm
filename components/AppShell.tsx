"use client";

import dynamic from 'next/dynamic';
import Image from 'next/image';

const AppShellClient = dynamic(() => import('./AppShellClient'), {
  ssr: false,
  loading: () => (
    <div className="relative min-h-screen overflow-x-clip flex flex-col" style={{ background: "#0A0E27", color: "#FFFFFF" }}>
      <header className="appshell-header sticky top-0 z-50">
        <div className="appshell-bar flex items-center gap-[24px] lg:gap-[30px]" style={{ minHeight: "68px" }}>
          <Image
            src="/assets/skyy-logo.png"
            alt="SKYYMOVIE"
            width={160}
            height={50}
            priority
            style={{ filter: "drop-shadow(0 0 14px rgba(123,44,191,0.5))", width: 'auto', height: 'auto' }}
          />
        </div>
      </header>
      <div className="relative z-1 flex-1" />
    </div>
  ),
});

export default function AppShell({ children }: { children: React.ReactNode }) {
  return <AppShellClient>{children}</AppShellClient>;
}
