# SKYMOON Streaming - Arsitektur & Alur Data

## Ringkasan

Aplikasi streaming film berbasis **Next.js 16** yang mengambil data dari IDLIX API, menyimpan katalog secara lokal sebagai JSON statis, dan memproses streaming video melalui gate-token flow dengan cookie persistence. Semua proses berjalan di **Node.js** (tanpa Python).

---

## Stack Teknologi

| Layer | Teknologi |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS, Motion (animasi) |
| Video Player | HLS.js (adaptive bitrate streaming) |
| Auth | Supabase (email/password) |
| Data Source | IDLIX API (`z2.idlixku.com`) |
| HTTP Client | `curl` via `child_process` (bypass Cloudflare) |
| State | Client-side `localStorage` (progress, watchlist) |

---

## Struktur Direktori

```
app/
  page.tsx                     # Homepage (trending, populer)
  jelajahi/page.tsx            # Halaman jelajah/explore + filter
  movie/[slug]/page.tsx        # Detail film/series
  daftar-saya/page.tsx         # Watchlist user (localStorage)
  masuk/ & daftar/             # Auth pages
  akun/                        # Profil user
  api/
    movies/route.ts            # Browse API (paginated + filter)
    movies/[slug]/route.ts     # Detail satu film
    search/route.ts            # Pencarian judul
    stream/[slug]/route.ts     # Ambil stream URL (gate flow)
    prefetch/[slug]/route.ts   # Trigger prefetch stream di background
    tv-episodes/[slug]/route.ts # Daftar episode series
    proxy/route.ts             # Image proxy (poster/backdrop)
    subtitle/route.ts          # Subtitle proxy (VTT)
    stats/route.ts             # Statistik katalog
    sync/route.ts              # Sync progress ke Supabase

components/
  Player.tsx          # Video player (HLS, subtitle, quality selector)
  MovieDetail.tsx     # Halaman detail film (info, cast, seasons)
  MovieCard.tsx       # Kartu film (poster + judul)
  DragCarousel.tsx    # Carousel horizontal (drag-scroll)
  AppShell.tsx        # Layout wrapper (navbar, footer)
  AuthForm.tsx        # Form login/daftar
  UserMenu.tsx        # Dropdown menu user
  PageLoader.tsx      # Loading skeleton

lib/
  idlix.ts            # Core: semua interaksi IDLIX (browse, detail, stream)
  media.ts            # Helper media (format durasi, dsb)
  types.ts            # TypeScript types
  client-store.ts     # localStorage wrapper (progress, watchlist)
  supabase/           # Supabase client & admin

scripts/
  scrape-idlix.js     # Scrape katalog dari IDLIX browse API
  enrich-catalog.js   # Enrich katalog dengan genre/cast dari detail API
  scrape-streams.js   # Test/debug streaming

public/idlix-data/
  catalog.json        # Katalog lengkap (~12.000 film/series)
```

---

## Alur Data: Dari Scrape Sampai Diputar

### 1. Scraping Katalog (`scripts/scrape-idlix.js`)

```
IDLIX Browse API ──curl──> scrape-idlix.js ──> catalog.json
```

- Endpoint: `GET /api/browse?page={n}&limit=50&sort={popular|latest}`
- Iterasi semua halaman (247+ halaman) untuk sort `popular` dan `latest`
- Deduplikasi berdasarkan `slug`
- Output: `public/idlix-data/catalog.json` (~12.000 item)
- Setiap item berisi: `id`, `slug`, `title`, `posterPath`, `backdropPath`, `releaseDate`, `voteAverage`, `country`, `runtime`, `contentType`, `isSeries`
- **Catatan**: Browse API TIDAK mengembalikan `genres` — perlu enrichment terpisah

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

### 3. Browse & Filter (`lib/idlix.ts` > `idlixBrowseList`)

```
User buka /jelajahi ──> API /api/movies?sort=popular&genre=action&country=US&type=movie
  ──> idlixBrowseList() ──> loadCatalog() ──> baca catalog.json
  ──> filter server-side (genre, country, mediaType)
  ──> sort (popular = default order, latest = by releaseDate)
  ──> paginate (limit per page)
  ──> return { items, total, totalPages }
```

- Katalog di-reload setiap 5 menit dari disk (agar update enrichment ter-pick up)
- Filter genre: cocokkan `name` atau `slug` (case-insensitive)
- Filter country: cocokkan ISO code exact (US, KR, JP, dll)
- Filter mediaType: `movie` = `!isSeries`, `tv` = `isSeries`
- Cache per kombinasi filter selama 5 menit

