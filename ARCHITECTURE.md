# SKYMOON Streaming - Arsitektur & Alur Data

## Ringkasan

Aplikasi streaming film berbasis **Next.js 16** yang mengambil data dari IDLIX API dan NgeFilm (film/series Indonesia), menyimpan katalog secara lokal sebagai JSON statis, dan memproses streaming video melalui gate-token flow (IDLIX) atau Puppeteer scraping (NgeFilm) dengan cookie persistence. Semua proses berjalan di **Node.js** (tanpa Python).

---

## Stack Teknologi

| Layer | Teknologi |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS, Motion (animasi) |
| Video Player | HLS.js (adaptive bitrate streaming) |
| Auth | Supabase (email/password) |
| Data Source | IDLIX API (`z2.idlixku.com`), NgeFilm (`new39.ngefilm.site`) |
| HTTP Client | `curl` via `child_process` (IDLIX, bypass Cloudflare), Puppeteer (NgeFilm, bypass JavaScript) |
| HLS Proxy | Node.js `http`/`https` modules (bypass CDN restrictions) |
| State | Client-side `localStorage` (progress, watchlist), `sessionStorage` (NgeFilm cache) |

---

## Struktur Direktori

```
app/
  page.tsx                     # Homepage (trending, populer, NgeFilm sections)
  jelajahi/page.tsx            # Halaman jelajah/explore + dropdown filters
  movie/[slug]/page.tsx        # Detail film/series (all routes)
  daftar-saya/page.tsx         # Watchlist user (localStorage)
  masuk/ & daftar/             # Auth pages
  akun/                        # Profil user
  api/
    movies/route.ts            # Browse API (paginated + filter)
    movies/[slug]/route.ts     # Detail satu film (IDLIX + NgeFilm fallback)
    search/route.ts            # Pencarian judul
    stream/[slug]/route.ts     # Ambil stream URL (gate flow)
    prefetch/[slug]/route.ts   # Trigger prefetch stream di background
    tv-episodes/[slug]/route.ts # Daftar episode series
    proxy/route.ts             # HLS proxy (Node.js http/https)
    subtitle/route.ts          # Subtitle proxy (VTT)
    ngefilm/
      browse/route.ts          # NgeFilm catalog browse
      scrape/route.ts          # NgeFilm Puppeteer scraping
      stream/route.ts          # NgeFilm Puppeteer stream extraction
      stream-sse/route.ts      # SSE endpoint — real-time scraping progress
    stats/route.ts             # Statistik katalog
    sync/route.ts              # Sync progress ke Supabase

components/
  Player.tsx          # Video player (HLS, subtitle, quality selector, NgeFilm fallback, server selector)
  MovieDetail.tsx     # Halaman detail film (info, cast, seasons, NgeFilm episodes)
  MovieCard.tsx       # Kartu film (poster + judul)
  DragCarousel.tsx    # Carousel horizontal (drag-scroll)
  AppShell.tsx        # Layout wrapper (navbar, footer)
  AuthForm.tsx        # Form login/daftar
  UserMenu.tsx        # Dropdown menu user
  PageLoader.tsx      # Loading skeleton

lib/
  idlix.ts            # Core: semua interaksi IDLIX (browse, detail, stream)
  ngefilm.ts          # NgeFilm scraper library (listing, detail, episodes, stream extraction)
  media.ts            # Helper media (format durasi, dsb)
  types.ts            # TypeScript types (MovieListItem with source field)
  client-store.ts     # localStorage wrapper (progress, watchlist)
  supabase/           # Supabase client & admin

scripts/
  scrape-idlix.js     # Scrape katalog dari IDLIX browse API
  enrich-catalog.js   # Enrich katalog dengan genre/cast dari detail API
  scrape-streams.js   # Test/debug streaming

public/idlix-data/
  catalog.json        # Katalog lengkap (~12.000 film/series)

ngefilm-scraper/            # Standalone NgeFilm scraper (separate tool)
  scraper.js                # Listing + Puppeteer stream URL extraction (resume support)
  output/
    listing-film.json       # 862 film listings
    listing-series.json     # 71 series listings
    _progress.json          # Resume cache (skip already-scraped items)
    films.json              # Films with stream URLs
    series.json             # Series with stream URLs
```

---

## Alur Data: Dari Scrape Sampai Diputar

### 1. Scraping Katalog IDLIX (`scripts/scrape-idlix.js`)

```
IDLIX Browse API ──curl──> scrape-idlix.js ──> catalog.json
```

- Endpoint: `GET /api/browse?page={n}&limit=50&sort={popular|latest}`
- Iterasi semua halaman (247+ halaman) untuk sort `popular` dan `latest`
- Deduplikasi berdasarkan `slug`
- Output: `public/idlix-data/catalog.json` (~12.000 item)
- Setiap item berisi: `id`, `slug`, `title`, `posterPath`, `backdropPath`, `releaseDate`, `voteAverage`, `country`, `runtime`, `contentType`, `isSeries`

