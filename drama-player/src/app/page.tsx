"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";

interface Drama {
  sourceId: string;
  sourceDramaId: string;
  title: string;
  poster: string;
  description: string;
  genres: string[];
  tags: string[];
  languageCode: string;
  score: number;
  isIndonesian: boolean;
  isDubbed: boolean;
  isIndonesianDubbed: boolean;
}

const LANGUAGES: Record<string, string> = {
  "id-ID": "Indonesia",
  "en-US": "English",
  "ko-KR": "Korea",
  "ja-JP": "Jepang",
  "zh-CN": "China",
  "vi-VN": "Vietnam",
  "pt-PT": "Portugis",
  "es-ES": "Spanyol",
  "fr-FR": "Prancis",
};

const GENRES = [
  "Romance", "Revenge", "Modern", "CEO", "Fantasy", "Werewolf",
  "Hidden Identity", "Billionaire", "Betrayal", "Second Chance",
  "Strong Heroine", "Secret Baby", "Redemption", "Mystery",
];

const PROVIDERS = [
  "bibishort","candyjar","cubetv","dotdrama","dramabite","dramabox",
  "dramashorts","dramawave","flareflow","flextv","flickreels","freereels",
  "fundrama","goodshort","happyshort","idrama","joyreels","kalostv",
  "melolo","microdrama","moboreels","mydrama","myrelle","netshort",
  "pinedrama","playlet","rapidtv","reelala","reelbuzz","reelife",
  "reelshort","sarostv","serealplus","shortical","shortmax","stardusttv",
  "starshort","velolo","vigloo","vyntage",
];

type SortKey = "" | "score" | "az";
type FilterTab = "all" | "dubbed" | "indo-dub" | "indo";

