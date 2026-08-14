"use client";

import Link from "next/link";
import Image from "next/image";
import { Search, Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import UserMenu from "@/components/UserMenu";
import { useAuth } from "@/lib/client-store";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (q) router.push(`/jelajahi?q=${encodeURIComponent(q)}`);
    setMenuOpen(false);
  };

  const navLinks = [
    { href: "/", label: "Beranda" },
    { href: "/jelajahi", label: "Jelajahi" },
    { href: "/daftar-saya", label: "Daftar Saya" },
    ...(ready && user ? [{ href: "/akun", label: "Akun" }] : []),
  ];

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="relative min-h-screen overflow-x-clip flex flex-col">
      {/* Background layers */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(900px 620px at 78% -8%, rgba(225,29,46,0.16), transparent 70%), radial-gradient(760px 520px at 6% 22%, rgba(120,10,32,0.16), transparent 68%), radial-gradient(1100px 700px at 50% 108%, rgba(200,26,52,0.08), transparent 72%), linear-gradient(180deg, #0b0507 0%, #080405 55%, #0a0507 100%)",
          animation: "skyPulse 11s ease-in-out infinite",
        }}
      />
      <div
        className="fixed top-[14%] left-[-150px] w-[430px] h-[430px] rounded-full pointer-events-none z-0"
        style={{
          background: "radial-gradient(circle, rgba(255,64,84,0.10), transparent 65%)",
          filter: "blur(34px)",
          animation: "skyFloat 15s ease-in-out infinite",
        }}
      />

      {/* Header - floating */}
      <header className="sticky top-0 z-40 px-3 sm:px-6 lg:px-10 pt-3 pb-1 pointer-events-none">
        <div
          className={`pointer-events-auto relative max-w-[1440px] mx-auto rounded-[20px] border transition-all duration-300 ${
            scrolled
              ? "border-white/10 shadow-[0_26px_70px_-22px_rgba(0,0,0,0.95)]"
              : "border-white/10 shadow-[0_20px_55px_-20px_rgba(0,0,0,0.85)]"
          }`}
          style={{
            backdropFilter: "blur(var(--glass-blur)) saturate(160%)",
            WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(160%)",
            background: `linear-gradient(180deg, rgba(58,10,19,0.92) 0%, rgba(12,6,9,0.94) 45%, rgba(5,5,7,0.94) 100%)`,
          }}
        >
          <div className="px-4 sm:px-7 py-[13px] flex items-center gap-x-5 sm:gap-x-7">
            <Link href="/" onClick={closeMenu}>
              <Image src="/assets/skymoon-wordmark.png" alt="SKYMOON" width={128} height={32} className="cursor-pointer" />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex gap-7 text-[14.5px] font-medium ml-2">
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="text-white/60 hover:text-white transition-colors whitespace-nowrap">
                  {l.label}
                </Link>
              ))}
            </nav>

            <div className="flex-1" />

            {/* Search (desktop) */}
            <form
              onSubmit={submitSearch}
              className="hidden md:flex flex-[1_1_190px] min-w-0 max-w-[260px] items-center gap-[9px] px-[15px] py-[9px] rounded-full cursor-text bg-white/8 border border-white/10 whitespace-nowrap focus-within:bg-white/12 transition-colors"
            >
              <Search className="w-[15px] h-[15px] text-white/50 flex-none" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari judul, aktor, genre…"
                className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-[13.5px] text-white/85 placeholder:text-white/45"
              />
            </form>

            {/* User avatar (hanya jika sudah masuk) */}
            <UserMenu />

            {/* Hamburger (mobile/tablet) */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden flex-none w-[38px] h-[38px] rounded-full cursor-pointer grid place-items-center text-white/85 border border-white/16 transition-colors hover:bg-white/10"
              aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            >
              {menuOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
            </button>
          </div>

          {/* Mobile dropdown menu */}
          {menuOpen && (
            <div className="lg:hidden px-4 sm:px-7 pb-4 pt-1 flex flex-col gap-3 border-t border-white/10">
              <form
                onSubmit={submitSearch}
                className="flex items-center gap-[9px] px-[14px] py-[10px] rounded-full bg-white/8 border border-white/10 whitespace-nowrap focus-within:bg-white/12 transition-colors"
              >
                <Search className="w-[15px] h-[15px] text-white/50 flex-none" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Cari judul, aktor, genre…"
                  className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-[14px] text-white/85 placeholder:text-white/45"
                />
              </form>
              <nav className="flex flex-col">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={closeMenu}
                    className="py-[12px] text-[15px] font-medium text-white/70 hover:text-white transition-colors border-b border-white/5"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
            </div>
          )}

          {/* Red accent line at bottom */}
          <div
            className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(225,29,46,0.85) 30%, rgba(255,85,102,0.9) 50%, rgba(225,29,46,0.85) 70%, transparent 100%)",
              boxShadow: "0 0 12px rgba(225,29,46,0.5)",
            }}
          />
        </div>
      </header>

      {/* Content */}
      <div className="relative z-1 flex-1">{children}</div>
    </div>
  );
}
