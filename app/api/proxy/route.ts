import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const IDLIX_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// In-memory cache for manifests — CDN blocks repeated requests, so cache the first successful one
const manifestCache = new Map<string, { body: string; at: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Track failed URLs to avoid hammering blocked CDNs
const failedUrls = new Map<string, { status: number; at: number }>();
const FAIL_TTL = 30 * 1000; // 30 seconds cooldown

function extractOriginalUrl(url: string): string {
  let current = url;
  for (let i = 0; i < 10; i++) {
    try {
      const u = new URL(current);
      if (u.searchParams.has("url")) {
        const inner = u.searchParams.get("url")!;
        if (inner.startsWith("http")) {
          current = inner;
          continue;
        }
      }
    } catch {}
    break;
  }
  return current;
}

function rewriteUrls(content: string, originalUrl: string): string {
  const realUrl = extractOriginalUrl(originalUrl);
  const base = realUrl.substring(0, realUrl.lastIndexOf("/") + 1);
  return content.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    if (trimmed.startsWith("/api/proxy")) return line;
    let absolute: string;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      absolute = trimmed;
    } else if (trimmed.startsWith("//")) {
      try { absolute = new URL("https:" + trimmed).href; } catch { return line; }
    } else {
      try { absolute = new URL(trimmed, base).href; } catch { return line; }
    }
    return "/api/proxy?url=" + encodeURIComponent(absolute);
  }).join("\n");
}

// Try different header combos — CDNs are picky about Referer/Origin
function buildHeaderStrategies(fetchUrl: string, ref: string | null): Record<string, string>[] {
  const urlObj = new URL(fetchUrl);
  const base: Record<string, string> = {
    "User-Agent": IDLIX_UA,
    "Accept": "*/*",
  };

  const strategies: Record<string, string>[] = [];

  if (ref) {
    strategies.push({ ...base, "Referer": ref, "Origin": new URL(ref).origin });
    strategies.push({ ...base, "Referer": ref });
  }

  strategies.push({ ...base, "Referer": urlObj.origin + "/", "Origin": urlObj.origin });
  strategies.push({ ...base });

  return strategies;
}

