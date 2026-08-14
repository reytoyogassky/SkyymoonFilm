"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export const PROFILE_NAME = "Reytoyogassky";
export const PROFILE_INITIAL = "R";
export const PROFILE_EMAIL = "reytoyogas@gmail.com";

const VERSION = "v2";
const ONBOARD_KEY = `skymoon:${VERSION}:onboarded`;
const WATCHLIST_KEY = `skymoon:${VERSION}:watchlist`;
const HISTORY_KEY = `skymoon:${VERSION}:history`;
const PROGRESS_KEY = `skymoon:${VERSION}:progress`;
const EVENT = "skymoon:store-change";

export interface SavedTitle {
  slug: string;
  title: string;
  posterPath: string;
  releaseDate: string;
  quality: string;
  country: string;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

function useStoreValue<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    const t = setTimeout(() => setValue(read(key, fallback)), 0);
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === key) setValue(read(key, fallback));
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      clearTimeout(t);
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T) => {
      write(key, v);
      setValue(v);
    },
    [key]
  );

  return [value, set];
}

export function useOnboarding() {
  const [onboarded, setOnboarded] = useStoreValue(ONBOARD_KEY, false);
  return {
    onboarded,
    finish: () => setOnboarded(true),
    signOut: () => setOnboarded(false),
  };
}

/* ------------------------------------------------------------------
   Login simpel: username/email + password (tanpa OAuth / verifikasi).
   Akun disimpan di localStorage; data disinkron ke Supabase.
------------------------------------------------------------------- */

export interface LocalAccount {
  username: string;
  email: string;
  name: string;
  password: string;
  avatar: string;
  createdAt: string;
}

export interface SessionUser {
  username: string;
  name: string;
  email: string;
  initial: string;
  avatar: string;
  createdAt: string;
}

export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

const OLD_AVATAR_HOST = "api.multiavatar.com";

function freshAvatar(seed: string, current?: string): string {
  if (current && !current.includes(OLD_AVATAR_HOST)) return current;
  return avatarUrl(seed);
}

const ACCOUNTS_KEY = `skymoon:${VERSION}:accounts`;
const SESSION_KEY = `skymoon:${VERSION}:session`;
const SYNC_TABLES = ["watchlist", "history", "progress"] as const;

interface SyncRow {
  slug?: string;
  title?: string;
  poster_path?: string;
  release_date?: string;
  quality?: string;
  country?: string;
  time?: number;
  duration?: number;
  updated_at?: string;
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ".").slice(0, 60);
}

function ensureAccounts(): LocalAccount[] {
  return read<LocalAccount[]>(ACCOUNTS_KEY, []);
}

function clearOldStorage() {
  try {
    const prefix = `skymoon:${VERSION}:`;
    const keys = Object.keys(window.localStorage).filter(
      (k) => k.startsWith("skymoon:") && !k.startsWith(prefix)
    );
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // abaikan
  }
}

function buildSession(a: LocalAccount): SessionUser {
  const name = a.name || a.username;
  return {
    username: a.username,
    name,
    email: a.email,
    initial: name.slice(0, 1).toUpperCase() || "?",
    avatar: freshAvatar(a.username, a.avatar),
    createdAt: a.createdAt,
  };
}

/* ------------------------------------------------------------------
   Sesi dibagikan antar komponen (module-level store) supaya tombol
   Masuk/avatar langsung berubah tanpa reload.
------------------------------------------------------------------- */

let cachedSession: SessionUser | null = null;
const sessionListeners = new Set<() => void>();

function emitSession() {
  sessionListeners.forEach((fn) => fn());
}

function getSessionSnapshot(): SessionUser | null {
  return cachedSession;
}

function subscribeSession(fn: () => void) {
  sessionListeners.add(fn);
  return () => {
    sessionListeners.delete(fn);
  };
}

function sanitizeSession(s: SessionUser | null): SessionUser | null {
  if (!s) return null;
  if (s.avatar && !s.avatar.includes(OLD_AVATAR_HOST)) return s;
  return { ...s, avatar: avatarUrl(s.username) };
}

