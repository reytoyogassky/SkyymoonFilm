import type { MetadataRoute } from "next";

const BASE_URL = "https://skyymovie.up.railway.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/jelajahi`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/daftar-saya`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/masuk`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${BASE_URL}/daftar`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
  ];

  return staticPages;
}
