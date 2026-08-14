# Supabase Setup (SKYMOON) — login simpel, tanpa auth

Aplikasi memakai **login simpel** (cukup username, tanpa password). Supabase dipakai HANYA untuk penyimpanan data (watchlist, history, progress) per-user.

## 1. Isi .env.local

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # bisa dikosongkan
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # SERVER ONLY! jangan di-prefix NEXT_PUBLIC_
```

> `SUPABASE_SERVICE_ROLE_KEY` dipakai di `app/api/sync/route.ts` (server-side). Key ini punya akses penuh — **jangan pernah** diekspos ke client.

## 2. Jalankan schema

Buka **SQL Editor** di dashboard Supabase, tempel isi `supabase/schema.sql`, lalu **Run**.

Membuat tabel (tanpa RLS, tanpa auth.users):
- `profiles` — username → nama tampilan
- `watchlist` — daftar tontonan (unique user_id+slug)
- `history` — riwayat tonton (unique user_id+slug)
- `progress` — posisi video terakhir (PK user_id+slug)

Catatan: jika tabel versi lama (pakai `auth.users`) sudah terlanjur dibuat, jalankan dulu:
```sql
drop table if exists public.profiles, public.watchlist, public.history, public.progress cascade;
```

## 3. Alur aplikasi

| Route | Fungsi |
|-------|--------|
| `/masuk` | Login: ketik username saja (atau tombol Google) |
| `/daftar` | Buat username baru — langsung masuk |
| `/akun` | Profil + tombol keluar |

- Sesi disimpan di localStorage (`skymoon:session`).
- Setiap perubahan watchlist/history/progress dikirim ke `POST /api/sync`, dan saat login/muat halaman data diambil dari `GET /api/sync` lalu digabung dengan localStorage.
- Tanpa Supabase terkonfigurasi, semua data tetap jalan di localStorage saja.