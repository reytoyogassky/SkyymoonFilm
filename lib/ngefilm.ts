import { createDecipheriv } from "node:crypto";

export const NGE_BASE = "https://new39.ngefilm.site";
export const NGE_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";
export const RPM_BASE = "https://playerngefilm21.rpmlive.online";
const RPM_KEY = "6b69656d7469656e6d75613931316361";
const RPM_IV = "313233343536373839306f6975797472";

export interface NgeCard {
  slug: string;
  title: string;
  year: string;
  poster: string | null;
  backdrop?: string | null;
  quality: string;
  isSeries: boolean;
  url: string;
}

export interface NgeEpisode {
  id: string;
  url: string;
  label: string;
  num: number;
}

export interface NgeSeason {
  number: number;
  episodes: NgeEpisode[];
}

export interface NgeDetail {
  slug: string;
  title: string;
  poster: string | null;
  backdrop: string | null;
  rating: string;
  description: string;
  genres: string[];
  year: string;
  runtime: number;
  director: string;
  isSeries: boolean;
  url: string;
  cast: { name: string; character: string; profile: string | null }[];
  seasons: NgeSeason[];
}

export interface NgeStream {
  master: string;
  kind: "hls";
  levels: { height?: number; width?: number; bandwidth?: number }[];
}

export function ngeSlugOf(url: string): string {
  return "nge-" + Buffer.from(url, "utf8").toString("base64url");
}

export function ngeUrlOf(slug: string): string {
  return Buffer.from(slug.replace(/^nge-/, ""), "base64url").toString("utf8");
}

const cache = new Map<string, { at: number; data: unknown }>();

function cacheGet<T>(key: string, ttlMs: number): T | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  return null;
}

function cacheSet<T>(key: string, data: T) {
  if (cache.size > 600) cache.clear();
  cache.set(key, { at: Date.now(), data });
}

function cached<T>(key: string, ttlMs: number, producer: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key, ttlMs);
  if (hit !== null) return Promise.resolve(hit);
  return producer().then((data) => {
    cacheSet(key, data);
    return data;
  });
}

function htmlDecode(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function stripTags(s: string): string {
  return htmlDecode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function stripScripts(html: string): string {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
}

export function ngeImgClean(src: string | null): string | null {
  if (!src) return null;
  src = src.replace("-152x228", "").replace("-170x255", "").replace("-60x90", "");
  src = src.replace(/-(?:\d+)x(?:\d+)/g, "");
  if (!/^https?:/i.test(src)) src = NGE_BASE + src;
  return src;
}

async function ngeFetch(url: string, referer: string = NGE_BASE + "/", timeoutMs = 30000): Promise<Response | null> {
  const attempt = (): Promise<Response> =>
    fetch(url, {
      headers: { "User-Agent": NGE_UA, Referer: referer },
      signal: AbortSignal.timeout(timeoutMs),
    });
  try {
    let res = await attempt();
    if (!res.ok) res = await attempt();
    return res;
  } catch {
    return null;
  }
}

function parseCards(html: string): NgeCard[] {
  const arts = html.match(/<article[^>]*class="[^"]*item-infinite[^"]*"[^>]*>[\s\S]*?<\/article>/g) ?? [];
  const out: NgeCard[] = [];
  for (const a of arts) {
    const m = a.match(/<h2 class="entry-title"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!m) continue;
    const href = m[1];
    const title = stripTags(m[2]) || "Unknown";
    const img = a.match(/<img[^>]*src="([^"]+)"/);
    const poster = ngeImgClean(img?.[1] ?? null);
    const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : "";
    let quality = "";
    const q = a.match(/gmr-quality-item[^>]*>\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/);
    if (q) quality = q[1].trim();
    const isSeries = /\/tv\//.test(href) || /\/series\//.test(href);
    out.push({
      slug: ngeSlugOf(href),
      title,
      year,
      poster,
      quality,
      isSeries,
      url: href,
    });
  }
  return out;
}

export interface NgeBrowseOptions {
  page?: number;
  orderby?: string;
}

export async function browseCountry(
  country: string,
  opts: NgeBrowseOptions & { ctype: "movie" | "tv" | "all" }
): Promise<NgeCard[]> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const orderby = opts.orderby ?? "date";
  const pt = opts.ctype === "movie" ? "movie" : opts.ctype === "tv" ? "tv" : "";
  const qs = `s=&search=advanced&post_type=${pt}&index=&orderby=${orderby}&genre=&movieyear=&country=${country}&quality=&paged=${page}`;
  const url = `${NGE_BASE}/?${qs}`;
  return cached(`nge_country|${qs}`, 90_000, async () => {
    const res = await ngeFetch(url);
    if (!res || res.status !== 200) return [];
    return parseCards(await res.text());
  });
}

