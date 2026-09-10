export const idlixImage = (p: string | null | undefined, size: string = "w342"): string => {
  if (!p) return "";
  if (p.startsWith("http") || p.startsWith("/api/")) return p;
  if (p.startsWith("/")) {
    return `https://image.tmdb.org/t/p/${size}${p}`;
  }
  return p;
};

export const yearOf = (date?: string) => (date ? date.slice(0, 4) : "");