### 2. Enrichment Genre & Cast (`scripts/enrich-catalog.js`)

```
catalog.json ──> untuk setiap item tanpa genre:
  IDLIX Detail API ──curl──> extract genres, cast, overview
  ──> update catalog.json
```

- Endpoint: `GET /api/movies/{slug}` atau `GET /api/series/{slug}`
- Concurrency: 15 request paralel
- Data yang diambil: `genres`, `cast` (maks 12), `overview`, `runtime`, `director`, `tagline`, `backdropPath`, `posterPath`, `numberOfSeasons`, `voteCount`
- Progress disimpan setiap 500 item (crash-safe)

### 3. Scraping NgeFilm (`ngefilm-scraper/scraper.js`)

```
NgeFilm HTML ──> scraper.js ──> listing-film.json + listing-series.json
  ──> Puppeteer stream extraction ──> films.json + series.json
```

- **Phase 1 — Listing**: Scrape browse pages untuk mendapatkan semua film/series + URL detail
  - Film: `https://new39.ngefilm.site/page/{n}/`
  - Series: `https://new39.ngefilm.site/tv/page/{n}/`
  - Output: `listing-film.json` (862 items), `listing-series.json` (71 items)
- **Phase 2 — Stream URLs**: Puppeteer scraping untuk setiap item
  - Server priority: Server 5 → 4 → 3 (skip Server 1/2, unreliable)
  - Multi-iframe retry: up to 3 iframes per server
  - Output: `films.json` + `series.json` dengan stream URLs
- **Resume support**: Progress disimpan di `_progress.json`, skip items yang sudah di-scrape
- **Skip logic**: Default skip semua yang sudah ada; tambah `--retry-failed` untuk retry yang gagal

### 4. Browse & Filter (`lib/idlix.ts` > `idlixBrowseList`)

```
User buka /jelajahi ──> API /api/movies?sort=popular&genre=action&country=US&type=movie
  ──> idlixBrowseList() ──> loadCatalog() ──> baca catalog.json
  ──> filter server-side (genre, country, mediaType)
  ──> sort (popular = default order, latest = by releaseDate)
  ──> paginate (limit per page)
  ──> return { items, total, totalPages }
```

- Katalog di-reload setiap 5 menit dari disk (agar update enrichment ter-pick up)
- Filter genre & country: dropdown `<select>` di frontend
- Cache per kombinasi filter selama 5 menit

### 5. Detail Film (`app/api/movies/[slug]/route.ts`)

```
User buka /movie/{slug}
  ──> cek katalog lokal (catalog.json) ──> ada? return IDLIX data
  ──> tidak ada? coba IDLIX detail API
  ──> IDLIX gagal? fallback ke NgeFilm Puppeteer scraping
  ──> return + _pageUrl untuk NgeFilm series routing
```

- **IDLIX priority**: Katalog lokal > API (menghindari Cloudflare block)
- **NgeFilm fallback**: Jika IDLIX gagal (404, 502), scrape NgeFilm via Puppeteer
- **`_pageUrl`**: Disertakan untuk series agar client tahu URL yang benar (`/tv/{slug}/` vs `/{slug}/`)
- Untuk series IDLIX: ambil daftar season & episode dari `/api/series/{slug}/season/{n}`
- Untuk series NgeFilm: scrape episode list dari detail page NgeFilm

### 6. Streaming: IDLIX Gate Token Flow (`lib/idlix.ts` > `getGateAndRedeem`)

```
┌─────────────────────────────────────────────────────────┐
│  IDLIX STREAMING FLOW (semua request pakai cookie jar)  │
│                                                         │
│  1. Lookup ID dari katalog lokal (skip API call)        │
│     catalog.json ──> cari by slug ──> dapat UUID        │
│                                                         │
│  2. GET /api/watch/play-info/movie/{uuid}               │
│     Response: { kind: "gate", gateToken: "...",         │
│                 unlockAt: 1234567890 }                   │
│                                                         │
│  3. Tunggu sampai unlockAt tercapai (+300ms buffer)     │
│                                                         │
│  4. POST /api/watch/session/claim                       │
│     Body: { gateToken: "..." }                          │
│     Response awal: { kind: "pending", remainingMs: N }  │
│     ──> retry sampai dapat:                             │
│     { claim: "...", redeemUrl: "https://..." }          │
│                                                         │
│  5. POST {redeemUrl}  (mobile UA + cross-site headers)  │
│     Body: { claim: "..." }                              │
│     Response: { code: "ok", url: "https://...m3u8",     │
│                 expiresAt: ..., subtitles: [...] }       │
│                                                         │
│  6. Return streamUrl + subtitles ke client              │
└─────────────────────────────────────────────────────────┘
```

