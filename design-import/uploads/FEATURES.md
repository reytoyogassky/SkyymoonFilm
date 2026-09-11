# SKYMOON - Dokumentasi Fitur & Alur Aplikasi

Platform streaming film & series berbasis Next.js 16 dengan dual-source konten: **IDLIX** (internasional) dan **NgeFilm** (Indonesia). Menggunakan HLS.js untuk pemutaran video, Puppeteer untuk scraping, dan Supabase untuk sinkronisasi data opsional.

---

## Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS 4, Motion (Framer Motion) |
| Video Player | HLS.js (adaptive bitrate streaming) |
| Scraping | `curl` via child_process (IDLIX), Puppeteer (NgeFilm) |
| HLS Proxy | Node.js native `http`/`https` |
| Database | Supabase (opsional, untuk sync watchlist/history/progress) |
| State | localStorage + React hooks (`useSyncExternalStore`) |
| Icons | Lucide React |

---

## Halaman & Fitur

### 1. Homepage (`/`)

- **Hero Slider** - 5 slide auto-rotate menampilkan film unggulan
- **Popular Movies** - Carousel horizontal film populer
- **Popular Series** - Carousel horizontal series populer
- **Latest Releases** - Rilis terbaru
- **Konten Indonesia** - Film & series dari NgeFilm
- **Genre Grid** - Navigasi cepat berdasarkan genre
- **Stats Panel** - Statistik katalog (total film, series, genre, negara)

Data diambil dari `/api/catalog/browse` dan `/api/ngefilm/browse`.

### 2. Jelajahi / Explore (`/jelajahi`)

- **Search Bar** - Pencarian full-text lintas IDLIX & NgeFilm
- **Filter Tabs** - Tipe (Semua/Film/Series), Sort (Populer/Terbaru), Source (Semua/IDLIX/NgeFilm)
- **Dropdown Filter** - Genre dan Negara
- **Grid 60 item** per halaman dengan "Load More" pagination
- **Mobile Search Overlay** - Overlay pencarian khusus mobile dengan state independen

### 3. Detail Film/Series (`/movie/[slug]`)

- **Info Lengkap** - Poster, backdrop, judul, rating, genre, plot, durasi, tahun
- **Cast & Crew** - Daftar pemain dengan foto profil (dari TMDB)
- **Episode List** - Tab season/episode untuk series
- **Tombol Tonton** - Membuka Player modal
- **Watchlist Toggle** - Simpan/hapus dari daftar saya
- **History** - Otomatis tercatat saat ditonton (maks 8 terakhir)
- **TMDB Enrichment** - Data tambahan: budget, revenue, judul serupa

### 4. Video Player (Modal di halaman detail)

- **HLS Adaptive Streaming** - Auto quality berdasarkan bandwidth
- **Quality Selector** - Pilih manual (1080p, 720p, 480p, dll) atau Auto
- **Subtitle Picker** - Prioritas subtitle Indonesia
- **Subtitle Font Size** - Ukuran teks subtitle bisa diatur
- **Kontrol Standar** - Play/pause, skip ±10 detik, seek bar, volume, mute
- **Server Selector** - Pilih server IDLIX atau NgeFilm
- **Fullscreen** - Native + iOS webkit support
- **Resume Playback** - Prompt "Lanjutkan dari 45:22?" saat membuka ulang
- **Auto-play Next** - Otomatis episode selanjutnya (bisa dimatikan)
- **Progress Tracking** - Simpan posisi setiap 5 detik
- **Auto-fallback** - IDLIX gagal 3x berturut (502) → otomatis coba NgeFilm

### 5. Daftar Saya / Watchlist (`/daftar-saya`)

- Grid 6 kolom menampilkan semua film/series yang disimpan
- Data dari `useWatchlist()` hook (localStorage)
- Sinkronisasi ke Supabase (opsional)

### 6. Autentikasi (`/masuk` & `/daftar`)

- **Login** - Email/username + password
- **Register** - Username, email, password, konfirmasi password
- Sistem akun sederhana berbasis localStorage (bukan auth provider)
- Avatar otomatis dari DiceBear API

### 7. Akun / Settings (`/akun`)

- **Profil** - Avatar, nama, email
- **Pengaturan Playback** - Autoplay, mode hemat data, notifikasi
- **Info Perangkat** - Detail browser/OS
- **Reset Data** - Hapus semua data lokal
- **Sign Out**

---

## Sumber Data (Dual-Source)

### IDLIX (Konten Internasional)

- Katalog 12.000+ item di-scrape secara offline → `public/idlix-data/catalog.json`
- Browse & search dilakukan server-side dari file JSON yang di-cache 5 menit
- Detail film diambil dari IDLIX API lalu di-enrich dengan TMDB
- Streaming melalui **gate-token flow** (lihat alur di bawah)

### NgeFilm (Konten Indonesia)