export async function browseIndo(
  opts: NgeBrowseOptions & { ctype: "movie" | "tv" }
): Promise<NgeCard[]> {
  return browseCountry("indonesia", opts);
}

export async function ngeDetail(url: string): Promise<NgeDetail | null> {
  if (!/^https?:/i.test(url)) url = NGE_BASE + url;
  return cached(`nge_detail|${url}`, 300_000, async () => {
    const res = await ngeFetch(url);
    if (!res || res.status !== 200) return null;
    const t = await res.text();
    const body = stripScripts(t);

    const h1 = t.match(/<h1[^>]*entry-title[^>]*>([\s\S]*?)<\/h1>/);
    const title = stripTags(h1?.[1] ?? "") || url.replace(/\/+$/, "").split("/").pop() || "";

    let poster: string | null = null;
    const og =
      t.match(/property="og:image"\s+content="([^"]+)"/) ?? t.match(/content="([^"]+)"\s+property="og:image"/);
    if (og) poster = og[1];
    if (!poster) {
      const imgs = t.match(/<meta\s+property="og:image"\s+content="([^"]+)"/g) ?? [];
      poster = imgs[0] ? /content="([^"]+)"/.exec(imgs[0])?.[1] ?? null : null;
    }

    let desc = "";
    const d =
      t.match(/<div class="entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/) ??
      t.match(/<meta name="description"\s+content="([^"]+)"/);
    if (d) desc = stripTags(d[1]).replace(/\s+/g, " ");

    let year = "";
    const y = body.match(/href="[^"]*year\/[^"]*"[^>]*>(\d{4})/i);
    if (!y) {
      const ym = body.match(/href="[^"]*year\/\d{4}\/"[^>]*>\s*(\d{4})\s*<\/a>/i);
      year = ym ? ym[1] : "";
    } else {
      year = y[1];
    }

    let genres = [...body.matchAll(/href="[^"]*genre\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/gi)]
      .map((m) => htmlDecode(m[1]).trim())
      .filter(Boolean);
    if (!genres.length) {
      genres = [...t.matchAll(/href="[^"]*genre\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/gi)]
        .map((m) => htmlDecode(m[1]).trim())
        .filter(Boolean);
    }
    genres = [...new Set(genres)].slice(0, 6);

    const cast: { name: string; character: string; profile: string | null }[] = [];
    const cb = t.match(/<strong>Pemain:<\/strong>([\s\S]*?)<\/div>/);
    if (cb) {
      for (const m of cb[1].matchAll(/itemprop="name"[^>]*><a[^>]*>([^<]+)<\/a>/g)) {
        const name = m[1].trim();
        if (name && cast.length < 24) cast.push({ name, character: "", profile: null });
      }
    }

    let director = "";
    const db = t.match(/<strong>Sutradara:<\/strong>([\s\S]*?)<\/div>/);
    if (db) {
      const dm = db[1].match(/itemprop="name"[^>]*><a[^>]*>([^<]+)<\/a>/);
      if (dm) director = dm[1].trim();
    }

    const raw = [...t.matchAll(/<a[^>]*href="([^"]*\/eps\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
    const eps: NgeEpisode[] = [];
    const seen = new Set<string>();
    for (const [, href, label] of raw) {
      if (seen.has(href)) continue;
      seen.add(href);
      const labelClean = stripTags(label);
      const num = labelClean.match(/(?:Eps|Episode|EP|E)\s*(\d+)/i) ?? labelClean.match(/(\d+)/);
      eps.push({
        id: href,
        url: href,
        label: labelClean,
        num: num ? parseInt(num[1], 10) : eps.length + 1,
      });
    }
    const isSeries = eps.length > 0;

    return {
      slug: ngeSlugOf(url),
      title,
      poster,
      backdrop: poster,
      rating: "",
      description: desc,
      genres,
      year,
      runtime: 0,
      director,
      isSeries,
      url,
      cast,
      seasons: isSeries ? [{ number: 1, episodes: eps }] : [],
    };
  });
}