export default function Home() {
  const [allDramas, setAllDramas] = useState<Drama[]>([]);
  const [searchResults, setSearchResults] = useState<Drama[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selectedLang, setSelectedLang] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("");
  const [sort, setSort] = useState<SortKey>("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [providerDramas, setProviderDramas] = useState<Drama[]>([]);
  const [loadingProvider, setLoadingProvider] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showLang, setShowLang] = useState(false);
  const [showGenre, setShowGenre] = useState(false);
  const [showProvider, setShowProvider] = useState(false);

  useEffect(() => {
    fetch("/api/dramas")
      .then((r) => r.json())
      .then((d) => { setAllDramas(d.dramas || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProvider) { setProviderDramas([]); return; }
    setLoadingProvider(true);
    fetch(`/api/providers?provider=${encodeURIComponent(selectedProvider)}`)
      .then((r) => r.json())
      .then((d) => { setProviderDramas(d.dramas || []); setLoadingProvider(false); })
      .catch(() => setLoadingProvider(false));
  }, [selectedProvider]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/dramas?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.dramas || []);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  const onSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  const displayList = useMemo(() => {
    let list = selectedProvider
      ? [...providerDramas]
      : searchResults !== null
        ? [...searchResults]
        : [...allDramas];

    if (activeTab === "dubbed") {
      list = list.filter((d) => d.isDubbed && !d.isIndonesianDubbed);
    } else if (activeTab === "indo-dub") {
      list = list.filter((d) => d.isIndonesianDubbed);
    } else if (activeTab === "indo") {
      list = list.filter((d) => d.isIndonesian && !d.isDubbed);
    }

    if (selectedLang === "id-ID") {
      list = list.filter((d) => d.isIndonesian);
    } else if (selectedLang) {
      list = list.filter((d) => d.languageCode === selectedLang);
    }

    if (selectedGenre) {
      const g = selectedGenre.toLowerCase();
      list = list.filter((d) =>
        d.tags?.some((t) => t.toLowerCase().includes(g)) ||
        d.genres?.some((t) => t.toLowerCase().includes(g))
      );
    }

    if (sort === "score") {
      list.sort((a, b) => b.score - a.score);
    } else if (sort === "az") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }

    return list;
  }, [allDramas, searchResults, providerDramas, selectedProvider, activeTab, selectedLang, selectedGenre, sort]);

  const availableLangs = useMemo(() => {
    const source = searchResults !== null ? searchResults : allDramas;
    let indoCount = 0;
    const otherCounts: Record<string, number> = {};
    source.forEach((d) => {
      if (d.isIndonesian) indoCount++;
      if (d.languageCode && !d.isIndonesian) otherCounts[d.languageCode] = (otherCounts[d.languageCode] || 0) + 1;
    });
    const result: { code: string; count: number }[] = [];
    if (indoCount > 0) result.push({ code: "id-ID", count: indoCount });
    Object.entries(otherCounts)
      .sort((a, b) => b[1] - a[1])
      .filter(([code]) => code !== "id-ID")
      .forEach(([code, count]) => result.push({ code, count }));
    return result;
  }, [allDramas, searchResults]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <header className="sticky top-0 z-50 bg-[#0f0f0f]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="text-lg font-bold text-pink-500 shrink-0">Narto</Link>
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Cari drama..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50"
            />
          </div>
          <span className="text-xs text-gray-500 shrink-0">
            {loading ? "Memuat..." : searching ? "Mencari..." : loadingProvider ? "Memuat provider..." : `${displayList.length} drama${selectedProvider ? ` (${selectedProvider})` : ""}`}
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-3 space-y-2">
        <div className="flex gap-2 items-center overflow-x-auto pb-1">
          {([
            ["all", "Semua"],
            ["indo", "Indonesia"],
            ["indo-dub", "Sulih Suara ID"],
            ["dubbed", "Dubbing Asing"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === key
                  ? "bg-pink-500 text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}

          <div className="w-px h-5 bg-white/10 mx-1" />

          <button
            onClick={() => { setShowLang(!showLang); setShowGenre(false); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
              selectedLang ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            {selectedLang ? LANGUAGES[selectedLang] || selectedLang : "Bahasa"}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          <button
            onClick={() => { setShowGenre(!showGenre); setShowLang(false); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
              selectedGenre ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            {selectedGenre || "Genre"}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          <button
            onClick={() => setSort(sort === "score" ? "" : sort === "" ? "az" : sort === "az" ? "score" : "")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              sort ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            {sort === "score" ? "Populer" : sort === "az" ? "A-Z" : "Urutkan"}
          </button>

          <button
            onClick={() => { setShowProvider(!showProvider); setShowLang(false); setShowGenre(false); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
              selectedProvider ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            {selectedProvider || "Provider"}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {selectedLang && (
            <button onClick={() => setSelectedLang("")} className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">✕</button>
          )}
          {selectedGenre && (
            <button onClick={() => setSelectedGenre("")} className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">✕</button>
          )}
          {selectedProvider && (
            <button onClick={() => setSelectedProvider("")} className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">✕</button>
          )}
        </div>

        {showLang && (
          <div className="flex gap-2 items-center overflow-x-auto pb-1 flex-wrap">
            {availableLangs.map(({ code, count }) => (
              <button
                key={code}
                onClick={() => { setSelectedLang(selectedLang === code ? "" : code); setShowLang(false); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedLang === code
                    ? "bg-blue-500 text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {LANGUAGES[code] || code} ({count})
              </button>
            ))}
          </div>
        )}

        {showGenre && (
          <div className="flex gap-2 items-center overflow-x-auto pb-1 flex-wrap">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => { setSelectedGenre(selectedGenre === g ? "" : g); setShowGenre(false); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedGenre === g
                    ? "bg-purple-500 text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {showProvider && (
          <div className="flex gap-2 items-center overflow-x-auto pb-1 flex-wrap max-h-24 overflow-y-auto">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() => { setSelectedProvider(selectedProvider === p ? "" : p); setShowProvider(false); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedProvider === p
                    ? "bg-cyan-500 text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="max-w-7xl mx-auto px-4 pb-8">
        {loading || searching || loadingProvider ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="animate-spin w-10 h-10 border-2 border-pink-500 border-t-transparent rounded-full" />
            <span className="text-sm text-gray-400">{loading ? "Memuat drama..." : "Mencari..."}</span>
          </div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-sm">Tidak ada drama ditemukan</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {displayList.map((drama) => (
              <Link
                key={drama.sourceDramaId}
                href={`/drama/${drama.sourceDramaId}`}
                className="group relative aspect-[3/4] rounded-lg overflow-hidden bg-gray-800 hover:scale-105 transition-transform"
              >
                {drama.poster ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={drama.poster}
                    alt={drama.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-purple-500/20">
                    <span className="text-2xl font-bold text-pink-400/50">{drama.title?.charAt(0)}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                  {drama.isIndonesianDubbed && (
                    <span className="px-1 py-0.5 bg-green-500/90 text-white rounded text-[9px] font-bold">SULIH SUARA</span>
                  )}
                  {!drama.isIndonesianDubbed && drama.isDubbed && (
                    <span className="px-1 py-0.5 bg-purple-500/90 text-white rounded text-[9px] font-bold">DUB</span>
                  )}
                  {!drama.isDubbed && drama.isIndonesian && (
                    <span className="px-1 py-0.5 bg-orange-500/90 text-white rounded text-[9px] font-bold">ID</span>
                  )}
                  {!drama.isIndonesian && !drama.isDubbed && drama.languageCode && (
                    <span className="px-1 py-0.5 bg-blue-500/80 text-white rounded text-[9px] font-bold">
                      {LANGUAGES[drama.languageCode]?.substring(0, 3) || drama.languageCode.substring(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <h3 className="text-xs sm:text-sm font-semibold line-clamp-2 mb-1">{drama.title}</h3>
                  <div className="flex items-center gap-1 flex-wrap">
                    {drama.tags?.slice(0, 2).map((g, i) => (
                      <span key={i} className="px-1 py-0.5 bg-pink-500/20 text-pink-400 rounded text-[9px]">{g}</span>
                    ))}
                  </div>
                </div>
                <div className="absolute top-2 right-2 w-7 h-7 bg-pink-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                  <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
