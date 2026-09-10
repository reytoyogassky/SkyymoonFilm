# SKYMOON

Platform streaming film & serial pilihan dengan subtitle bahasa Indonesia. Katalog dari IDLIX dan NgeFilm (film/series Indonesia), dengan pemutar HLS, daftar tontonan, dan akun pengguna (Supabase).

## Perintah

```bash
npm run dev     # development server
npm run build   # production build
npm start       # jalankan hasil build
npm run lint    # eslint
```

## Struktur

- `app/` — halaman & API routes (proxy stream, katalog, pencarian, NgeFilm)
- `components/` — komponen UI (AppShell, MovieCard, Player, dll)
- `lib/` — scraper IDLIX & NgeFilm, tipe data
- `public/assets/` — logo SKYMOON
- `supabase/schema.sql` — skema database (jalankan di SQL Editor Supabase)

## Fitur Utama

- **Katalog Gabungan** — IDLIX (internasional) + NgeFilm (film/series Indonesia) digabung di halaman jelajah
- **Fallback Otomatis** — Jika IDLIX stream gagal (502), Player otomatis switch ke NgeFilm Puppeteer scraping
- **Server Selector** — Pilih server streaming secara manual di Player (Server 1-5, skip Server 1/2 untuk NgeFilm)
- **SSE Progress** — Real-time progress scraping NgeFilm via Server-Sent Events (`/api/ngefilm/stream-sse`)
- **SessionStorage Cache** — NgeFilm scrape results di-cache per slug+episode (tidak re-scrape konten sama)
- **HLS Proxy** — Node.js `http`/`https` modules untuk bypass CDN restrictions (bukan `fetch`)
- **HLS Config** — `maxBufferLength: 30`, `maxBufferSize: 30MB`, `startLevel: -1`, `lowLatencyMode: false`

## API Routes

| Route | Fungsi |
|-------|--------|
| `/api/movies` | Browse katalog IDLIX (paginated + filter) |
| `/api/movies/[slug]` | Detail film — IDLIX dengan fallback ke NgeFilm |
| `/api/search` | Pencarian judul |
| `/api/stream/[slug]` | IDLIX stream (gate token flow) |
| `/api/prefetch/[slug]` | Trigger prefetch stream di background |
| `/api/ngefilm/browse` | Browse katalog NgeFilm |
| `/api/ngefilm/scrape` | Scrape detail NgeFilm via Puppeteer |
| `/api/ngefilm/stream` | NgeFilm Puppeteer stream extraction |
| `/api/ngefilm/stream-sse` | SSE endpoint — real-time scraping progress |
| `/api/proxy` | HLS proxy (Node.js http/https) |
| `/api/subtitle` | Subtitle proxy (VTT) |
| `/api/sync` | Sync progress ke Supabase |

## Environment Variables

```env
# Supabase (optional)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # SERVER ONLY
```