async function proxyFetchWithRetry(
  targetUrl: string,
  ref: string | null,
  rangeHeader: string | null,
): Promise<Response> {
  const fetchUrl = extractOriginalUrl(targetUrl);
  const strategies = buildHeaderStrategies(fetchUrl, ref);

  for (const headers of strategies) {
    if (rangeHeader) headers["Range"] = rangeHeader;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(fetchUrl, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      if (res.ok) return res;
      if (res.status === 403 || res.status === 429) continue;
      return res;
    } catch {
      clearTimeout(timeout);
      continue;
    }
  }

  // Final fallback
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const fallbackHeaders: Record<string, string> = {
      "User-Agent": IDLIX_UA,
      "Accept": "*/*",
    };
    if (ref) fallbackHeaders["Referer"] = ref;
    if (rangeHeader) fallbackHeaders["Range"] = rangeHeader;
    const res = await fetch(fetchUrl, {
      headers: fallbackHeaders,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function isSegmentUrl(url: string): boolean {
  return /\.(ts|m4s|mp4|aac|fmp4)(\?|$)/i.test(url);
}

function isManifestUrl(url: string, contentType: string): boolean {
  if (contentType.includes("mpegurl") || contentType.includes("mpeg-url") ||
      contentType.includes("vnd.apple") || contentType.includes("x-mpegurl")) return true;
  if (url.includes(".m3u8") || url.includes("master.") || url.includes("index-v1")) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  const ref = req.nextUrl.searchParams.get("ref");
  if (!target) return NextResponse.json({ error: "url required" }, { status: 400 });

  const rangeHeader = req.headers.get("range");
  const isManifest = target.includes(".m3u8") || target.includes("master.") || target.includes("index-v1");
  const isSegment = isSegmentUrl(target);

  try {
    const fetchUrl = extractOriginalUrl(target);

    // Only apply cooldown for non-manifest URLs (segments)
    // Manifests must always retry — CDN sometimes allows them
    if (!isManifest) {
      const fail = failedUrls.get(fetchUrl);
      if (fail && Date.now() - fail.at < FAIL_TTL) {
        return NextResponse.json({ error: `upstream ${fail.status} (cooldown)` }, { status: fail.status });
      }
    }

    // Check manifest cache first
    if (isManifest) {
      const cached = manifestCache.get(fetchUrl);
      if (cached && Date.now() - cached.at < CACHE_TTL) {
        return new NextResponse(cached.body, {
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    const proxyRes = await proxyFetchWithRetry(target, ref, rangeHeader);
    const ct = proxyRes.headers.get("content-type") || "";
    const status = proxyRes.status;

    if (!proxyRes.ok) {
      const fetchUrl2 = extractOriginalUrl(target);
      // Track failures to avoid hammering blocked CDNs
      if (status === 403 || status === 429) {
        failedUrls.set(fetchUrl2, { status, at: Date.now() });
        // On 403 for manifest, try to serve stale cache
        if (isManifest) {
          const stale = manifestCache.get(fetchUrl2);
          if (stale) {
            return new NextResponse(stale.body, {
              headers: {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
                "X-Cache": "stale",
              },
            });
          }
        }
      }
      return NextResponse.json({ error: `upstream ${status}` }, { status });
    }

    if (isManifest) {
      const body = await proxyRes.text();
      const rewritten = rewriteUrls(body, target);
      const fetchUrl3 = extractOriginalUrl(target);
      manifestCache.set(fetchUrl3, { body: rewritten, at: Date.now() });
      // Clear failure tracking on success
      failedUrls.delete(fetchUrl3);
      // Evict old entries
      if (manifestCache.size > 50) {
        const now = Date.now();
        for (const [k, v] of manifestCache) {
          if (now - v.at > CACHE_TTL) manifestCache.delete(k);
        }
      }

      // Pre-fetch sub-playlists referenced in this manifest (they also get blocked by CDN)
      const refUrl = ref || "";
      const base = fetchUrl3.substring(0, fetchUrl3.lastIndexOf("/") + 1);
      const subManifests = body.split("\n")
        .map(l => l.trim())
        .filter(l => l && !l.startsWith("#") && (l.endsWith(".m3u8") || l.includes("index-v1")))
        .map(l => {
          if (l.startsWith("http")) return l;
          if (l.startsWith("//")) return "https:" + l;
          try { return new URL(l, base).href; } catch { return null; }
        })
        .filter((u): u is string => !!u && !manifestCache.has(u));

      // Fire-and-forget: pre-fetch sub-playlists in background
      for (const subUrl of subManifests.slice(0, 10)) {
        proxyFetchWithRetry(subUrl, refUrl, null).then(async (r) => {
          if (r.ok) {
            const subBody = await r.text();
            const subRewritten = rewriteUrls(subBody, subUrl);
            manifestCache.set(subUrl, { body: subRewritten, at: Date.now() });
          }
        }).catch(() => {});
      }
      return new NextResponse(rewritten, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    }

    const contentLength = proxyRes.headers.get("content-length");
    const contentRange = proxyRes.headers.get("content-range");
    const resStatus = status === 206 ? 206 : 200;

    let bodyReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const stream = new ReadableStream({
      async start(controller) {
        bodyReader = proxyRes.body?.getReader() || null;
        if (!bodyReader) { controller.close(); return; }
        try {
          while (true) {
            const { done, value } = await bodyReader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch {}
        controller.close();
      },
      cancel() {
        try { bodyReader?.cancel(); } catch {}
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": ct || (isSegment ? "video/mp2t" : "application/octet-stream"),
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": "bytes",
      "Cache-Control": isSegment ? "public, max-age=600" : "no-cache",
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new Response(stream, { status: resStatus, headers });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
