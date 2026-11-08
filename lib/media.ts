export const idlixImage = (p: string | null | undefined, size: string = "w342"): string => {
  if (!p) return "";
  if (p.startsWith("http") || p.startsWith("/api/")) return p;
  if (p.startsWith("/")) {
    return `https://image.tmdb.org/t/p/${size}${p}`;
  }
  return p;
};

export const yearOf = (date?: string) => (date ? date.slice(0, 4) : "");

/**
 * Returns the episode code, e.g. "E01S01".
 */
export const episodeCode = (number?: number, season?: number): string => {
  if (!number || number <= 0) return "";
  const s = season && season > 0 ? season : 1;
  return `E${String(number).padStart(2, "0")}S${String(s).padStart(2, "0")}`;
};

/**
 * Formats an episode label as "E01S01 - Nama Episode".
 * Falls back to the name (or code) when part of the data is missing.
 */
export const episodeLabel = (name?: string, number?: number, season?: number): string => {
  const code = episodeCode(number, season);
  if (!name) return code;
  return code ? `${code} - ${name}` : name;
};
