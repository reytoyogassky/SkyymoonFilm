-- ============================================================
-- SKYMOON · Supabase Schema (v2 - login simpel, tanpa auth)
-- Jalankan di Supabase Dashboard -> SQL Editor
-- ============================================================
-- Catatan: tidak memakai auth.users. user_id = username (text).
-- Akses data lewat API route server-side (service role).
-- Jadi RLS TIDAK diaktifkan.

-- 1) Watchlist
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  slug text not null,
  title text not null,
  poster_path text not null default '',
  release_date text not null default '',
  quality text not null default '',
  country text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- 2) History (riwayat tonton)
create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  slug text not null,
  title text not null,
  poster_path text not null default '',
  release_date text not null default '',
  quality text not null default '',
  country text not null default '',
  watched_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- 3) Progress tonton per judul
create table if not exists public.progress (
  user_id text not null,
  slug text not null,
  time double precision not null default 0,
  duration double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, slug)
);

-- 4) Profile ringan (username -> nama tampilan)
create table if not exists public.profiles (
  user_id text primary key,
  name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);