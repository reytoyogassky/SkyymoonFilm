"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  LogOut,
  Pencil,
  X,
  Check,
  Monitor,
  Wifi,
  Languages,
  Subtitles,
  Trash2,
  AlertCircle,
  Loader2,
  Shuffle,
} from "lucide-react";
import { useAuth, useSettings, avatarUrl } from "@/lib/client-store";
import PageLoader from "@/components/PageLoader";

function deviceInfo() {
  const ua = navigator.userAgent;
  let browser = "Peramban";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "Perangkat";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Mac/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  const screen = `${window.screen.width}×${window.screen.height}`;
  return { browser, os, screen };
}

export default function AkunPage() {
  const router = useRouter();
  const { user, ready, signOut, updateProfile } = useAuth();
  const { settings, set } = useSettings();

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [deviceData, setDeviceData] = useState({ browser: "Peramban", os: "Perangkat", screen: "-" });

  useEffect(() => {
    if (ready && !user) {
      router.replace("/masuk");
    }
  }, [ready, user, router]);

  useEffect(() => {
    // Only access browser APIs after mount
    setDeviceData(deviceInfo());
  }, []);

  const toggles = [
    {
      key: "autoplay" as const,
      name: "Auto-play next episode",
      hint: "Start next episode after 12 seconds",
    },
    {
      key: "hemat" as const,
      name: "Data saver mode",
      hint: "Limit quality to 720p on mobile network",
    },
    {
      key: "notif" as const,
      name: "New release notifications",
      hint: "Notify when new matching releases arrive",
    },
  ];

  const doSignOut = () => {
    signOut();
    router.push("/");
    router.refresh();
  };

  const openEdit = () => {
    setNameInput(user?.name ?? "");
    setEmailInput(user?.email ?? "");
    setAvatarInput(user?.avatar ?? "");
    setEditError("");
    setEditing(true);
  };

  const randomizeAvatar = () => {
    setAvatarInput(
      avatarUrl(`${user?.username ?? "user"}-${Math.random().toString(36).slice(2, 8)}`)
    );
  };

  const saveProfile = () => {
    setSaving(true);
    setEditError("");
    const err = updateProfile({ name: nameInput, email: emailInput, avatar: avatarInput });
    setSaving(false);
    if (err) {
      setEditError(err);
      return;
    }
    setEditing(false);
  };

  const resetData = () => {
    const prefix = `skymoon:${"v2"}:`;
    ["watchlist", "history", "progress"].forEach((k) =>
      window.localStorage.removeItem(prefix + k)
    );
    if (user) window.localStorage.removeItem(prefix + `settings:${user.username}`);
    setConfirmReset(false);
    window.dispatchEvent(new Event("skymoon:store-change"));
    router.refresh();
  };

  if (!ready || !user) return <PageLoader />;

  return (
    <div className="relative px-6 sm:px-8 lg:px-12 pt-16 pb-24 flex flex-col gap-8">
      <h1 className="font-extrabold text-[44px] tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Account</h1>

      {/* Profile Card */}
      <div 
        className="flex flex-col sm:flex-row items-start sm:items-center gap-6 p-8 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
          border: "1px solid rgba(255,255,255,0.2)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div
          className="w-24 h-24 rounded-2xl overflow-hidden flex-none"
          style={{
            border: "2px solid rgba(157,78,221,0.4)",
            boxShadow: "0 8px 24px rgba(123,44,191,0.3)",
          }}
        >
          <Image
            src={user.avatar}
            alt={user.name}
            width={96}
            height={96}
            unoptimized
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="font-bold text-[26px]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{user.name}</div>
          <div className="text-[15px] text-white/60">@{user.username}</div>
          <div className="text-[15px] text-white/60">{user.email}</div>
          <div className="mt-1 inline-flex items-center gap-2 text-[13px] font-bold text-[#9D4EDD]">
            Member since{" "}
            {new Date(user.createdAt).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={openEdit}
          className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl text-[14px] font-semibold text-white transition-all duration-300 hover:scale-105 whitespace-nowrap cursor-pointer"
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          <Pencil className="w-4 h-4" />
          Edit Profile
        </button>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Playback Settings */}
        <div
          className="p-8 rounded-2xl flex flex-col gap-6"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.15)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="text-[12px] tracking-widest font-bold text-[#9D4EDD]">PLAYBACK</div>
          {toggles.map((setting) => (
            <div key={setting.key} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[15px] font-semibold">{setting.name}</span>
                <span className="text-[13px] text-white/50">{setting.hint}</span>
              </div>
              <button
                onClick={() => set({ [setting.key]: !settings[setting.key] })}
                className="w-14 h-8 rounded-full relative flex-none transition-all duration-300 cursor-pointer"
                style={{
                  background: settings[setting.key]
                    ? "linear-gradient(135deg, #7B2CBF, #9D4EDD)"
                    : "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
                aria-label={setting.name}
              >
                <div
                  className="absolute top-1 w-6 h-6 rounded-full bg-white transition-all duration-300 shadow-lg"
                  style={{
                    left: settings[setting.key] ? "26px" : "4px",
                  }}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Device Info */}
        <div
          className="p-8 rounded-2xl flex flex-col gap-5"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.15)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="text-[12px] tracking-widest font-bold text-[#9D4EDD]">DEVICE</div>
          <div className="flex flex-col gap-4 text-[15px]">
            <div className="flex justify-between">
              <span className="flex items-center gap-2.5 text-white/55 font-medium">
                <Monitor className="w-4 h-4" /> Active device
              </span>
              <span className="font-semibold">
                {deviceData.browser} · {deviceData.os}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2.5 text-white/55 font-medium">
                <Wifi className="w-4 h-4" /> Streaming quality
              </span>
              <span className="font-semibold">{settings.hemat ? "720p (data saver)" : "Auto"}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2.5 text-white/55 font-medium">
                <Languages className="w-4 h-4" /> App language
              </span>
              <span className="font-semibold">English</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2.5 text-white/55 font-medium">
                <Subtitles className="w-4 h-4" /> Default subtitle
              </span>
              <span className="font-semibold">Indonesian</span>
            </div>
          </div>
          <div className="h-px bg-white/10 my-1" />
          <div className="text-[13px] leading-relaxed text-white/50">
            Screen {deviceData.screen} · This account is only active on this device. You can sign in from up to 5 different devices simultaneously.
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div 
        className="p-8 rounded-2xl flex flex-col gap-5 border"
        style={{
          background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(220,38,38,0.05))",
          borderColor: "rgba(239,68,68,0.3)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="text-[12px] tracking-widest font-bold text-red-400">DATA & SECURITY</div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-semibold">Delete local watch data</span>
            <span className="text-[13px] text-white/50">
              Remove watchlist, history, and progress on this device (Supabase data remains safe)
            </span>
          </div>
          <button
            onClick={() => setConfirmReset((v) => !v)}
            className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl text-[14px] font-semibold text-white transition-all duration-300 hover:scale-105 whitespace-nowrap cursor-pointer"
            style={{
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
            }}
          >
            <Trash2 className="w-4 h-4" />
            Delete Data
          </button>
        </div>
        {confirmReset && (
          <div 
            className="flex flex-wrap items-center gap-4 rounded-xl px-5 py-4 text-[14px] text-white"
            style={{
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
            }}
          >
            <AlertCircle className="w-5 h-5 flex-none text-red-400" />
            <span className="font-medium">Are you sure you want to delete all watch data on this device?</span>
            <div className="flex gap-3 ml-auto">
              <button
                onClick={resetData}
                className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all duration-300 hover:scale-105 cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #DC2626, #EF4444)",
                  boxShadow: "0 4px 16px rgba(220,38,38,0.4)",
                }}
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white/80 transition-all duration-300 hover:bg-white/10 cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sign Out */}
      <button
        onClick={doSignOut}
        className="self-start flex items-center gap-2.5 px-8 py-4 rounded-xl text-[15px] font-bold text-white transition-all duration-300 hover:scale-105 whitespace-nowrap cursor-pointer"
        style={{
          background: "linear-gradient(135deg, rgba(123,44,191,0.2), rgba(157,78,221,0.15))",
          border: "1px solid rgba(157,78,221,0.4)",
          boxShadow: "0 4px 16px rgba(123,44,191,0.2)",
        }}
      >
        <LogOut className="w-5 h-5" />
        Sign Out
      </button>

      {/* Edit Profile Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-[400px] p-7 rounded-[24px] glass-panel border border-white/12 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="font-bold text-[18px]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Edit Profile</div>
                <button
                  onClick={() => setEditing(false)}
                  className="w-9 h-9 rounded-full grid place-items-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-[64px] h-[64px] rounded-[18px] overflow-hidden border border-white/18 flex-none">
                  <Image
                    src={avatarInput || user.avatar}
                    alt="Avatar"
                    width={64}
                    height={64}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-white/50">AVATAR</span>
                  <button
                    type="button"
                    onClick={randomizeAvatar}
                    className="self-start flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] font-semibold text-white glass-button hover:bg-white/16 transition-colors cursor-pointer"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Randomize Avatar
                  </button>
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-white/50">DISPLAY NAME</span>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-4 py-[13px] rounded-full bg-white/6 border border-white/10 focus:border-[#7B2CBF]/50 focus:outline-none transition-colors text-[14.5px]"
                  placeholder="Your name"
                />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold text-white/50">EMAIL</span>
              <input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                type="email"
                className="w-full px-4 py-[13px] rounded-full bg-white/6 border border-white/10 focus:border-[#7B2CBF]/50 focus:outline-none transition-colors text-[14.5px]"
                placeholder="email@example.com"
              />
            </label>

            {editError && (
              <div className="flex items-start gap-2 text-[13px] text-[#C4A8FF] bg-[#7B2CBF]/12 border border-[#9D4EDD]/25 px-4 py-3 rounded-[14px]">
                <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
                {editError}
              </div>
            )}

            <button
              onClick={saveProfile}
              disabled={saving}
              className="flex items-center justify-center gap-2 w-full px-5 py-[14px] rounded-full text-[14.5px] font-bold text-white accent-gradient accent-shadow transition-all disabled:opacity-60 cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}