function aesCbcDecrypt(hex: string): string | null {
  try {
    const raw = Buffer.from(hex.replace(/[^0-9a-fA-F]/g, ""), "hex");
    const decipher = createDecipheriv("aes-128-cbc", Buffer.from(RPM_KEY, "hex"), Buffer.from(RPM_IV, "hex"));
    let dec = Buffer.concat([decipher.update(raw), decipher.final()]);
    const pad = dec[dec.length - 1];
    if (pad >= 1 && pad <= 16) dec = dec.subarray(0, dec.length - pad);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

async function extractRpm(url: string): Promise<string | null> {
  const res = await ngeFetch(url);
  if (!res || res.status !== 200) return null;
  const t = await res.text();
  const m = t.match(/rpmlive\.online[\s\S]*?[#&?]id=([a-zA-Z0-9]+)/) ?? t.match(/rpmlive\.online[\s\S]*?#([a-zA-Z0-9]+)/);
  if (!m) return null;
  const vid = m[1];
  const domain = NGE_BASE.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const api = `${RPM_BASE}/api/v1/video?id=${vid}&w=1920&h=1080&r=${domain}`;
  const r2 = await fetch(api, {
    headers: {
      Host: "playerngefilm21.rpmlive.online",
      "User-Agent": NGE_UA,
      Referer: `${RPM_BASE}/`,
      Origin: `${RPM_BASE}/`,
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (r2.status !== 200) return null;
  const bodytxt = (await r2.text()).trim();
  const js = bodytxt.startsWith("{") ? bodytxt : aesCbcDecrypt(bodytxt);
  if (!js) return null;
  const cf = js.match(/"cfNative"\s*:\s*"([^"]+)"/);
  const src = js.match(/"source"\s*:\s*"([^"]+)"/);
  let link: string | null = null;
  if (cf) link = cf[1];
  if (!link && src) link = src[1];
  if (!link) return null;
  return link.replace(/\\\//g, "/");
}

function findPlayerIframe(t: string): string | null {
  for (const raw of t.match(/<iframe[^>]*src="([^"]+)"[^>]*>/g) ?? []) {
    const src = raw.match(/src="([^"]+)"/)?.[1];
    if (!src || /googletagmanager|youtube-nocookie|doubleclick/i.test(src)) continue;
    return src;
  }
  return null;
}

async function extractBestx(url: string): Promise<string | null> {
  const res = await ngeFetch(url);
  if (!res || res.status !== 200) return null;
  const t = await res.text();
  const iframe = findPlayerIframe(t);
  if (!iframe || !/bestx\.stream/i.test(iframe)) return null;
  const id = iframe.match(/bestx\.stream\/v\/([\w-]+)/)?.[1];
  if (!id) return null;
  try {
    const r = await fetch(iframe, {
      headers: { "User-Agent": NGE_UA, Referer: url },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    const b64 = html.match(/JSON\.parse\(atob\("([^"]+)"\)\)/)?.[1];
    if (!b64) return null;
    let params: Record<string, unknown>;
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      params = (JSON.parse(decoded).parameters ?? {}) as Record<string, unknown>;
    } catch {
      return null;
    }
    params = {
      ...params,
      adBlockingDetected: false,
      timezoneBrowser: "Asia/Jakarta",
      webdriver: false,
      gpu: null,
    };
    const router = html.match(/router\.parklogic\.com(\/v\/[\w-]+\/)/)?.[1];
    if (!router) return null;
    const r2 = await fetch(`https://router.parklogic.com${router}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "User-Agent": NGE_UA, Referer: iframe, Origin: "https://bestx.stream" },
      body: JSON.stringify({ parameters: params }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r2.ok) return null;
    const text = (await r2.text()).trim();
    if (text.startsWith("http")) {
      const rr = await fetch(text, { headers: { "User-Agent": NGE_UA, Referer: iframe }, signal: AbortSignal.timeout(20000) });
      if (!rr.ok) return null;
      return rr.text().then((s) => s.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/)?.[0] ?? null);
    }
    return text.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/)?.[0] ?? null;
  } catch {
    return null;
  }
}

function parseLevels(m3u8Text: string): { height?: number; width?: number; bandwidth?: number }[] {
  const levels: { height?: number; width?: number; bandwidth?: number }[] = [];
  const lines = m3u8Text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const level: { height?: number; width?: number; bandwidth?: number } = {};
    const res = line.match(/RESOLUTION=(\d+)x(\d+)/);
    if (res) {
      level.width = parseInt(res[1], 10);
      level.height = parseInt(res[2], 10);
    }
    const bw = line.match(/BANDWIDTH=(\d+)/);
    if (bw) level.bandwidth = parseInt(bw[1], 10);
    levels.push(level);
  }
  return levels;
}

export async function ngeStream(url: string): Promise<NgeStream | null> {
  if (!/^https?:/i.test(url)) url = NGE_BASE + url;
  return cached(`nge_stream|${url}`, 10 * 60 * 1000, async () => {
    const master = await extractRpm(url);
    if (master) {
      let levels: { height?: number; width?: number; bandwidth?: number }[] = [];
      try {
        const r = await fetch(master, {
          headers: {
            "User-Agent": NGE_UA,
            Referer: `${RPM_BASE}/`,
            Origin: `${RPM_BASE}/`,
          },
          signal: AbortSignal.timeout(20000),
        });
        if (r.ok) levels = parseLevels(await r.text());
      } catch {
        levels = [];
      }
      return { master, kind: "hls", levels };
    }
    const bx = await extractBestx(url);
    if (bx) return { master: bx, kind: "hls", levels: [] };
    return null;
  });
}