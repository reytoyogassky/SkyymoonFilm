"use client";

import Link from "next/link";
import Image from "next/image";
import { Search, Menu, X, User } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/client-store";
import { initDragScroll } from "@/lib/drag-scroll";

export default function AppShellClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    initDragScroll();
  }, []);

  // Clear search input when navigating away from browse/home page
  useEffect(() => {
    if (pathname !== "/jelajahi" && pathname !== "/") {
      // Clear any pending search timer
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      isNavigatingRef.current = true;
      setSearchInput("");
      // Reset flag after a short delay
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 100);
    }
  }, [pathname]);

  useEffect(() => {
    // Don't trigger search if we're in the middle of navigation
    if (isNavigatingRef.current) {
      return;
    }
    
    const q = searchInput.trim();
    
    // Clear any existing timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    
    if (!q) {
      if (pathname === "/jelajahi") {
        router.replace("/jelajahi");
      }
      return;
    }
    
    // Only trigger search navigation from home or browse page
    if (pathname !== "/" && pathname !== "/jelajahi") {
      return;
    }
    
    searchTimerRef.current = setTimeout(() => {
      if (pathname === "/jelajahi") {
        router.replace(`/jelajahi?q=${encodeURIComponent(q)}&source=all`);
      } else {
        router.push(`/jelajahi?q=${encodeURIComponent(q)}&source=all`);
      }
    }, 300);
    
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [searchInput, router, pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setMenuOpen(false);
  };

  const navLinks = [
    { href: "/", label: "Home", key: "home", comingSoon: false },
    { href: "/jelajahi", label: "Browse", key: "explore", comingSoon: false },
    { href: "/network", label: "Network", key: "network", comingSoon: false },
    { href: "/daftar-saya", label: "My List", key: "list", comingSoon: false },
    { href: "#", label: "Shorts", key: "shorts", comingSoon: true },
  ] as const;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="relative min-h-screen overflow-x-clip flex flex-col" style={{ background: "#0A0E27", color: "#FFFFFF" }}>
      {/* Modern Header with glass effect */}
      <header 
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          background: scrolled 
            ? "rgba(10,14,39,0.75)" 
            : "transparent",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.05)" : "none",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
        }}
      >
        <div className="flex items-center gap-8 px-6 lg:px-12 py-4">
          {/* Logo with glow effect */}
          <Link href="/" onClick={closeMenu} className="flex-none group">
            <Image
              src="/assets/skyy-logo.png"
              alt="SKYYMOVIE"
              width={200}
              height={60}
              className="cursor-pointer transition-all duration-300 group-hover:scale-105"
              style={{ 
                filter: "drop-shadow(0 0 20px rgba(123,44,191,0.6))",
                width: 'auto', 
                height: scrolled ? '50px' : '60px',
                transition: "height 0.3s ease"
              }}
              loading="eager"
              priority
            />
          </Link>

          {/* Desktop nav with modern pills */}
          <nav className="hidden lg:flex items-center gap-2">
            {navLinks.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.key}
                  href={l.href}
                  onClick={(e) => {
                    if (l.comingSoon) {
                      e.preventDefault();
                    }
                  }}
                  className="relative whitespace-nowrap rounded-full font-semibold transition-all duration-300 px-5 py-2.5 text-[14px] hover:text-white"
                  style={{
                    background: active 
                      ? "linear-gradient(135deg, rgba(123,44,191,0.25) 0%, rgba(157,78,221,0.25) 100%)" 
                      : "transparent",
                    color: active ? "#FFFFFF" : "#A0AEC0",
                    border: active ? "1px solid rgba(157,78,221,0.3)" : "1px solid transparent",
                    cursor: l.comingSoon ? "not-allowed" : "pointer",
                    opacity: l.comingSoon ? 0.5 : 1,
                    textAlign: "center",
                  }}
                  onMouseEnter={(e) => {
                    if (!active && !l.comingSoon) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.border = "1px solid transparent";
                    }
                  }}
                >
                  {active && (
                    <div 
                      className="absolute inset-0 rounded-full opacity-50 blur-md"
                      style={{
                        background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
                      }}
                    />
                  )}
                  <span className="relative z-10">
                    {l.label}
                    {l.comingSoon && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-white/10">
                        Soon
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            {/* Modern search bar (desktop) */}
            <form
              onSubmit={submitSearch}
              className="hidden md:flex items-center gap-3 w-[280px] px-5 py-3 rounded-2xl transition-all duration-300 group"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Search className="w-4 h-4 flex-none text-white/50 group-focus-within:text-[#9D4EDD] transition-colors" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search movies, series..."
                className="flex-1 min-w-0 bg-transparent border-none text-[14px] text-white placeholder:text-white/40 outline-none"
              />
            </form>

            {/* User section with modern styling */}
            {ready && user ? (
              <Link
                href="/akun"
                className="hidden md:flex items-center gap-3 px-4 py-2.5 pl-2.5 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-105"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[14px] shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, #7B2CBF, #9D4EDD)",
                    color: "#fff",
                  }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-[14px] font-semibold">{user.name}</span>
              </Link>
            ) : (
              <Link
                href="/masuk"
                className="hidden md:flex items-center gap-2 px-6 py-3 rounded-2xl text-[14px] font-semibold whitespace-nowrap transition-all duration-300 hover:scale-105"
                style={{
                  background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
                  color: "#FFFFFF",
                  boxShadow: "0 4px 16px rgba(123,44,191,0.4)",
                }}
              >
                <User className="w-4 h-4" />
                <span>Sign In</span>
              </Link>
            )}

            {/* Modern hamburger button */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden flex-none w-11 h-11 rounded-2xl cursor-pointer grid place-items-center transition-all duration-300 hover:scale-105"
              style={{
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.05)",
                color: "#FFFFFF",
              }}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Modern mobile menu with backdrop blur */}
      {menuOpen && (
        <div
          className="lg:hidden fixed inset-0 top-[76px] z-40 px-6 py-6 flex flex-col gap-4 animate-[slideUp_0.3s_ease]"
          style={{ 
            background: "rgba(10,14,39,0.98)", 
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            borderTop: "1px solid rgba(255,255,255,0.08)"
          }}
        >
          {/* Mobile search */}
          <form
            onSubmit={submitSearch}
            className="flex items-center gap-3 px-5 py-3 rounded-2xl"
            style={{ 
              background: "rgba(255,255,255,0.05)", 
              border: "1px solid rgba(255,255,255,0.1)" 
            }}
          >
            <Search className="w-4 h-4 text-white/50 flex-none" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search..."
              className="flex-1 min-w-0 bg-transparent border-none text-[15px] text-white placeholder:text-white/40 outline-none"
              autoFocus
            />
          </form>

          {/* Mobile nav links */}
          <nav className="flex flex-col gap-2">
            {navLinks.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                onClick={(e) => {
                  if (l.comingSoon) {
                    e.preventDefault();
                  } else {
                    closeMenu();
                  }
                }}
                className="px-5 py-4 text-[16px] font-semibold rounded-2xl transition-all"
                style={{
                  color: isActive(l.href) ? "#FFFFFF" : "#A0AEC0",
                  background: isActive(l.href) 
                    ? "linear-gradient(135deg, rgba(123,44,191,0.2) 0%, rgba(157,78,221,0.2) 100%)" 
                    : "transparent",
                  border: isActive(l.href) ? "1px solid rgba(157,78,221,0.2)" : "1px solid transparent",
                  cursor: l.comingSoon ? "not-allowed" : "pointer",
                  opacity: l.comingSoon ? 0.5 : 1,
                }}
              >
                {l.label}
                {l.comingSoon && (
                  <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-white/10">
                    Soon
                  </span>
                )}
              </Link>
            ))}
            
            {/* Mobile user links */}
            {ready && user ? (
              <Link
                href="/akun"
                onClick={closeMenu}
                className="px-5 py-4 text-[16px] font-semibold rounded-2xl transition-all"
                style={{
                  color: pathname === "/akun" ? "#FFFFFF" : "#A0AEC0",
                  background: pathname === "/akun" 
                    ? "linear-gradient(135deg, rgba(123,44,191,0.2) 0%, rgba(157,78,221,0.2) 100%)" 
                    : "transparent",
                  border: pathname === "/akun" ? "1px solid rgba(157,78,221,0.2)" : "1px solid transparent",
                }}
              >
                Account
              </Link>
            ) : (
              <Link
                href="/masuk"
                onClick={closeMenu}
                className="px-5 py-4 text-[16px] font-bold rounded-2xl transition-all mt-4"
                style={{
                  background: "linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)",
                  color: "#FFFFFF",
                  boxShadow: "0 4px 16px rgba(123,44,191,0.4)",
                  textAlign: "center",
                }}
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      )}

      {/* Content */}
      <div className="relative z-1 flex-1">{children}</div>
    </div>
  );
}