- Scraping HTML real-time (regex-based parsing)
- Browse: scrape halaman `/country/indonesia/page/{n}/`
- Search: scrape halaman pencarian NgeFilm
- Streaming melalui **Puppeteer** (headless browser, lihat alur di bawah)

---

## Alur Data (Data Flow)

### A. Scraping Katalog (Offline/Manual)

```
scripts/scrape-idlix.js
  │
  ├─ Iterasi IDLIX Browse API (page 1..N, limit 100)
  ├─ Deduplikasi berdasarkan slug
  └─ Output → public/idlix-data/catalog.json (~12.000 item)

scripts/enrich-catalog.js (opsional)
  │
  ├─ Untuk setiap item yang belum punya genre
  ├─ Fetch IDLIX detail API → genres, cast, overview, director
  ├─ Simpan progres setiap 500 item (crash-safe)
  └─ Update catalog.json
```

### B. Browse & Search (Runtime)

```
User buka /jelajahi
  │
  ▼
Client: fetch(/api/catalog/browse?sort=popular&page=1&type=all&source=all)
  │
  ▼
Server: catalogBrowse()
  ├─ loadCatalog() → baca catalog.json (cache 5 menit)
  ├─ Filter berdasarkan genre, negara, tipe media
  ├─ Fetch NgeFilm (jika applicable) → ngefilmBrowse() scrape HTML
  ├─ Merge + deduplikasi (IDLIX prioritas)
  └─ Return paginated MovieListItem[] dengan field `source`
  │
  ▼
Client: Tampilkan grid MovieCard (campuran IDLIX + NgeFilm)
```

### C. Lihat Detail Film

```
User klik MovieCard → /movie/{slug}
  │
  ▼
Client: fetch(/api/catalog/{slug})
  │
  ▼
Server: catalogDetail(slug)
  ├─ 1. Coba IDLIX: lookup di catalog.json → getIdlixDetailInfo()
  ├─ 2. Gagal? Coba NgeFilm: scrape HTML (URL /{slug}/ dan /tv/{slug}/)
  ├─ 3. Enrich dengan TMDB (async, non-blocking)
  └─ Return DetailPayload {movie, cast, genres, videos, tmdb, _episodes}
  │
  ▼
Client: Tampilkan halaman detail (poster, cast, plot, episode tabs, dll)
```

### D. Streaming - Alur IDLIX

```
User klik "Tonton Sekarang"
  │
  ▼
Server: IDLIX Gate-Token Flow
  │
  ├─ 1. Lookup slug → dapat UUID
  ├─ 2. curl GET /api/watch/play-info/movie/{uuid}
  │     → Response: {kind: "gate", gateToken, unlockAt}
  ├─ 3. Tunggu sampai unlockAt expired
  ├─ 4. curl POST /api/watch/session/claim {gateToken}
  │     → Retry hingga 4x jika status "pending"
  ├─ 5. curl POST {redeemUrl} (Mobile UA, cross-site headers)
  │     → Response: {code: "ok", url: "...m3u8", subtitles: [...]}
  └─ Return streamUrl + subtitle list
  │
  ▼
Client (Player.tsx):
  ├─ Inisialisasi HLS.js
  ├─ Load manifest via /api/proxy?url={encoded_m3u8_url}
  │   (proxy rewrite semua URL dalam M3U8 → /api/proxy lagi)
  ├─ Render video dengan quality selector, subtitle, fullscreen
  ├─ Simpan progress setiap 5 detik
  └─ Resume saat reload
```

### E. Streaming - Alur NgeFilm (Fallback)

```
IDLIX gagal 3x berturut (error 502)
  │
  ▼
Client: fetch(/api/ngefilm/stream-sse?url={ngefilmPageUrl})
  │
  ▼
Server: Puppeteer Stream Extraction (SSE real-time)
  │
  ├─ 1. Launch headless browser
  ├─ 2. Navigate ke halaman detail NgeFilm (timeout 15s)
  ├─ 3. Cari link server (.muvipro-player-tabs a)
  ├─ 4. Urutkan: Server 5 → 4 → 3 (skip 1 & 2, tidak reliabel)
  ├─ 5. Untuk setiap server:
  │     ├─ Navigate ke halaman server
  │     ├─ Block iklan via request interception
  │     ├─ Cari iframe (maks 2-3 per server)
  │     ├─ Navigate ke iframe, klik tombol play
  │     ├─ Intercept request .m3u8 → capture URL
  │     └─ Timeout 15 detik per server
  └─ 6. Return {streamUrl, qualities, servers[]}
  │
  ▼
Client: SSE events real-time
  ├─ "[Server 5] Mencoba..."
  ├─ "[Server 5] Stream ditemukan! 1080p, 720p"
  └─ Load stream baru di HLS.js → lanjut playback
```

### F. HLS Proxy

