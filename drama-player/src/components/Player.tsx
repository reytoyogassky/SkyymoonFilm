"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Subtitle {
  url: string;
  language: string;
}

interface PlayerProps {
  streamUrl: string | null;
  subtitles: Subtitle[];
  title: string;
  onNextEpisode?: () => void;
  onPrevEpisode?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

function isHlsUrl(url: string): boolean {
  return url.includes(".m3u8");
}

export default function Player({
  streamUrl,
  subtitles,
  title,
  onNextEpisode,
  onPrevEpisode,
  hasNext,
  hasPrev,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);
  const loadGenRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [activeSub, setActiveSub] = useState<string>("off");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const prevStreamRef = useRef<string | null>(null);

  // Auto-play when streamUrl changes (new episode)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    if (prevStreamRef.current === streamUrl) return;
    prevStreamRef.current = streamUrl;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const gen = ++loadGenRef.current;
    video.pause();
    video.removeAttribute("src");
    video.load();

    if (isHlsUrl(streamUrl)) {
      import("hls.js").then(({ default: Hls }) => {
        if (gen !== loadGenRef.current) return;
        if (!video) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30, startFragPrefetch: true });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (gen !== loadGenRef.current) return;
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            }
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = streamUrl;
          video.play().catch(() => {});
        } else {
          video.src = streamUrl;
          video.play().catch(() => {});
        }
      });
    } else {
      video.src = streamUrl;
      video.play().catch(() => {});
    }
  }, [streamUrl]);

  // Load subtitle tracks
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    while (video.firstChild) {
      const child = video.firstChild;
      if (child instanceof HTMLTrackElement) child.remove();
      else break;
    }

    if (!subtitles.length) return;

    subtitles.forEach((sub, i) => {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = sub.language || `Track ${i + 1}`;
      track.srclang = sub.language?.split("_")[0] || "id";
      track.src = sub.url;
      if (i === 0) {
        track.default = true;
        setActiveSub(sub.language || "off");
      }
      video.appendChild(track);
    });

    video.textTracks.onchange = () => {
      const active = Array.from(video.textTracks).find((t) => t.mode === "showing");
      if (active) setActiveSub(active.label);
    };
  }, [subtitles]);

  // Track active subtitle
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const check = setInterval(() => {
      const t = Array.from(video.textTracks).find((tt) => tt.mode === "showing");
      if (t) setActiveSub(t.label);
    }, 500);
    return () => clearInterval(check);
  }, []);

  const toggleSub = useCallback((lang: string) => {
    const video = videoRef.current;
    if (!video) return;
    Array.from(video.textTracks).forEach((t) => {
      t.mode = t.label === lang ? "showing" : "hidden";
    });
    setActiveSub(lang);
  }, []);

  // Video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = 0.5;

    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (video.duration) setProgress((video.currentTime / video.duration) * 100);
    };
    const onMeta = () => setDuration(video.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      if (autoNext && hasNext && onNextEpisode) onNextEpisode();
    };

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [hasNext, onNextEpisode, autoNext]);

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Cleanup hls.js on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (isPlaying) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [isPlaying, resetHideTimer]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) videoRef.current.volume = val;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current && duration) {
      videoRef.current.currentTime = (val / 100) * duration;
      setProgress(val);
    }
  };

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
      : `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const goFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current.requestFullscreen();
  };

  const skip = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + sec));
  };

  // No stream
  if (!streamUrl) {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center">
        <div className="text-center text-gray-500">
          <svg className="w-14 h-14 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113A.375.375 0 019.75 15.16V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">Video tidak tersedia</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`bg-black relative group select-none ${isFullscreen ? "w-screen h-screen flex items-center justify-center" : "w-full"}`}
      onMouseMove={resetHideTimer}
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === "VIDEO") togglePlay();
      }}
    >
      <div className={`relative ${isFullscreen ? "w-full h-full" : "aspect-video max-h-[70vh] mx-auto"}`}>
        <video
          ref={videoRef}
          src={streamUrl}
          className="w-full h-full object-contain"
          playsInline
          preload="metadata"
        />

        {/* Play overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer" onClick={togglePlay}>
            <div className="w-14 h-14 bg-pink-500 rounded-full flex items-center justify-center hover:bg-pink-600 transition-colors shadow-lg">
              <svg className="w-7 h-7 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Controls */}
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 pt-8 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress */}
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={handleSeek}
            className="w-full h-1 mb-2 cursor-pointer accent-pink-500"
          />

          <div className="flex items-center gap-2 text-white">
            {/* Play/Pause */}
            <button onClick={togglePlay} className="hover:text-pink-500 p-1">
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            {/* Prev episode */}
            {onPrevEpisode && (
              <button
                onClick={onPrevEpisode}
                disabled={!hasPrev}
                className={`hover:text-pink-500 p-1 ${!hasPrev ? "opacity-30 cursor-not-allowed" : ""}`}
                title="Episode sebelumnya"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
              </button>
            )}

            {/* Skip -10s */}
            <button onClick={() => skip(-10)} className="hover:text-pink-500 text-xs font-mono p-1">-10</button>

            {/* Skip +10s */}
            <button onClick={() => skip(10)} className="hover:text-pink-500 text-xs font-mono p-1">+10</button>

            {/* Next episode */}
            {onNextEpisode && (
              <button
                onClick={onNextEpisode}
                disabled={!hasNext}
                className={`hover:text-pink-500 p-1 ${!hasNext ? "opacity-30 cursor-not-allowed" : ""}`}
                title="Episode berikutnya"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
              </button>
            )}

            {/* Volume */}
            <button onClick={toggleMute} className="hover:text-pink-500 p-1">
              {isMuted || volume === 0 ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
              )}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolume}
              className="w-14 h-1 cursor-pointer accent-pink-500 hidden sm:block"
            />

            {/* Time */}
            <span className="text-[11px] text-gray-300 font-mono">
              {fmt(currentTime)} / {fmt(duration)}
            </span>

            <div className="flex-1" />

            {/* Title */}
            <span className="text-[11px] text-gray-400 truncate max-w-[180px] hidden md:block">
              {title}
            </span>

            {/* Subtitle toggle */}
            {subtitles.length > 0 && (
              <div className="relative group/sub">
                <button className="hover:text-pink-500 px-1.5 py-0.5 border border-white/20 rounded text-[10px]">CC</button>
                <div className="absolute bottom-full right-0 mb-2 bg-[#1a1a1a] rounded-lg shadow-xl border border-white/10 py-1 hidden group-hover/sub:block min-w-[120px]">
                  <button
                    onClick={() => toggleSub("off")}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 ${activeSub === "off" ? "text-pink-500" : "text-gray-300"}`}
                  >
                    Off
                  </button>
                  {subtitles.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => toggleSub(s.language)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 ${activeSub === s.language ? "text-pink-500" : "text-gray-300"}`}
                    >
                      {s.language || `Track ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Auto Next toggle */}
            <button
              onClick={() => setAutoNext(!autoNext)}
              className={`px-1.5 py-0.5 border rounded text-[10px] font-medium transition-colors ${autoNext ? "border-pink-500 text-pink-500 bg-pink-500/10" : "border-white/20 text-gray-500 hover:text-gray-300"}`}
              title={autoNext ? "Auto Next: ON" : "Auto Next: OFF"}
            >
              {autoNext ? "NEXT ON" : "NEXT OFF"}
            </button>

            {/* Fullscreen */}
            <button onClick={goFullscreen} className="hover:text-pink-500 p-1">
              {isFullscreen ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
