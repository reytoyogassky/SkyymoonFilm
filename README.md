# SKYMOON

Platform streaming film & serial dengan subtitle bahasa Indonesia. Katalog IDLIX (internasional) dan NgeFilm (film/series Indonesia), dengan pemutar HLS, daftar tontonan, dan akun pengguna (Supabase).

## Perintah

```bash
npm run dev     # development server
npm run build   # production build
npm start       # jalankan hasil build
npm run lint    # eslint

npm run scrape       # refresh katalog (mode merge)
npm run scrape:fresh # bangun ulang katalog dari nol
npm run cache:hero   # regenerate hero cache (IDLIX only)
```

## Struktur

- `app/` — halaman & API routes (katalog, stream IDLIX, SSE NgeFilm, proxy HLS)
- `components/` — komponen UI (AppShell, MovieCard, Player, dll)
- `lib/` — scraper IDLIX & NgeFilm, tipe data
- `public/assets/` — logo SKYMOON
- `scripts/` — scraper katalog, cron auto-update, generator hero cache
- `supabase/schema.sql` — skema database (jalankan di SQL Editor Supabase)

## Fitur Utama

- **Katalog Gabungan** — IDLIX (internasional) + NgeFilm (film/series Indonesia) di halaman jelajah
- **Hero IDLIX-only** — hero homepage hanya menampilkan judul IDLIX, tanpa konten Indonesia
- **Provider terpisah** — judul IDLIX selalu diputar lewat IDLIX; NgeFilm hanya dipakai untuk judul NgeFilm
- **Server Selector** — pilih server NgeFilm secara manual; server mati otomatis dilewati
- **Retry & Server Rotation** — stream yang gagal dipindah ke server lain, lalu di-scrape ulang sekali sebelum menyerah
- **SSE Progress** — progres scraping NgeFilm real-time (`/api/ngefilm/stream-sse`)
- **SessionStorage Cache** — hasil scrape NgeFilm di-cache per slug+episode (maksimal 20 menit)
- **HLS Proxy** — proxy manifest + segment untuk bypass pembatasan CDN

## Auto-update Katalog

Produksi menjalankan `scripts/start-with-cron.sh`, yang menyalakan `scripts/cron-scrape.js`
sebelum Next.js. Scraper me-refresh `catalog.json` dan `hero-cache.json` setiap 6 jam,
sehingga daftar Film Populer ikut ter-update.

## API Routes

| Route | Fungsi |
|-------|--------|
| `/api/catalog/browse` | Browse katalog (IDLIX + NgeFilm, paginated + filter) |
| `/api/catalog/search` | Pencarian judul |
| `/api/catalog/[slug]` | Detail film/series |
| `/api/catalog/[slug]/episodes` | Daftar episode series |
| `/api/catalog/stats` | Statistik katalog & genre |
| `/api/stream/[slug]` | Stream IDLIX (gate token flow) |
| `/api/prefetch/[slug]` | Prefetch stream di background |
| `/api/ngefilm/stream-sse` | SSE scraping + server rotation NgeFilm |
| `/api/proxy` | HLS proxy (manifest & segment) |
| `/api/subtitle` | Subtitle proxy (VTT) |
| `/api/sync` | Sync progress ke Supabase |

## Environment Variables

```env
# Supabase (optional)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # SERVER ONLY

# TMDB (dipakai untuk poster/backdrop/logo/rating/genre — isi salah satu)
TMDB_API_TOKEN=eyJ...   # v4 Read Access Token (disarankan)
# TMDB_API_KEY=...      # v3 API Key (alternatif)
```

Tanpa salah satu kredensial TMDB di atas, data NgeFilm tetap diambil dari
halaman detail NgeFilm (poster resolusi penuh, rating, durasi, genre, negara,
sinopsis), tetapi **backdrop dan logo judul tidak bisa diambil dari TMDB**.

Setelah menambahkan kredensial, jalankan ulang:

```bash
node scripts/scrape-catalog.js
```