```
Browser tidak bisa langsung fetch CDN (CORS blocked)
  │
  ▼
Semua request video melewati /api/proxy
  │
  ├─ Input: ?url={target_m3u8_or_segment}&ref={referer}
  ├─ Server: fetch pakai Node.js http/https (bypass CORS)
  ├─ Jika M3U8 manifest:
  │   └─ Rewrite semua URL di dalam manifest → /api/proxy?url=...
  ├─ Jika segment (.ts):
  │   └─ Stream langsung ke client (cache 600s)
  └─ Handle redirect 301/302 otomatis
```

### G. Sinkronisasi Data

```
Client (localStorage) ──── POST /api/sync ────► Supabase
                                                   │
  ├─ watchlist    ◄──── GET /api/sync ──────────────┤
  ├─ history      (maks 8 terakhir)                 │
  └─ progress     (posisi playback per slug)        │
                                                   │
Offline-first: app tetap berjalan tanpa Supabase ──┘
```

---

## API Routes

| Route | Method | Parameter | Response | Cache |
|-------|--------|-----------|----------|-------|
| `/api/catalog/browse` | GET | sort, page, limit, genre, country, type, source | `{data, pagination, sources}` | 2 menit |
| `/api/catalog/search` | GET | q, page, type, source | `{data, pagination}` | - |
| `/api/catalog/[slug]` | GET | slug (path) | `{movie, cast, videos, tmdb, _episodes}` | 5 menit |
| `/api/catalog/stats` | GET | - | `{catalogTotal, genres, countries}` | 10 menit |
| `/api/proxy` | GET | url, ref | manifest (rewritten) atau segment binary | 600s (segment) |
| `/api/ngefilm/browse` | GET | page, type | `{data}` | - |
| `/api/ngefilm/stream-sse` | GET | url | SSE stream events | - (maks 90s) |
| `/api/ngefilm/stream` | GET | url | `{streamUrl, servers}` | - |
| `/api/sync` | GET/POST | table, user, item | `{rows}` atau `{ok}` | - |

---

## Hooks (Client State)

| Hook | Storage Key | Fungsi |
|------|-------------|--------|
| `useAuth()` | `skymoon:v2:accounts`, `skymoon:v2:session` | Login, register, signOut, updateProfile |
| `useSettings()` | `skymoon:v2:settings:{username}` | Autoplay, hemat data, notifikasi |
| `useWatchlist()` | `skymoon:v2:watchlist` | has(), toggle() + sync Supabase |
| `useHistory()` | `skymoon:v2:history` | record() maks 8 item + sync Supabase |
| `useProgress()` | `skymoon:v2:progress` | save(slug, {time, duration}) + sync Supabase |

---

## Komponen Utama

| Komponen | Fungsi |
|----------|--------|
| `AppShell` | Layout wrapper (Navbar + Footer), search bar, user menu |
| `Player` | Video player HLS.js dengan semua kontrol, fallback logic, progress tracking |
| `MovieDetail` | Halaman detail film/series lengkap dengan tab episode & TMDB enrichment |
| `MovieCard` | Kartu poster dengan badge rating, genre, tipe (Film/Series) |
| `DragCarousel` | Carousel horizontal drag-scroll untuk homepage |
| `AuthForm` | Form login/register dengan validasi |
| `UserMenu` | Dropdown menu user (avatar, nama, navigasi) |
| `PageLoader` | Skeleton loading animation |

---

## Supabase Schema (Opsional)

| Tabel | Primary Key | Kolom Utama |
|-------|-------------|-------------|
| `profiles` | username | name, avatar |
| `watchlist` | user_id + slug | title, posterPath, dll |
| `history` | user_id + slug | title, posterPath (maks 8/user) |
| `progress` | user_id + slug | time, duration, updated_at |

Tidak menggunakan RLS atau Supabase Auth - sistem akun sederhana berbasis username.

---

## Caching Strategy

| Data | TTL | Metode |
|------|-----|--------|
| Catalog JSON (loadCatalog) | 5 menit | In-memory server-side |
| Browse API response | 2 menit | HTTP Cache-Control |
| Detail API response | 5 menit | HTTP Cache-Control |
| Stats | 10 menit | In-memory server-side |
| Proxy segment | 600 detik | HTTP Cache-Control |
| Proxy manifest | 0 | Selalu fresh |

---

## Error Handling & Fallback

1. **IDLIX 502** → Otomatis fallback ke NgeFilm setelah 3x gagal berturut
2. **NgeFilm semua server gagal** → Tampilkan error, tidak ada playback
3. **Supabase tidak tersedia** → App tetap berjalan penuh (offline-first dengan localStorage)
4. **TMDB enrichment gagal** → Detail tetap ditampilkan tanpa data tambahan (non-blocking)
5. **Puppeteer timeout** → Skip ke server berikutnya (maks 15s per server, 90s total)