### 4. Detail Film (`lib/idlix.ts` > `idlixDetail`)

```
User buka /movie/{slug}
  ──> cek katalog lokal (catalog.json) ──> ada? return langsung
  ──> tidak ada? curl ke IDLIX Detail API ──> return + cache 30 menit
```

- Prioritas: katalog lokal > API (menghindari Cloudflare block)
- Data: info lengkap + genres + cast + seasons (untuk series)
- Untuk series: ambil daftar season & episode dari `/api/series/{slug}/season/{n}`

### 5. Streaming: Gate Token Flow (`lib/idlix.ts` > `getGateAndRedeem`)

Ini adalah alur paling krusial — mengambil URL streaming yang bisa diputar.

```
┌─────────────────────────────────────────────────────────┐
│  STREAMING FLOW (semua request pakai cookie jar sama)   │
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

- **Cookie Jar**: Semua 4 request (play-info, claim, retry claim, redeem) HARUS berbagi cookie yang sama. Implementasi: `curl -c {jarFile} -b {jarFile}` dengan temp file di OS temp dir
- **Mobile UA pada Redeem**: Step 5 menggunakan User-Agent mobile + header `sec-ch-ua-mobile: ?1` dan `sec-fetch-site: cross-site`
- **Gate Wait**: Server menentukan kapan gate bisa di-unlock via `unlockAt` timestamp. Biasanya 5-10 detik
- **Claim Retry**: Claim bisa return `pending` beberapa kali. Retry max 4x dengan delay `remainingMs + 200ms`
- **Redeem URL**: URL eksternal (bukan IDLIX domain), mengembalikan HLS manifest URL

**Untuk TV Series:**
- Path play-info: `/api/watch/play-info/episode/{episodeId}`
- Jika `episodeId` tidak diberikan, ambil episode pertama dari katalog lokal (season pertama, episode pertama)
- Dicoba 3 path prefix: `episode/`, `tv-episode/`, `series-episode/`

### 6. Prefetch & Caching

```
User buka detail film ──> frontend hit /api/prefetch/{slug}
  ──> startMovieScrape() fire-and-forget di background
  ──> stream URL di-cache di memory (Map)

User klik "Putar" ──> frontend hit /api/stream/{slug}
  ──> cek cache ──> ada & belum expired? return langsung
  ──> belum ada? jalankan gate flow, cache hasilnya
```

- Stream URL cache: in-memory Map, expire sesuai `expiresAt` dari server (biasanya 2 jam)
- Prefetch dipicu saat user membuka halaman detail (sebelum klik play)
- In-flight dedup: jika stream sedang diambil, request lain menunggu Promise yang sama

### 7. Video Playback (`components/Player.tsx`)

```
streamUrl (HLS manifest) ──> HLS.js ──> <video> element
                                ├── adaptive bitrate (auto/manual quality)
                                ├── subtitle tracks (VTT via /api/subtitle proxy)
                                └── session renewal (auto-renew sebelum expire)
```

- **Subtitle default**: Indonesian (`lang: "id"`) diprioritaskan
- **Quality**: Auto (ABR) atau manual (360p-4K)
- **Progress**: Disimpan ke localStorage setiap 5 detik
- **Session renewal**: 20 menit sebelum expire, otomatis fetch stream URL baru
- **Fullscreen**: Support native fullscreen + iOS `webkitEnterFullscreen`

### 8. Pencarian (`/api/search`)

```
User ketik query ──> /api/search?q={query}
  ──> cari di katalog lokal (fuzzy match pada title)
  ──> return hasil yang cocok
```

### 9. Image & Subtitle Proxy

```
/api/proxy?url={imageUrl}    ──> fetch & relay gambar (bypass CORS)
/api/subtitle?url={vttUrl}   ──> fetch & relay file VTT subtitle
```

- Diperlukan karena browser memblokir cross-origin request ke CDN IDLIX

---

## Mengapa Pakai `curl` Bukan `fetch`?

IDLIX dilindungi Cloudflare. Request langsung dari Node.js `https`/`fetch` mendapat challenge 403/429 (halaman "Just a moment..."). `curl` secara bawaan tidak mengeksekusi JavaScript challenge, tapi untuk API endpoint yang tidak di-challenge (play-info, claim, redeem), `curl` bisa lewat karena:

1. Header yang tepat (User-Agent, Referer, Accept)
2. Cookie persistence antar request (cookie jar)
3. Tidak ada fingerprinting TLS yang ketat pada endpoint API internal

Browse API kadang di-challenge juga — maka katalog discrape sekali lalu disimpan lokal sebagai `catalog.json`.

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
```
