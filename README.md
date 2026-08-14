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

- `app/` — halaman & API routes (proxy stream, katalog, pencarian)
- `components/` — komponen UI (AppShell, MovieCard, Player, dll)
- `lib/` — scraper IDLIX & NgeFilm, tipe data
- `public/assets/` — logo SKYMOON
- `supabase/schema.sql` — skema database (jalankan di SQL Editor Supabase)