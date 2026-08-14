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

  useEffect(() => {
    if (ready && !user) {
      router.replace("/masuk");
    }
  }, [ready, user, router]);

  const toggles = [
    {
      key: "autoplay" as const,
      name: "Putar otomatis episode berikutnya",
      hint: "Mulai episode selanjutnya setelah 12 detik",
    },
    {
      key: "hemat" as const,
      name: "Mode hemat data",
      hint: "Batasi kualitas ke 720p di jaringan seluler",
    },
    {
      key: "notif" as const,
      name: "Notifikasi judul baru",
      hint: "Beri tahu saat ada rilisan baru yang cocok",
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

  const dev = deviceInfo();

  return (
    <div className="relative px-4 sm:px-6 lg:px-10 pt-[52px] pb-[90px] flex flex-col gap-[22px]">
      <h1 className="sora font-extrabold text-[40px] tracking-tight">Akun</h1>

      {/* Profile Card */}
      <div className="flex items-center gap-[22px] p-[26px] rounded-[24px] glass-panel shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)]">
        <div
          className="relative w-[84px] h-[84px] rounded-[22px] overflow-hidden border border-white/18"
          style={{
            background: "linear-gradient(150deg, rgba(225,29,46,0.4), rgba(255,255,255,0.06))",
          }}
        >
          <Image
            src={user.avatar}
            alt={user.name}
            width={84}
            height={84}
            unoptimized
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="sora font-bold text-[22px]">{user.name}</div>
          <div className="text-sm text-white/50">@{user.username}</div>
          <div className="text-sm text-white/50">{user.email}</div>
          <div className="mt-1 inline-flex items-center gap-2 text-xs font-bold text-[#ff5566]">
            Anggota sejak{" "}
            {new Date(user.createdAt).toLocaleDateString("id-ID", {
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={openEdit}
          className="flex items-center gap-2 px-5 py-3 rounded-full text-[13.5px] font-semibold text-white glass-button hover:bg-white/16 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" />
          Ganti profil
        </button>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
        {/* Playback Settings */}
        <div className="p-[26px] rounded-[22px] glass-panel flex flex-col gap-[18px]">
          <div className="text-[11px] tracking-widest font-bold text-white/45">PEMUTARAN</div>
          {toggles.map((setting) => (
            <div key={setting.key} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[14.5px] font-semibold">{setting.name}</span>
                <span className="text-xs text-white/45">{setting.hint}</span>
              </div>
              <button
                onClick={() => set({ [setting.key]: !settings[setting.key] })}
                className="w-12 h-7 rounded-full relative flex-none border border-white/16 transition-all cursor-pointer"
                style={{
                  background: settings[setting.key]
                    ? "linear-gradient(135deg, #e11d2e, #91091a)"
                    : "rgba(255,255,255,0.12)",
                }}
                aria-label={setting.name}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
                  style={{
                    left: settings[setting.key] ? "23px" : "2px",
                  }}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Perangkat */}
        <div className="p-[26px] rounded-[22px] glass-panel flex flex-col gap-4">
          <div className="text-[11px] tracking-widest font-bold text-white/45">PERANGKAT</div>
          <div className="flex flex-col gap-[13px] text-[14px]">
            <div className="flex justify-between">
              <span className="flex items-center gap-2 text-white/50">
                <Monitor className="w-4 h-4" /> Perangkat aktif
              </span>
              <span>
                {dev.browser} · {dev.os}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2 text-white/50">
                <Wifi className="w-4 h-4" /> Kualitas streaming
              </span>
              <span>{settings.hemat ? "720p (hemat data)" : "Otomatis"}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2 text-white/50">
                <Languages className="w-4 h-4" /> Bahasa aplikasi
              </span>
              <span>Bahasa Indonesia</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2 text-white/50">
                <Subtitles className="w-4 h-4" /> Subtitle bawaan
              </span>
              <span>Indonesia</span>
            </div>
          </div>
          <div className="h-px bg-white/10 my-0.5" />
          <div className="text-[13px] leading-relaxed text-white/50">
            Layar {dev.screen} · Akun ini hanya aktif di perangkat ini. Kamu bisa masuk dari
            hingga 5 perangkat berbeda secara bersamaan.
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="p-[26px] rounded-[22px] glass-panel flex flex-col gap-4 border border-white/10">
        <div className="text-[11px] tracking-widest font-bold text-white/45">DATA & KEAMANAN</div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[14.5px] font-semibold">Hapus data tontonan lokal</span>
            <span className="text-xs text-white/45">
              Hapus watchlist, history, dan progres di perangkat ini (data Supabase tetap aman)
            </span>
          </div>
          <button
            onClick={() => setConfirmReset((v) => !v)}
            className="flex items-center gap-2 px-5 py-3 rounded-full text-[13.5px] font-semibold text-white border border-white/16 hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Hapus data
          </button>
        </div>
        {confirmReset && (
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#ff5566]/30 bg-[#e11d2e]/10 px-4 py-3 text-[13px] text-white/80">
            <AlertCircle className="w-4 h-4 flex-none text-[#ff5566]" />
            Yakin hapus semua data tontonan di perangkat ini?
            <div className="flex gap-2 ml-auto">
              <button
                onClick={resetData}
                className="px-4 py-2 rounded-full text-[12.5px] font-bold text-white accent-gradient cursor-pointer"
              >
                Ya, hapus
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-white/70 border border-white/15 hover:bg-white/10 transition-colors cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sign Out */}
      <button
        onClick={doSignOut}
        className="self-start flex items-center gap-2 px-7 py-4 rounded-full text-[14.5px] font-semibold text-white border transition-colors whitespace-nowrap cursor-pointer"
        style={{
          background: "rgba(225,29,46,0.16)",
          borderColor: "rgba(255,90,110,0.4)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(225,29,46,0.3)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(225,29,46,0.16)")}
      >
        <LogOut className="w-4 h-4" />
        Keluar
      </button>

      {/* Edit Profile Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-[400px] p-7 rounded-[24px] glass-panel border border-white/12 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="sora font-bold text-[18px]">Ganti Profil</div>
              <button
                onClick={() => setEditing(false)}
                className="w-9 h-9 rounded-full grid place-items-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Tutup"
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
                  Acak avatar
                </button>
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold text-white/50">NAMA TAMPILAN</span>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full px-4 py-[13px] rounded-full bg-white/6 border border-white/10 focus:border-[#ff5566]/50 focus:outline-none transition-colors text-[14.5px]"
                placeholder="Nama kamu"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold text-white/50">EMAIL</span>
              <input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                type="email"
                className="w-full px-4 py-[13px] rounded-full bg-white/6 border border-white/10 focus:border-[#ff5566]/50 focus:outline-none transition-colors text-[14.5px]"
                placeholder="email@contoh.com"
              />
            </label>

            {editError && (
              <div className="flex items-start gap-2 text-[13px] text-[#ff9aa5] bg-[#e11d2e]/12 border border-[#ff5566]/25 px-4 py-3 rounded-[14px]">
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
              Simpan Perubahan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}