**Detail teknis penting:**

- **Cookie Jar**: Semua 4 request (play-info, claim, retry claim, redeem) HARUS berbagi cookie yang sama
- **Mobile UA pada Redeem**: Step 5 menggunakan User-Agent mobile + header `sec-ch-ua-mobile: ?1` dan `sec-fetch-site: cross-site`
- **Gate Wait**: Server menentukan kapan gate bisa di-unlock via `unlockAt` timestamp
- **Claim Retry**: Claim bisa return `pending` beberapa kali. Retry max 4x dengan delay `remainingMs + 200ms`
- **Redeem URL**: URL eksternal (bukan IDLIX domain), mengembalikan HLS manifest URL

**Untuk TV Series:**
- Path play-info: `/api/watch/play-info/episode/{episodeId}`
- Dicoba 3 path prefix: `episode/`, `tv-episode/`, `series-episode/`

### 7. Streaming: NgeFilm Puppeteer Fallback (`app/api/ngefilm/stream-sse/route.ts`)

```
┌─────────────────────────────────────────────────────────────┐
│  NGEFILM STREAMING FLOW (Puppeteer + SSE progress)          │
│                                                             │
│  1. Client buka /movie/{slug} ──> detail API gagal (502)   │
│     ──> Player otomatis trigger NgeFilm fallback            │
│                                                             │
│  2. SSE connection: GET /api/ngefilm/stream-sse?slug=...   │
│     ──> real-time progress events ke client                 │
│                                                             │
│  3. Puppeteer navigate ke NgeFilm detail page               │
│     waitUntil: domcontentloaded, timeout: 25s               │
│                                                             │
│  4. Find servers: .muvipro-player-tabs a (Server 3/4/5)    │
│     Skip Server 1/2 (unreliable)                            │
│                                                             │
│  5. For each server:                                        │
│     a. Navigate to server page (timeout: 30s)               │
│     b. Find iframes (up to 3 per server, retry)            │
│     c. For each iframe:                                     │
│        - Navigate to iframe (timeout: 30s)                  │
│        - Play video / click play button                     │
│        - Listen for m3u8 URLs via request interception      │
│        - Capture HLS stream URL                             │
│                                                             │
│  6. Return best stream URL + subtitle URL to Player         │
│     ──> HLS.js load & play                                  │
└─────────────────────────────────────────────────────────────┘
```

**Detail teknis penting:**

- **SSE Events**: `progress`, `info`, `error`, `done`
- **SessionStorage Cache**: `ngefilm_{slug}_{episodeId}` — tidak re-scrape konten sama
- **Server Priority**: Server 5 → 4 → 3 (skip 1/2, unreliable)
- **Multi-iframe Retry**: Up to 3 iframes per server (some iframes fail to load)
- **Ad Block**: Request interception blocks ad domains (`AD_RE` pattern)
- **URL Rewriting**: M3U8 URLs rewritten via `/api/ngefilm/stream` proxy

### 8. Player Fallback Logic (`components/Player.tsx`)

```
┌─────────────────────────────────────────────────────┐
│  PLAYER FALLBACK (3 consecutive IDLIX 502s)         │
│                                                     │
│  1. Player loads with IDLIX stream URL              │
│                                                     │
│  2. If 3 consecutive 502 errors detected:           │
│     ──> Switch to NgeFilm fallback                  │
│     ──> Connect to /api/ngefilm/stream-sse          │
│     ──> Show SSE progress in UI                     │
│                                                     │
│  3. NgeFilm stream loaded:                          │
│     ──> HLS.js load new stream URL                  │
│     ──> Continue playback                           │
│                                                     │
│  4. Server selector available:                      │
│     ──> Manual switch between IDLIX/NgeFilm servers │
│     ──> Auto-next-server on failure                 │
└─────────────────────────────────────────────────────┘
```

- **HLS Config**: `maxBufferLength: 30`, `maxBufferSize: 30MB`, `startLevel: -1`, `lowLatencyMode: false`
- **Subtitle**: Indonesian (`lang: "id"`) diprioritaskan
- **Quality**: Auto (ABR) atau manual (360p-4K)
- **Progress**: Disimpan ke localStorage setiap 5 detik
- **Fullscreen**: Support native fullscreen + iOS `webkitEnterFullscreen`

### 9. HLS Proxy (`app/api/proxy/route.ts`)

```
/video.m3u8 ──> /api/proxy?url={encodedUrl}
  ──> Node.js http/https.get() ──> relay response
  ──> M3U8 URLs rewritten to /api/proxy?url=...
```

