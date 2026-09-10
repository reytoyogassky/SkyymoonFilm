"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Hls from "hls.js";
import type { Subtitle } from "@/lib/idlix";
import { useProgress } from "@/lib/client-store";

const RENEW_BEFORE_MS = 20 * 60 * 1000;
const SAVE_EVERY_MS = 5000;
const IDLE_TIMEOUT = 5000;

interface Stream {
  streamUrl: string;
  expiresAt: number;
  subtitles: Subtitle[];
  kind?: "hls" | "youtube" | "mp4";
  mp4Sources?: { label: string; url: string; size: number; codec: string }[];
}

interface LevelInfo {
  label: string;
  bitrate: number;
}



function levelLabel(l: { height?: number; width?: number; bitrate?: number }) {
  if (l.height) return l.height >= 2000 ? "4K" : l.height >= 1000 ? "1080p" : l.height >= 700 ? "720p" : l.height >= 400 ? "480p" : "360p";
  if (l.width && l.width >= 3840) return "4K";
  const kb = (l.bitrate || 0) / 1000;
  if (kb >= 4000) return "1080p";
  if (kb >= 2000) return "720p";
  if (kb >= 1000) return "480p";
  return "360p";
}

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  typeof navigator !== "undefined" ? navigator.userAgent : ""
);

