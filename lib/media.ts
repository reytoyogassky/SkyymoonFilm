export const tmdbImage = (p: string | null | undefined, size: string) => {
  if (!p) return "";
  if (p.startsWith("http") || p.startsWith("/api/")) return p;
  return `https://image.tmdb.org/t/p/${size}${p}`;
};

export const yearOf = (date?: string) => (date ? date.slice(0, 4) : "");