- **Node.js `http`/`https` modules** (bukan `fetch`) — kritis untuk CDN compatibility
- **Redirect handling**: Auto-follow 301/302 redirects
- **M3U8 URL rewriting**: Segments/playlist URLs rewritten to go through proxy
- **Required because**: Browser memblokir cross-origin request ke CDN IDLIX/NgeFilm

### 10. Pencarian (`/api/search`)

```
User ketik query ──> /api/search?q={query}
  ──> cari di katalog lokal (fuzzy match pada title)
  ──> return hasil yang cocok
```

### 11. Watchlist & Progress (Supabase + localStorage)

```
User login ──> GET /api/sync ──> ambil data dari Supabase
  ──> gabung dengan localStorage ──> resolve conflicts

User ubah watchlist/progress ──> update localStorage
  ──> POST /api/sync ──> sync ke Supabase
```

- **Conflict resolution**: localStorage = source of truth (offline-first)
- **Supabase**: Backup/sync across devices (optional)
- **Tanpa Supabase**: Semua data tetap jalan di localStorage saja

---

## Mengapa Pakai `curl` (IDLIX) dan Puppeteer (NgeFilm)?

### IDLIX — `curl` via `child_process`

IDLIX dilindungi Cloudflare. Request langsung dari Node.js `https`/`fetch` mendapat challenge 403/429. `curl` bisa lewat karena:

1. Header yang tepat (User-Agent, Referer, Accept)
2. Cookie persistence antar request (cookie jar)
3. Tidak ada fingerprinting TLS yang ketat pada endpoint API internal

Browse API kadang di-challenge juga — maka katalog discrape sekali lalu disimpan lokal sebagai `catalog.json`.

### NgeFilm — Puppeteer

NgeFilm menggunakan JavaScript-heavy pages dengan dynamic content loading. Puppeteer diperlukan karena:

1. Server pages memuat iframe secara dinamis
2. Stream URLs hanya muncul setelah video play (request interception)
3. Multi-iframe retry diperlukan karena beberapa iframe gagal load
4. Ad blocking via request interception

---

## Diagram Ringkas

```
┌──────────────┐     scrape      ┌──────────────────┐
│  IDLIX API   │ ──────────────> │  catalog.json     │
│  (browse)    │    (curl, 1x)   │  (12.000+ items)  │
└──────────────┘                 └────────┬─────────┘
                                          │ loadCatalog()
┌──────────────┐     enrich      ┌────────▼─────────┐
│  IDLIX API   │ ──────────────> │  idlixBrowseList  │ ──> /api/movies
│  (detail)    │  (curl, batch)  │  idlixDetail      │ ──> /api/movies/[slug]
└──────────────┘                 └──────────────────┘

┌──────────────┐   gate flow     ┌──────────────────┐     ┌─────────┐
│  IDLIX API   │ ──────────────> │  getGateAndRedeem │ ──> │ HLS.js  │
│  (streaming) │  (curl+cookies) │  (play→claim→     │     │ Player  │
│              │                 │   redeem)          │     └─────────┘
└──────────────┘                 └──────────────────┘

┌──────────────┐   puppeteer     ┌──────────────────┐     ┌─────────┐
│  NgeFilm     │ ──────────────> │  stream-sse       │ ──> │ HLS.js  │
│  (scraper)   │  (iframe scrape)│  (real-time SSE)  │     │ Player  │
│              │                 │  + proxy rewrite   │     └─────────┘
└──────────────┘                 └──────────────────┘
```

---

## NgeFilm Scraper (Standalone Tool)

Scraper terpisah di `D:\gabut\ngefilm-scraper\` untuk scraping semua film/series NgeFilm ke JSON — berguna untuk API atau integrasi masa depan.

### Perintah

```bash
cd D:\gabut\ngefilm-scraper

# Listing saja
node scraper.js --mode=listing --type=film
node scraper.js --mode=listing --type=series

# Listing + stream URLs (full scrape)
node scraper.js --mode=full --type=film --pages=50
node scraper.js --mode=full --type=series --pages=10

# Resume + retry yang gagal
node scraper.js --mode=full --type=film --pages=50 --retry-failed
```

### Output

| File | Isi |
|------|-----|
| `listing-film.json` | 862 film listings (title, url, poster, rating) |
| `listing-series.json` | 71 series listings |
| `_progress.json` | Resume cache (skip already-scraped items) |
| `films.json` | Films with stream URLs + server alternatives |
| `series.json` | Series with stream URLs + server alternatives |

### Skip Logic

- **Default**: Items yang sudah di-scrape (berhasil atau gagal) di-skip otomatis saat resume
- **`--retry-failed`**: Retry items yang gagal sebelumnya
- Progress file (`_progress.json`) menyimpan semua attempts termasuk yang gagal