export default function Player({
  slug,
  title,
  type,
  episodeId,
  episodeTitle,
  onNextEpisode,
  nextEpisodeName,
  onClose,
}: {
  slug: string;
  title: string;
  type?: "movie" | "tv";
  episodeId?: string;
  episodeTitle?: string;
  onNextEpisode?: () => void;
  nextEpisodeName?: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [countdown, setCountdown] = useState(15);
  const [loadingStep, setLoadingStep] = useState<string>("Mempersiapkan");
  const [loadingPct, setLoadingPct] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [soundHint, setSoundHint] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekVal, setSeekVal] = useState(0);
  const [levels, setLevels] = useState<LevelInfo[]>([]);
  const [quality, setQuality] = useState("Auto");
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [subMenuOpen, setSubMenuOpen] = useState(false);
  const [subFontSize, setSubFontSize] = useState(28);
  const [subActive, setSubActive] = useState("off");


  const [subs, setSubs] = useState<Subtitle[]>([]);
  const [localSubs, setLocalSubs] = useState<{ label: string; url: string }[]>([]);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [notice, setNotice] = useState("");
  const [hostWidth, setHostWidth] = useState(1280);
  const [ytSrc, setYtSrc] = useState("");
  const [resumePrompt, setResumePrompt] = useState<{ time: number; duration: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const streamRef = useRef<Stream | null>(null);
  const draggingRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subPickerRef = useRef(false);
  const subActiveRef = useRef("off");
  const lastSaveRef = useRef(0);
  const durationRef = useRef(0);
  const volumeRef = useRef(80);
  const mutedRef = useRef(false);
  
  const { save } = useProgress();
  const saveRef = useRef(save);
  const resumedRef = useRef(false);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const persistProgress = useCallback(
    (time: number) => {
      const now = Date.now();
      if (now - lastSaveRef.current < SAVE_EVERY_MS) return;
      lastSaveRef.current = now;
      saveRef.current(slug, { time, duration: durationRef.current, updatedAt: now });
    },
    [slug]
  );

  const applyVolume = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = (mutedRef.current ? 0 : volumeRef.current) / 100;
    video.muted = mutedRef.current;
  }, []);

  const setVolumeSafe = useCallback(
    (v: number) => {
      const nv = Math.max(0, Math.min(100, Number(v) || 0));
      volumeRef.current = nv;
      setVolume(nv);
      applyVolume();
    },
    [applyVolume]
  );

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    applyVolume();
  }, [applyVolume]);

  const fmt = (sec: number) => {
    if (!Number.isFinite(sec)) return "0:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const p = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  };

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setBuffering(false);
      const tryPlay = (n: number) => {
        const p = video.play();
        if (p && p.catch) p.catch(() => {
          if (n > 0) setTimeout(() => tryPlay(n - 1), 500);
        });
      };
      tryPlay(6);
    } else {
      video.pause();
    }
  }, []);

  const skip = useCallback((s: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (!isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration - 0.1, video.currentTime + s));
  }, []);

  const renderSub = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const active = subActiveRef.current;
    if (active && active !== "off") {
      for (const t of video.textTracks) {
        if (t.kind === "subtitles") {
          if (t.label === active) {
            if (t.mode === "disabled") t.mode = "showing";
          } else {
            if (t.mode === "showing") t.mode = "disabled";
          }
        }
      }
    }
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    const id = setInterval(renderSub, 200);
    return () => clearInterval(id);
  }, [phase, renderSub]);

  const selectSubtitle = useCallback(
    (val: string) => {
      const video = videoRef.current;
      if (!video) return;
      
      for (const t of Array.from(video.textTracks)) {
        if (t.kind !== "subtitles") continue;
        t.mode = "disabled";
      }
      
      if (val === "off") {
        setSubActive("off");
        subActiveRef.current = "off";
        return;
      }
      
      for (const t of Array.from(video.textTracks)) {
        if (t.kind === "subtitles" && t.label === val) {
          t.mode = "showing";
          setSubActive(val);
          subActiveRef.current = val;
          renderSub();
          return;
        }
      }
    },
    [renderSub]
  );

  const loadLocalSubtitle = useCallback(
    (file: File) => {
      const video = videoRef.current;
      if (!file || !video) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        let content = String(e.target?.result ?? "");
        content = content.replace(/STYLE[\s\S]*?(?=\n\n|$)/i, "").replace(/::cue[^{]*\{[^}]*\}\s*/g, "");
        if (content.indexOf("WEBVTT") === -1) {
          content = "WEBVTT\n\n" + content.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, "$1:$2:$3.$4");
        }
        const url = URL.createObjectURL(new Blob([content], { type: "text/vtt" }));
        const tr = document.createElement("track");
        tr.kind = "subtitles";
        tr.label = file.name;
        tr.srclang = "id";
        tr.src = url;
        video.appendChild(tr);
        tr.addEventListener("cuechange", renderSub);
        setLocalSubs((prev) => (prev.some((x) => x.label === file.name) ? prev : [...prev, { label: file.name, url }]));
        selectSubtitle(file.name);
      };
      reader.readAsText(file);
    },
    [renderSub, selectSubtitle]
  );

  const enableSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    mutedRef.current = false;
    setMuted(false);
    applyVolume();
    setSoundHint(false);
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  }, [applyVolume]);

  const handleResumeChoice = useCallback((accept: boolean) => {
    const video = videoRef.current;
    setResumePrompt(null);
    if (!video) return;
    if (accept && resumePrompt) {
      video.currentTime = resumePrompt.time;
    }
    video.play().catch(() => {});
  }, [resumePrompt]);

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Check saved progress — show popup
    if (!resumedRef.current) {
      resumedRef.current = true;
      try {
        const raw = localStorage.getItem("skymoon:v2:progress");
        if (raw) {
          const map = JSON.parse(raw) as Record<string, { time: number; duration: number }>;
          const saved = map[slug];
          if (saved && saved.time > 10 && saved.duration > 0 && saved.time < saved.duration - 30) {
            // Wait for video to actually start, then pause and show prompt
            const onPlaying = () => {
              video.removeEventListener("playing", onPlaying);
              video.pause();
              setResumePrompt({ time: saved.time, duration: saved.duration });
            };
            video.addEventListener("playing", onPlaying);
          }
        }
      } catch { /* ignore */ }
    }

    const p = video.play();
    if (p && p.catch) p.catch(() => {
      if (!video) return;
      if (mutedRef.current) return;
      video.muted = true;
      setSoundHint(true);
      const wake = () => {
        enableSound();
        document.removeEventListener("pointerdown", wake);
        document.removeEventListener("keydown", wake);
        document.removeEventListener("touchstart", wake);
      };
      document.addEventListener("pointerdown", wake);
      document.addEventListener("keydown", wake);
      document.addEventListener("touchstart", wake);
      const p2 = video.play();
      if (p2 && p2.catch) p2.catch(() => {});
    });
  }, [enableSound, slug]);

  const initHls = useCallback(
    (masterUrl: string, subList: Subtitle[]) => {
      const video = videoRef.current;
      if (!video) return;
      setSubs(subList);
      setPhase("ready");

      const showLoad = () => setBuffering(true);
      const hideLoad = () => setBuffering(false);
      video.addEventListener("playing", hideLoad);
      video.addEventListener("canplay", hideLoad);
      video.addEventListener("waiting", showLoad);
      video.addEventListener("seeking", showLoad);
      video.addEventListener("pause", hideLoad);

      video.addEventListener("play", () => setPlaying(true));
      video.addEventListener("pause", () => setPlaying(false));

      video.addEventListener("webkitbeginfullscreen", () => {
        video.controls = true;
      });
      video.addEventListener("webkitendfullscreen", () => {
        video.controls = false;
      });

      const guardTrackModes = () => {
        const active = subActiveRef.current;
        if (!active || active === "off") return;
        
        for (const t of video.textTracks) {
          if (t.kind !== "subtitles") continue;
          
          if (t.label === active) {
            if (t.mode !== "showing") t.mode = "showing";
          } else {
            if (t.mode !== "disabled") t.mode = "disabled";
          }
        }
      };
      video.textTracks.addEventListener("change", guardTrackModes);
      video.textTracks.addEventListener("addtrack", guardTrackModes);

      applyVolume();

      const showErr = (msg: string) => {
        setErrorMsg(msg);
        setPhase("error");
      };

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          maxBufferLength: 45,
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1000 * 1000,
          backBufferLength: 12,
          capLevelToPlayerSize: true,
          highBufferWatchdogPeriod: 2,
          abrEwmaDefaultEstimate: 1200000,
          abrBandWidthFactor: 0.7,
          abrBandWidthUpFactor: 0.7,
          fragLoadingMaxRetry: 6,
          manifestLoadingMaxRetry: 4,
          fragLoadingRetryDelay: 800,
          fragLoadingTimeOut: 30000,
          fragLoadingMaxRetryTimeout: 60000,
          manifestLoadingTimeOut: 20000,
          levelLoadingTimeOut: 20000,
          nudgeOffset: 0.2,
          nudgeMaxRetry: 5,
        });
        hlsRef.current = hls;
        hls.loadSource(masterUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          hls.startLevel = 0;
          setLevels(
            hls.levels.map((l) => ({
              label: levelLabel(l),
              bitrate: l.bitrate || 0,
            }))
          );
          setQuality("Auto");
          startPlayback();
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data && data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              const anyHls = hls as Hls & { _netRetry?: number };
              if (!anyHls._netRetry) {
                anyHls._netRetry = 1;
                setTimeout(() => hls.startLoad(), 1500);
              } else {
                hls.startLoad();
              }
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              hls.destroy();
              hlsRef.current = null;
              showErr("Tidak bisa memutar video (codec/manifest error).");
            }
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = masterUrl;
        video.addEventListener("loadedmetadata", () => startPlayback(), { once: true });
      } else {
        showErr("Browser tidak mendukung playback HLS.");
        return;
      }

      if (subList && subList.length) {
        for (const s of subList) {
          const tr = document.createElement("track");
          tr.kind = "subtitles";
          tr.label = s.label;
          tr.srclang = s.lang;
          tr.src = `/api/subtitle?url=${encodeURIComponent(s.url)}`;
          video.appendChild(tr);
          tr.addEventListener("cuechange", renderSub);
          tr.addEventListener("load", () => {
            if (tr.label === subActiveRef.current) {
              for (const t of video.textTracks) {
                if (t.kind === "subtitles") {
                  t.mode = t.label === tr.label ? "showing" : "disabled";
                }
              }
              renderSub();
            }
          });
        }
        const idSub = subList.find((s) => s.lang === "id" || s.lang === "in" || /indonesi/i.test(s.label));
        selectSubtitle((idSub || subList[0]).label);
      }

      video.addEventListener("timeupdate", () => {
        if (!draggingRef.current) setSeekVal(video.duration ? Math.round((video.currentTime / video.duration) * 1000) : 0);
        setCurrentTime(video.currentTime);
        if (isFinite(video.duration)) durationRef.current = video.duration;
        setDuration(video.duration || 0);
        persistProgress(video.currentTime);
      });
      video.addEventListener("click", togglePlay);
    },
    [applyVolume, persistProgress, renderSub, selectSubtitle, startPlayback, togglePlay]
  );

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    document.body.style.overflow = "hidden";
    setPhase("loading");
    setErrorMsg("");

    (async () => {
      const streamType = type === "tv" ? "&type=tv" : "";
      const queryStr = new URLSearchParams();
      if (type === "tv") queryStr.set("type", "tv");
      if (episodeId) queryStr.set("episodeId", episodeId);
      const qs = queryStr.toString();
      const streamUrl = episodeId
        ? `/api/stream/${slug}?${qs}`
        : `/api/stream/${slug}${qs ? "?" + qs : ""}`;

      // Step 1: trigger prefetch (instant return, starts Python in background)
      // Skip if already in-flight to avoid duplicate spawns
      try {
        const prefetchUrl = `/api/prefetch/${slug}${qs ? "?" + qs : ""}`;
        await fetch(prefetchUrl).catch(() => {});
      } catch {}

      const startTime = Date.now();
      const MAX_WAIT_MS = 90_000;
      const POLL_MS = 1_500;

      // Step 2: poll until ready
      while (!cancelled) {
        const elapsed = Date.now() - startTime;
        if (elapsed > MAX_WAIT_MS) {
          if (!cancelled) {
            setErrorMsg("Stream timeout. Coba lagi atau periksa koneksi.");
            setPhase("error");
          }
          return;
        }

        try {
          const r = await fetch(streamUrl);
          if (r.status === 502 || r.status === 504) {
            await new Promise((r) => setTimeout(r, POLL_MS));
            continue;
          }
          if (!r.ok) {
            const errData = await r.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${r.status}`);
          }
          const d = await r.json();
          if (cancelled) return;

          if (!d?.streamUrl) {
            await new Promise((r) => setTimeout(r, POLL_MS));
            continue;
          }

          streamRef.current = d;
          if (d.kind === "youtube") {
            setYtSrc(d.streamUrl.replace("watch?v=", "embed/"));
            setPhase("ready");
            return;
          }
          if (d.kind === "mp4") {
            const v = videoRef.current;
            if (v) {
              v.src = d.streamUrl;
              setPhase("ready");
              setBuffering(false);
            }
            return;
          }
          initHls(d.streamUrl, d.subtitles);
          return;
        } catch (e) {
          if (cancelled) return;
          setErrorMsg((e as Error).message);
          setPhase("error");
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
      document.body.style.overflow = "";
      const hls = hlsRef.current;
      if (hls) {
        try { hls.destroy(); } catch {}
        hlsRef.current = null;
      }
      if (video) {
        if (!video.paused) persistProgress(video.currentTime);
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [slug, episodeId, type, initHls, persistProgress]);

  const toggleSubMenu = useCallback(() => {
    setSubMenuOpen((o) => !o);
  }, []);

  const commitSeek = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    draggingRef.current = false;
    if (!isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.min(video.duration - 0.1, (seekVal / 1000) * video.duration);
  }, [seekVal]);

  const enterFullscreenPlayer = useCallback(() => {
    const video = videoRef.current;
    const c = containerRef.current;
    if (!video) return;
    if (isMobile && video) {
      const v = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
      if (typeof v.webkitEnterFullscreen === "function") {
        try {
          v.webkitEnterFullscreen();
          return;
        } catch {
          // fall through
        }
      }
      const rfVideo = v.requestFullscreen || (v as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen;
      if (rfVideo) {
        const pr = rfVideo.call(video) as Promise<void> | undefined;
        if (pr && pr.catch) pr.catch(() => {});
        return;
      }
    }
    const el = c || video;
    const rf =
      el.requestFullscreen ||
      (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen ||
      (el as unknown as { mozRequestFullScreen?: () => void }).mozRequestFullScreen ||
      (el as unknown as { msRequestFullscreen?: () => void }).msRequestFullscreen;
    if (!rf) return;
    const pr = rf.call(el) as Promise<void> | undefined;
    if (pr && pr.catch) pr.catch(() => {});
  }, []);

  const toggleStreamFullscreen = useCallback(() => {
    const d = document as Document & {
      webkitFullscreenElement?: Element | null;
      mozFullScreenElement?: Element | null;
      msFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
      mozCancelFullScreen?: () => void;
      msExitFullscreen?: () => void;
    };
    if (document.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement) {
      const ef = document.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen;
      if (ef) ef.call(document);
    } else {
      enterFullscreenPlayer();
    }
  }, [enterFullscreenPlayer]);

  const onQuality = useCallback(
    (v: string) => {
      const hls = hlsRef.current;
      if (!hls) return;
      setQuality(v);
      if (v === "Auto") {
        hls.currentLevel = -1;
        hls.nextLevel = -1;
        return;
      }
      const idx = parseInt(v, 10);
      if (idx >= 0 && idx < hls.levels.length) {
        hls.currentLevel = idx;
        hls.nextLevel = idx;
        const video = videoRef.current;
        if (video && video.paused) video.play().catch(() => {});
      }
    },
    []
  );

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const show = () => {
      setControlsHidden(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        const video = videoRef.current;
        if (video && !video.paused && !subMenuOpen && !soundHint && phase === "ready") {
          setControlsHidden(true);
        }
      }, IDLE_TIMEOUT);
    };
    const hide = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      const video = videoRef.current;
      if (video && !video.paused && phase === "ready") {
        setControlsHidden(true);
      }
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "touchmove", "click"];
    for (const ev of events) c.addEventListener(ev, show);
    c.addEventListener("mouseleave", hide);
    const video = videoRef.current;
    const onPlay = () => show();
    const onPause = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      setControlsHidden(false);
    };
    if (video) {
      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
    }
    return () => {
      for (const ev of events) c.removeEventListener(ev, show);
      c.removeEventListener("mouseleave", hide);
      if (video) {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [phase, subMenuOpen, soundHint]);

  useEffect(() => {
    const onFsChange = () => {
      const d = document as Document & { webkitFullscreenElement?: Element | null };
      const inFs = !!(document.fullscreenElement || d.webkitFullscreenElement);
      if (inFs) {
        setControlsHidden(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          const video = videoRef.current;
          if (video && !video.paused && !subMenuOpen) setControlsHidden(true);
        }, IDLE_TIMEOUT);
      } else {
        if (subPickerRef.current) return;
        setControlsHidden(false);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, [subMenuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) {
        if (e.key !== "Escape") return;
      }
      const d = document as Document & {
        webkitFullscreenElement?: Element | null;
        mozFullScreenElement?: Element | null;
        msFullscreenElement?: Element | null;
        webkitExitFullscreen?: () => void;
        mozCancelFullScreen?: () => void;
        msExitFullscreen?: () => void;
      };
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        skip(-5);
      } else if (e.key === "ArrowRight") {
        skip(5);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        mutedRef.current = false;
        setMuted(false);
        setVolumeSafe(volumeRef.current + 5);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setVolumeSafe(volumeRef.current - 5);
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      } else if (e.key === "s" || e.key === "S") {
        toggleSubMenu();
      } else if (e.key === "f" || e.key === "F") {
        toggleStreamFullscreen();
      } else if (e.key === "Escape") {
        if (subPickerRef.current) return;
        if (document.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement) {
          const ef = document.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen;
          if (ef) ef.call(document);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, setVolumeSafe, skip, toggleMute, togglePlay, toggleStreamFullscreen, toggleSubMenu]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (subMenuOpen) {
        if (!(e.target as HTMLElement | null)?.closest("#subMenu")) {
          setSubMenuOpen(false);
        }
      }
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [subMenuOpen]);

  useEffect(() => {
    const onResize = () => {
      const host = containerRef.current;
      if (host) setHostWidth(host.clientWidth);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream || phase !== "ready") return;
    const delay = Math.max(0, stream.expiresAt - Date.now() - RENEW_BEFORE_MS);
    const t = setTimeout(async () => {
      setNotice("Memperbarui sesi stream...");
      try {
        const res = await fetch(`/api/stream/${slug}?renew=1${type === "tv" ? "&type=tv" : ""}`);
        if (!res.ok) throw new Error("gagal perbarui");
        const next = (await res.json()) as Stream;
        streamRef.current = next;
        const hls = hlsRef.current;
        const video = videoRef.current;
        if (hls && video) {
          const pos = video.currentTime;
          hls.stopLoad();
          hls.loadSource(next.streamUrl);
          hls.startLoad();
          hls.once(Hls.Events.MANIFEST_PARSED, () => {
            if (Number.isFinite(pos) && pos > 0 && Math.abs(video.currentTime - pos) < 30) {
              video.currentTime = pos;
            }
          });
        } else if (video) {
          video.src = next.streamUrl;
        }
        setNotice("");
      } catch {
        setNotice("Gagal memperbarui sesi; coba lagi otomatis.");
        setTimeout(() => setNotice(""), 5000);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [slug, type, phase, persistProgress]);

  const seekPct = (seekVal / 1000) * 100;
  const volPct = muted ? 0 : volume;
  const fontPct = ((subFontSize - 14) / (48 - 14)) * 100;
  const subSizePx = Math.round(Math.max(14, Math.min(64, subFontSize * (hostWidth / 1280))));
  const overlaysHidden = controlsHidden ? "opacity-0 pointer-events-none" : "opacity-100";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] bg-black select-none"
      style={{ cursor: controlsHidden ? "none" : "auto" }}
    >
      {/* Video host */}
      <div className="absolute inset-0 flex items-center justify-center">
        <video 
          ref={videoRef} 
          className="w-full h-full object-contain" 
          playsInline 
        />
        <style>{`
          video::cue {
            color: #fff;
            background: transparent;
            font-size: ${subSizePx}px;
            font-weight: 700;
            text-shadow: 2px 2px 3px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9), 1px 1px 2px rgba(0,0,0,0.8);
          }
        `}</style>
        {ytSrc && (
          <iframe
            src={ytSrc}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>

      {/* Loading */}
      {phase === "loading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[28px] bg-[#080405]">
          <div style={{ animation: "loaderPulse 1.8s ease-in-out infinite" }}>
            <Image src="/assets/sky-mark.png" alt="SKYMOON" width={140} height={140} priority />
          </div>
          <p className="text-white/45 text-[12px]">
            Sedang membuka akses server, mohon tunggu sebentar
          </p>
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
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "rgba(225,29,46,0.2)" }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#ff5566]">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <p className="text-[#ff5566] text-sm font-semibold mb-1">Error Playback</p>
            <p className="text-white/50 text-xs">{errorMsg}</p>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 accent-gradient rounded-lg text-sm font-bold transition-all hover:brightness-110"
          >
            Kembali
          </button>
        </div>
      )}

      {/* Buffering (non-blocking) */}
      {phase === "ready" && buffering && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-black/60 backdrop-blur-sm pointer-events-none">
          <div style={{ animation: "loaderPulse 1.4s ease-in-out infinite" }}>
            <Image src="/assets/sky-mark.png" alt="SKYMOON" width={64} height={64} />
          </div>
          <div
            className="w-[160px] h-[5px] rounded-full overflow-hidden"
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
      )}



      {/* Sound hint */}
      {soundHint && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <button
            onClick={enableSound}
            className="flex items-center gap-2 px-6 py-3.5 accent-gradient rounded-xl text-sm font-bold transition-all shadow-lg hover:scale-105 pointer-events-auto"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 10v4h4l5 5V5L7 10H3z" />
              <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>Klik untuk mengaktifkan suara</span>
          </button>
        </div>
      )}

      {/* Resume prompt */}
      {resumePrompt && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div
            className="flex flex-col items-center gap-5 p-8 rounded-2xl max-w-[380px] w-[90vw]"
            style={{
              background: "rgba(20,8,12,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
            }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(225,29,46,0.2)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff5566" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white text-[15px] font-semibold mb-1">Lanjutkan menonton?</p>
              <p className="text-white/50 text-[13px]">
                Terakhir kamu menonton di <span className="text-white/80 font-medium">{fmt(resumePrompt.time)}</span>
              </p>
            </div>
            <div className="w-full h-[4px] rounded-full overflow-hidden bg-white/10">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((resumePrompt.time / resumePrompt.duration) * 100)}%`,
                  background: "linear-gradient(90deg, #e11d2e, #ff5566)",
                }}
              />
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => handleResumeChoice(false)}
                className="flex-1 py-3 rounded-xl text-[13px] font-semibold text-white/70 transition-all hover:bg-white/10"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Mulai Ulang
              </button>
              <button
                onClick={() => handleResumeChoice(true)}
                className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white accent-gradient transition-all hover:brightness-110"
              >
                Lanjutkan · {fmt(resumePrompt.time)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back button */}
      <div className={`absolute top-0 left-0 p-4 sm:p-6 z-20 transition-opacity duration-300 ${overlaysHidden}`}>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full glass-button hover:brightness-125 transition-all group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5m0 0l6 6m-6-6l6-6" />
            </svg>
          </span>
          <span className="text-sm font-semibold hidden sm:inline">Kembali</span>
        </button>
      </div>

      {/* Title top-right */}
      <div className={`absolute top-0 right-0 p-4 sm:p-6 z-20 pointer-events-none transition-opacity duration-300 ${overlaysHidden}`}>
        <div className="text-right max-w-md">
          <h3 className="sora text-xs sm:text-base md:text-lg font-bold truncate" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}>
            {title}
          </h3>
          {episodeTitle && (
            <p className="text-[10px] sm:text-xs text-white/70 truncate mt-0.5" style={{ textShadow: "0 2px 6px rgba(0,0,0,0.9)" }}>
              {episodeTitle}
            </p>
          )}
        </div>
      </div>

      {/* Notice toast */}
      {notice && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 text-xs text-amber-400 bg-black/70 px-4 py-2 rounded-full whitespace-nowrap">
          {notice}
        </div>
      )}

      {/* Controls bar */}
      {!ytSrc && (
      <div
        className={`absolute left-0 right-0 bottom-0 px-4 sm:px-6 pb-4 pt-24 z-10 transition-opacity duration-300 ${overlaysHidden}`}
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.55) 55%, transparent)" }}
      >
        <input
          type="range"
          min={0}
          max={1000}
          value={seekVal}
          className="player-range w-full transition-all"
          onInput={(e) => {
            draggingRef.current = true;
            setSeekVal(Number((e.target as HTMLInputElement).value));
          }}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          style={{
            background: `linear-gradient(to right, var(--accent, #e11d2e) ${seekPct}%, rgba(255,255,255,0.18) ${seekPct}%)`,
          }}
        />
        <div className="relative mt-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={togglePlay}
              className="p-2 rounded-lg text-white hover:text-[#ff5566] hover:bg-white/10 transition-all"
              title="Play/Pause (Space)"
            >
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => skip(-5)}
              className="p-2 rounded-lg text-white hover:text-[#ff5566] hover:bg-white/10 transition-all"
              title="Mundur 5s (←)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" />
              </svg>
            </button>
            <button
              onClick={() => skip(5)}
              className="p-2 rounded-lg text-white hover:text-[#ff5566] hover:bg-white/10 transition-all"
              title="Maju 5s (→)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z" />
              </svg>
            </button>
            {onNextEpisode && (
              <button
                onClick={onNextEpisode}
                className="flex items-center gap-[6px] px-[12px] py-[6px] rounded-lg text-white hover:text-[#ff5566] hover:bg-white/10 transition-all text-[12px] font-semibold whitespace-nowrap"
                title="Episode Berikutnya"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" />
                </svg>
                <span className="hidden sm:inline">
                  {nextEpisodeName ? nextEpisodeName : "Episode Berikutnya"}
                </span>
              </button>
            )}
            <span className="hidden sm:inline text-xs sm:text-sm text-white/75 tabular-nums font-medium px-1">
              {fmt(currentTime)} / {fmt(duration)}
            </span>
            <div className="flex-1" />

            {/* Quality */}
            <select
              value={quality}
              onChange={(e) => onQuality(e.target.value)}
              className="hidden sm:block bg-[#1c0a10]/90 backdrop-blur-sm text-xs px-2.5 py-1.5 rounded-lg cursor-pointer"
              style={{ border: "1px solid rgba(255,255,255,0.16)" }}
            >
              <option value="Auto">Auto</option>
              {levels.map((l, i) => (
                <option key={i} value={String(i)}>
                  {l.label}
                  {l.bitrate ? ` · ${Math.round(l.bitrate / 1000)} kbps` : ""}
                </option>
              ))}
            </select>

            {/* Volume */}
            <div className="relative flex items-center gap-1">
              <button
                onClick={toggleMute}
                className="p-2 rounded-lg text-white hover:text-[#ff5566] hover:bg-white/10 transition-all"
                title="Mute/Unmute (M)"
              >
                {muted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 10v4h4l5 5V5L7 10H3z" />
                    <path d="M16 9l6 6m0-6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 10v4h4l5 5V5L7 10H3z" />
                    <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                className="player-range hidden lg:block w-20 cursor-pointer"
                title="Volume"
                onInput={(e) => setVolumeSafe(Number((e.target as HTMLInputElement).value))}
                style={{
                  background: `linear-gradient(to right, var(--accent, #e11d2e) ${volPct}%, rgba(255,255,255,0.18) ${volPct}%)`,
                }}
              />
              <span className="hidden lg:block text-[10px] text-white/45 tabular-nums w-8 text-right shrink-0">
                {muted ? 0 : volume}%
              </span>
            </div>

            {/* Subtitle menu */}
            <div className="relative" id="subMenu">
              <button
                onClick={toggleSubMenu}
                className="p-2 rounded-lg hover:bg-white/10 transition-all"
                style={{ color: subActive !== "off" ? "var(--accent, #e11d2e)" : "#fff" }}
                title="Subtitle (S)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M7 15h4m2 0h4" />
                </svg>
              </button>
              {subMenuOpen && (
                <div
                  className="absolute bottom-full right-0 mb-2 rounded-xl p-4 min-w-[260px] max-w-[80vw] z-30 shadow-2xl"
                  style={{
                    background: "rgba(20,8,12,0.96)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                  }}
                >
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-white/75 mb-1.5">Pilih Subtitle</label>
                    <select
                      value={subActive}
                      onChange={(e) => selectSubtitle(e.target.value)}
                      className="w-full bg-[#1c0a10] text-sm px-3 py-2 rounded-lg cursor-pointer"
                      style={{ border: "1px solid rgba(255,255,255,0.16)" }}
                    >
                      <option value="off">Nonaktifkan</option>
                      {subs.map((s) => (
                        <option key={s.lang} value={s.label}>
                          {s.label}
                        </option>
                      ))}
                      {localSubs.map((s) => (
                        <option key={s.label} value={s.label}>
                          {s.label} (lokal)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-white/75 mb-1.5">
                      Atau impor file lokal (.vtt, .srt)
                    </label>
                    <input
                      type="file"
                      accept=".vtt,.srt"
                      onPointerDown={() => {
                        subPickerRef.current = true;
                      }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        subPickerRef.current = false;
                        if (f) loadLocalSubtitle(f);
                        e.target.value = "";
                      }}
                      className="w-full text-xs bg-[#1c0a10] rounded-lg p-2 cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-[#e11d2e] file:text-white file:font-semibold file:cursor-pointer hover:file:bg-[#b01726] transition-colors"
                      style={{ border: "1px solid rgba(255,255,255,0.16)" }}
                    />
                  </div>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", margin: "12px 0" }} />
                  <div className="text-xs font-semibold text-white/75 mb-1.5">Ukuran Font</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={14}
                      max={48}
                      value={subFontSize}
                      onInput={(e) => setSubFontSize(Number((e.target as HTMLInputElement).value))}
                      className="player-range flex-1 cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, var(--accent, #e11d2e) ${fontPct}%, rgba(255,255,255,0.18) ${fontPct}%)`,
                      }}
                    />
                    <span className="text-xs text-white/45 tabular-nums w-10 text-right shrink-0">{subFontSize}px</span>
                  </div>
                  <div className="text-right mt-3">
                    <button
                      onClick={() => setSubFontSize(28)}
                      className="text-xs text-white/45 hover:text-[#ff5566] font-semibold transition-colors"
                    >
                      Reset ke Default
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={toggleStreamFullscreen}
              className="p-2 rounded-lg text-white hover:text-[#ff5566] hover:bg-white/10 transition-all"
              title="Fullscreen (F)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M16 3h3a2 2 0 0 1 2 2v3" />
                <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}