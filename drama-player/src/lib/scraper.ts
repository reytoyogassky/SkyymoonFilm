const NARTO = "https://narto-drama.com";

export interface Drama {
  sourceId: string;
  sourceDramaId: string;
  title: string;
  poster: string;
  description: string;
  genres: string[];
  tags: string[];
  languageCode: string;
  score: number;
  isIndonesian: boolean;
  isDubbed: boolean;
  isIndonesianDubbed: boolean;
  provider: string;
}

export interface Episode {
  episodeNumber: number;
  title: string;
  isVip: boolean;
  sourceEpisodeId: string;
  streamUrl: string | null;
  qualities: { url: string; resolution: string; codec: string; format: string }[];
  subtitles: { url: string; language: string }[];
}

export interface DramaDetail extends Drama {
  episodes: Episode[];
  totalEpisodes: number;
  freeCount: number;
}

const H: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
};

const H_JSON: Record<string, string> = {
  "User-Agent": H["User-Agent"],
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
  "Accept-Language": H["Accept-Language"],
};

async function fetchText(url: string, headers?: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: headers || H,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: headers || H_JSON,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function extractSlug(url: string): string {
  const match = url.match(/\/detail\/watch\/([^/?]+)/);
  return match ? match[1] : "";
}

function hasNonLatin(text: string): boolean {
  return /[\u0600-\u06FF\u4e00-\u9fff\uac00-\ud7af\u3040-\u30ff\u0e00-\u0e7f]/.test(text);
}

function detectIndonesian(item: any): boolean {
  const title = (item.title || "").toLowerCase();
  const tags = (item.tags || []).join(" ");
  const desc = (item.description || "").substring(0, 300);
  if (title.includes("(doblado)") || title.includes("(dublado)")) return false;
  if (title.includes("(sulih") || title.includes("(dub")) return true;
  const allText = `${tags} ${desc}`;
  if (hasNonLatin(allText)) return false;
  const idWords = ["suami", "istri", "keluarga", "cinta", "rahasia", "dendam", "pembalasan", "pernikahan", "anak", "ayah", "ibu", "kakak", "adik", "nikah", "perceraian"];
  if (idWords.some((w) => title.includes(w))) return true;
  return item.language_code === "id-ID";
}

function extractEpisodeItemsRaw(html: string): any[] | null {
  const marker = "episodeItemsRaw = ";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;

  const start = idx + marker.length;
  let depth = 0;
  let end = start;
  for (let i = start; i < html.length; i++) {
    if (html[i] === "[") depth++;
    if (html[i] === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  try {
    const json = html.substring(start, end);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractMeta(html: string): { title: string; description: string; poster: string; tags: string[] } {
  let title = "";
  let description = "";
  let poster = "";
  const tags: string[] = [];

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    title = titleMatch[1].replace(/\s*[-–|].*$/, "").replace(/\s*Episode\s+\d+.*/, "").trim();
  }

  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (descMatch) description = descMatch[1];

  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (ogImage) poster = ogImage[1];

  if (!poster) {
    const posterMatch = html.match(/poster_url['"]\s*:\s*['"]([^'"]+)/);
    if (posterMatch) poster = posterMatch[1];
  }

  const tagMatches = html.matchAll(/class="tag[^"]*"[^>]*>([^<]+)</g);
  for (const m of tagMatches) {
    const t = m[1].trim();
    if (t && !tags.includes(t)) tags.push(t);
  }

  return { title, description, poster, tags };
}

async function resolveImportUrl(importUrl: string): Promise<string | null> {
  try {
    const res = await fetch(importUrl, {
      headers: { "User-Agent": H["User-Agent"] },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 301 || res.status === 302) {
      const loc = res.headers.get("location") || "";
      const m = loc.match(/\/detail\/watch\/([a-z0-9\-]+)/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

let _homeCache: { dramas: Drama[]; ts: number } | null = null;

const PROVIDER_KEYS = [
  "bibishort","candyjar","cubetv","dotdrama","dramabite","dramabox",
  "dramashorts","dramawave","flareflow","flextv","flickreels","freereels",
  "fundrama","goodshort","happyshort","idrama","joyreels","kalostv",
  "melolo","microdrama","moboreels","mydrama","myrelle","netshort",
  "pinedrama","playlet","rapidtv","reelala","reelbuzz","reelife",
  "reelshort","sarostv","serealplus","shortical","shortmax","stardusttv",
  "starshort","velolo","vigloo","vyntage",
];

function extractProviderFromWatchUrl(watchUrl: string): string {
  const m = watchUrl.match(/provider=([^&]+)/);
  return m ? m[1] : "";
}

function extractSlugFromWatchUrl(watchUrl: string): string {
  const m = watchUrl.match(/book_id=([^&]+)/);
  return m ? `provider:${m[1]}` : "";
}

function itemToDrama(item: any, provider: string): Drama | null {
  const bookId = item.book_id || "";
  if (!bookId) return null;
  const slug = `provider:${bookId}`;
  const title = item.title || "";
  const tl = title.toLowerCase();
  const isDub = tl.includes("sulih") || tl.includes("dub") || tl.includes("doblado") || tl.includes("dublado");
  const allText = `${(item.tag_names || []).join(" ")} ${(item.description || "").substring(0, 300)}`;
  const hasNonLatinChars = /[\u0600-\u06FF\u4e00-\u9fff\uac00-\ud7af\u3040-\u30ff\u0e00-\u0e7f]/.test(allText);
  const idWords = ["suami","istri","keluarga","cinta","rahasia","dendam","pembalasan","pernikahan","anak","ayah","ibu"];
  const hasIdWords = idWords.some((w) => tl.includes(w));
  let isIndo = false;
  if (!tl.includes("(doblado)") && !tl.includes("(dublado)")) {
    if (tl.includes("(sulih") || tl.includes("(dub")) isIndo = true;
    else if (!hasNonLatinChars && hasIdWords) isIndo = true;
  }
  const isIdDub = isDub && (tl.includes("sulih") || tl.includes("dubbing") || (isIndo && isDub));

  const watchUrl = item.watch_url || "";
  const resolvedProvider = provider || extractProviderFromWatchUrl(watchUrl);

  return {
    sourceId: "narto",
    sourceDramaId: slug,
    title,
    poster: item.poster_url ? (item.poster_url.startsWith("http") ? item.poster_url : `${NARTO}${item.poster_url}`) : "",
    description: (item.description || "").substring(0, 200),
    genres: item.tag_names || [],
    tags: item.tag_names || [],
    languageCode: "",
    score: 0,
    isIndonesian: isIndo,
    isDubbed: isDub,
    isIndonesianDubbed: isIdDub,
    provider: resolvedProvider,
  };
}

export async function getProviders(): Promise<{ key: string; label: string }[]> {
  return PROVIDER_KEYS.map((k) => ({ key: k, label: k }));
}

export async function fetchProviderSections(provider: string): Promise<Drama[]> {
  const data = await fetchJson<any>(`${NARTO}/home/providers/sections?provider=${encodeURIComponent(provider)}&lang=id-ID`);
  if (!data?.ok || !data.sections) return [];

  const items: any[] = [];
  for (const section of data.sections) {
    for (const item of section.items || []) {
      if (item.is_adult) continue;
      items.push(item);
    }
  }

  const dramas: Drama[] = [];
  const seen = new Set<string>();

  const resolveBatch = async (batch: any[]) => {
    return Promise.allSettled(batch.map(async (item) => {
      const watchUrl = item.watch_url;
      if (!watchUrl) return null;
      try {
        const res = await fetch(watchUrl, {
          headers: { "User-Agent": H["User-Agent"] },
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 301 || res.status === 302) {
          const loc = res.headers.get("location") || "";
          const m = loc.match(/\/detail\/watch\/([^/?]+)/);
          if (m) return { ...item, _resolvedSlug: m[1] };
        }
      } catch {}
      return null;
    }));
  };

  for (let i = 0; i < items.length; i += 8) {
    const batch = items.slice(i, i + 8);
    const results = await resolveBatch(batch);
    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value?._resolvedSlug) continue;
      const item = r.value;
      const slug = item._resolvedSlug;
      if (seen.has(slug)) continue;
      seen.add(slug);

      const d = itemToDrama(item, provider);
      if (d) {
        d.sourceDramaId = slug;
        dramas.push(d);
      }
    }
  }
  return dramas;
}

export async function discoverDramas(): Promise<Drama[]> {
  if (_homeCache && Date.now() - _homeCache.ts < 60_000) return _homeCache.dramas;

  const dramas: Drama[] = [];
  const seen = new Set<string>();

  function addDrama(d: Drama) {
    if (!d.sourceDramaId || seen.has(d.sourceDramaId)) return;
    seen.add(d.sourceDramaId);
    dramas.push(d);
  }

  const queries = ["a", "rahasia", "cinta", "suami", "istri", "keluarga", "pembalasan", "dendam", "terlarang", "pengantin"];
  const results = await Promise.allSettled(
    queries.map((q) => searchDramas(q, 50))
  );
  for (const r of results) {
    if (r.status === "fulfilled") r.value.forEach(addDrama);
  }

  _homeCache = { dramas, ts: Date.now() };
  return dramas;
}

export async function searchDramas(query: string, limit = 30): Promise<Drama[]> {
  const data = await fetchJson<any>(`${NARTO}/search?q=${encodeURIComponent(query)}&limit=${limit}&lang=id-ID`);
  if (!data?.ok || !data.items) return [];

  return data.items
    .filter((item: any) => !item.is_adult)
    .map((item: any) => {
      const slug = extractSlug(item.url) || String(item.id || "");
      const isIndo = detectIndonesian(item);
      const title = item.title || "";
      const tl = title.toLowerCase();
      const isDub = tl.includes("sulih") || tl.includes("dub") || tl.includes("doblado") || tl.includes("dublado");
      const isIdDub = isDub && (tl.includes("sulih") || tl.includes("dubbing") || (isIndo && isDub));
      return {
        sourceId: "narto",
        sourceDramaId: slug,
        title,
        poster: item.poster_url ? (item.poster_url.startsWith("http") ? item.poster_url : `${NARTO}${item.poster_url}`) : "",
        description: (item.description || "").substring(0, 200),
        genres: item.tags || [],
        tags: item.tags || [],
        languageCode: item.language_code || "",
        score: item._score || 0,
        isIndonesian: isIndo,
        isDubbed: isDub,
        isIndonesianDubbed: isIdDub,
        provider: "",
      };
    });
}

export async function getDramaDetail(sourceDramaId: string): Promise<DramaDetail | null> {
  let slug = sourceDramaId;

  if (slug.startsWith("import:")) {
    const importUrl = slug.substring(7);
    const resolved = await resolveImportUrl(importUrl);
    if (resolved) {
      slug = resolved;
    } else {
      return null;
    }
  }

  const html = await fetchText(`${NARTO}/detail/watch/${slug}/1?lang=id-ID`);
  if (!html) return null;

  const meta = extractMeta(html);
  const episodes = extractEpisodeItemsRaw(html);
  if (!episodes || episodes.length === 0) return null;

  const parsedEpisodes: Episode[] = episodes.map((ep: any) => ({
    episodeNumber: ep.number || ep.route_episode_number,
    title: ep.title || `Episode ${ep.number || ep.route_episode_number}`,
    isVip: false,
    sourceEpisodeId: String(ep.id),
    streamUrl: ep.direct_play_url || null,
    qualities: (ep.multi_resolutions || []).map((q: any) => ({
      url: q.url || "",
      resolution: q.resolution || q.label || "",
      codec: "",
      format: q.format || "mp4",
    })),
    subtitles: (ep.multi_subtitles || []).map((s: any) => ({
      url: s.url || "",
      language: s.language || s.label || "",
    })).filter((s: any) => s.url),
  }));

  return {
    sourceId: "narto",
    sourceDramaId: slug,
    title: meta.title,
    poster: meta.poster,
    description: meta.description,
    genres: meta.tags,
    tags: meta.tags,
    languageCode: "id-ID",
    score: 0,
    isIndonesian: true,
    isDubbed: false,
    isIndonesianDubbed: false,
    provider: "",
    episodes: parsedEpisodes,
    totalEpisodes: episodes.length,
    freeCount: episodes.length,
  };
}

export async function getStreamUrl(streamPath: string): Promise<{ url: string; contentType: string } | null> {
  try {
    const res = await fetch(streamPath, {
      headers: { "User-Agent": H["User-Agent"] },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return {
      url: res.url,
      contentType: res.headers.get("content-type") || "video/mp4",
    };
  } catch {
    return null;
  }
}