function loadSessionFromStorage() {
  clearOldStorage();
  cachedSession = sanitizeSession(read<SessionUser | null>(SESSION_KEY, null));
  emitSession();
}

export function useAuth() {
  const user = useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      loadSessionFromStorage();
      setReady(true);
    }, 0);

    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) {
        cachedSession = sanitizeSession(read<SessionUser | null>(SESSION_KEY, null));
        emitSession();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearTimeout(t);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const login = useCallback((identifier: string, password: string): string | null => {
    const accounts = ensureAccounts();
    const id = identifier.trim().toLowerCase();
    const account = accounts.find(
      (a) => a.username === id || a.email.toLowerCase() === id
    );
    if (!account) return "Akun tidak ditemukan. Coba daftar dulu.";
    if (account.password !== password) return "Password salah.";
    const s = buildSession(account);
    write(SESSION_KEY, s);
    cachedSession = s;
    emitSession();
    return null;
  }, []);

  const register = useCallback(
    (data: { username: string; email: string; name?: string; password: string }): string | null => {
      const accounts = ensureAccounts();
      const username = normalizeUsername(data.username);
      const email = data.email.trim().toLowerCase();
      if (accounts.some((a) => a.username === username))
        return "Username sudah dipakai.";
      if (accounts.some((a) => a.email.toLowerCase() === email))
        return "Email sudah terdaftar. Silakan masuk.";
      const account: LocalAccount = {
        username,
        email,
        name: data.name?.trim() || data.username.trim(),
        password: data.password,
        avatar: avatarUrl(
          `${username}-${Math.random().toString(36).slice(2, 8)}`
        ),
        createdAt: new Date().toISOString(),
      };
      write(ACCOUNTS_KEY, [account, ...accounts]);
      const s = buildSession(account);
      write(SESSION_KEY, s);
      cachedSession = s;
      emitSession();
      return null;
    },
    []
  );

  const signOut = useCallback(() => {
    write(SESSION_KEY, null);
    cachedSession = null;
    emitSession();
  }, []);

  const updateProfile = useCallback(
    (data: { name: string; email: string; avatar?: string }): string | null => {
      const current = cachedSession;
      if (!current) return "Belum masuk.";
      const accounts = ensureAccounts();
      const email = data.email.trim().toLowerCase();
      if (
        accounts.some(
          (a) => a.username !== current.username && a.email.toLowerCase() === email
        )
      ) {
        return "Email sudah dipakai akun lain.";
      }
      const next = accounts.map((a) =>
        a.username === current.username
          ? {
              ...a,
              name: data.name.trim() || a.username,
              email,
              avatar: data.avatar || a.avatar,
            }
          : a
      );
      write(ACCOUNTS_KEY, next);
      const s = buildSession(next.find((a) => a.username === current.username)!);
      write(SESSION_KEY, s);
      cachedSession = s;
      emitSession();
      return null;
    },
    []
  );

  return { user, ready, login, register, signOut, updateProfile };
}

/* ------------------------------------------------------------------
   Preferensi per-user (tersimpan di localStorage per username)
------------------------------------------------------------------- */

export interface UserSettings {
  autoplay: boolean;
  hemat: boolean;
  notif: boolean;
}

const DEFAULT_SETTINGS: UserSettings = { autoplay: true, hemat: false, notif: true };

function settingsKey(username: string) {
  return `skymoon:${VERSION}:settings:${username}`;
}

export function useSettings() {
  const { user, ready } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      setSettings(read(settingsKey(user?.username ?? "guest"), DEFAULT_SETTINGS));
    }, 0);
    return () => clearTimeout(t);
  }, [ready, user?.username]);

  const set = useCallback(
    (patch: Partial<UserSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (user) write(settingsKey(user.username), next);
        return next;
      });
    },
    [user]
  );

  return { settings, set };
}

/* ------------------------------------------------------------------
   Sinkron Supabase helper (client-side panggil /api/sync)
------------------------------------------------------------------- */

async function syncPush(table: string, user: string, body: Record<string, unknown>) {
  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, user, ...body }),
    });
  } catch {
    // offline / belum dikonfigurasi — abaikan
  }
}

