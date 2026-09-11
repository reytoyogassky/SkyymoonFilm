"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Player from "@/components/Player";

interface Episode {
  episodeNumber: number;
  title: string;
  isVip: boolean;
  sourceEpisodeId: string;
  streamUrl: string | null;
  qualities: { url: string; resolution: string; codec: string; format: string }[];
  subtitles: { url: string; language: string }[];
}

interface DramaDetail {
  sourceId: string;
  sourceDramaId: string;
  title: string;
  poster: string;
  description: string;
  genres: string[];
  episodes: Episode[];
  totalEpisodes: number;
  freeCount: number;
}

export default function DramaPage() {
  const params = useParams();
  const id = params.id as string;

  const [drama, setDrama] = useState<DramaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEp, setSelectedEp] = useState(1);
  const [currentStream, setCurrentStream] = useState<string | null>(null);
  const [currentSubs, setCurrentSubs] = useState<{ url: string; language: string }[]>([]);
  const [loadingStream, setLoadingStream] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/drama/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setDrama(d);
        setLoading(false);
        if (d.episodes?.length) {
          loadEpisode(1, d);
        }
      })
      .catch(() => setLoading(false));
  }, [id]);

  const loadEpisode = async (epNo: number, dramaData?: DramaDetail) => {
    const d = dramaData || drama;
    if (!d) return;
    setSelectedEp(epNo);
    setLoadingStream(true);

    const ep = d.episodes.find((e) => e.episodeNumber === epNo);
    if (!ep) {
      setLoadingStream(false);
      return;
    }

    if (ep.streamUrl) {
      setCurrentStream(`/api/stream?url=${encodeURIComponent(ep.streamUrl)}`);
      setCurrentSubs(ep.subtitles || []);
    } else {
      setCurrentStream(null);
      setCurrentSubs([]);
    }
    setLoadingStream(false);
  };

  const goNext = () => {
    if (drama && selectedEp < drama.totalEpisodes) loadEpisode(selectedEp + 1);
  };

  const goPrev = () => {
    if (selectedEp > 1) loadEpisode(selectedEp - 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full" />
        <span className="ml-3 text-gray-400">Memuat...</span>
      </div>
    );
  }

  if (!drama) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-3">Tidak Ditemukan</h1>
          <a href="/" className="text-pink-500 hover:underline text-sm">Kembali</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Player
        streamUrl={currentStream}
        subtitles={currentSubs}
        title={`${drama.title} - EP ${selectedEp}`}
        onNextEpisode={goNext}
        onPrevEpisode={goPrev}
        hasNext={selectedEp < drama.totalEpisodes}
        hasPrev={selectedEp > 1}
      />

      <div className="max-w-4xl mx-auto px-4 py-5">
        <a href="/" className="text-xs text-gray-500 hover:text-pink-500 mb-3 inline-block">&larr; Semua Drama</a>

        <div className="flex gap-4 mb-5">
          {drama.poster ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={drama.poster}
              alt={drama.title}
              className="w-20 h-28 object-cover rounded-lg shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-20 h-28 rounded-lg shrink-0 bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
              <span className="text-xl font-bold text-pink-400/50">{drama.title?.charAt(0)}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold mb-1.5 line-clamp-2">{drama.title}</h1>
            <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-400 mb-2">
              <span>{drama.totalEpisodes} Episode</span>
              <span className="text-green-400">Semua Gratis</span>
              {drama.genres.map((g, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-pink-500/15 text-pink-400 rounded">{g}</span>
              ))}
            </div>
            <p className="text-xs text-gray-400 line-clamp-2 sm:line-clamp-3">{drama.description}</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Episode {selectedEp} / {drama.totalEpisodes}</h2>
            {loadingStream && (
              <span className="text-xs text-pink-400 animate-pulse">Memuat video...</span>
            )}
          </div>
          <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1.5">
            {drama.episodes.map((ep) => (
              <button
                key={ep.episodeNumber}
                onClick={() => loadEpisode(ep.episodeNumber)}
                className={`aspect-square rounded-lg text-xs font-medium transition-all ${
                  selectedEp === ep.episodeNumber
                    ? "bg-pink-500 text-white shadow-lg shadow-pink-500/30"
                    : "bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5"
                }`}
              >
                {ep.episodeNumber}
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-pink-500" /> Gratis
            </span>
          </div>
        </div>

        {currentSubs.length > 0 && (
          <div className="mt-4 p-3 bg-white/5 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Subtitle tersedia:</p>
            <div className="flex gap-2 flex-wrap">
              {currentSubs.map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-green-500/15 text-green-400 rounded text-[10px]">
                  {s.language || "Unknown"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