async function syncPull(table: string, user: string): Promise<SyncRow[] | null> {
  try {
    const res = await fetch(`/api/sync?table=${table}&user=${encodeURIComponent(user)}`);
    if (!res.ok) return null;
    const d = await res.json();
    return Array.isArray(d.rows) ? (d.rows as SyncRow[]) : null;
  } catch {
    return null;
  }
}

function toDb(title: SavedTitle) {
  return {
    slug: title.slug,
    title: title.title,
    posterPath: title.posterPath,
    releaseDate: title.releaseDate,
    quality: title.quality,
    country: title.country,
  };
}

function fromDb(row: SyncRow): SavedTitle {
  return {
    slug: row.slug ?? "",
    title: row.title ?? "",
    posterPath: row.poster_path ?? "",
    releaseDate: row.release_date ?? "",
    quality: row.quality ?? "",
    country: row.country ?? "",
  };
}

function useSyncPull(
  table: "watchlist" | "history",
  list: SavedTitle[],
  setList: (v: SavedTitle[]) => void
) {
  const { user, ready } = useAuth();

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    const pull = async () => {
      const remote = await syncPull(table, user.username);
      if (cancelled || !remote || remote.length === 0) return;
      const r = fromDbList(remote);
      const merged =
        table === "history"
          ? [...r, ...list.filter((l) => !r.some((x) => x.slug === l.slug))].slice(0, 8)
          : [...r, ...list.filter((l) => !r.some((x) => x.slug === l.slug))];
      setList(merged);
    };
    pull();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.username]);
}

function fromDbList(rows: SyncRow[]): SavedTitle[] {
  return rows.map(fromDb);
}

export function useWatchlist() {
  const [list, setList] = useStoreValue<SavedTitle[]>(WATCHLIST_KEY, []);
  const { user, ready } = useAuth();

  useSyncPull("watchlist", list, setList);

  const has = useCallback((slug: string) => list.some((t) => t.slug === slug), [list]);

  const toggle = useCallback(
    (title: SavedTitle) => {
      const exists = list.some((t) => t.slug === title.slug);
      const next = exists
        ? list.filter((t) => t.slug !== title.slug)
        : [title, ...list];
      setList(next);
      if (ready && user) {
        syncPush(
          "watchlist",
          user.username,
          exists
            ? { action: "delete", item: { slug: title.slug } }
            : { action: "upsert", item: toDb(title) }
        );
      }
    },
    [list, setList, ready, user]
  );

  return { list, has, toggle };
}

export function useHistory() {
  const [list, setList] = useStoreValue<SavedTitle[]>(HISTORY_KEY, []);
  const { user, ready } = useAuth();

  useSyncPull("history", list, setList);

  const record = useCallback(
    (title: SavedTitle) => {
      if (list[0] && JSON.stringify(list[0]) === JSON.stringify(title)) return;
      const next = [title, ...list.filter((t) => t.slug !== title.slug)].slice(0, 8);
      setList(next);
      if (ready && user) {
        syncPush("history", user.username, { action: "upsert", item: toDb(title) });
      }
    },
    [list, setList, ready, user]
  );

  return { list, record };
}

export interface WatchProgress {
  time: number;
  duration: number;
  updatedAt: number;
}

export function useProgress() {
  const [map, setMap] = useStoreValue<Record<string, WatchProgress>>(PROGRESS_KEY, {});
  const { user, ready } = useAuth();

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    const pull = async () => {
      const remote = await syncPull("progress", user.username);
      if (cancelled || !remote || remote.length === 0) return;
      const merged: Record<string, WatchProgress> = { ...map };
      for (const row of remote) {
        if (!row.slug) continue;
        merged[row.slug] = {
          time: row.time ?? 0,
          duration: row.duration ?? 0,
          updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
        };
      }
      setMap(merged);
    };
    pull();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.username]);

  const save = useCallback(
    (slug: string, progress: WatchProgress) => {
      setMap({ ...map, [slug]: progress });
      if (ready && user) {
        syncPush("progress", user.username, {
          slug,
          time: progress.time,
          duration: progress.duration,
        });
      }
    },
    [map, setMap, ready, user]
  );

  return { map, save };
}

export { SYNC_TABLES };