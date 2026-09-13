import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const IDLIX_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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

  // Strategy 1: referrer as-is from the embed page (hgcloud.to)
  if (ref) {
    strategies.push({ ...base, "Referer": ref, "Origin": new URL(ref).origin });
  }

  // Strategy 2: referer from embed page, no Origin header (some CDNs don't check Origin)
  if (ref) {
    strategies.push({ ...base, "Referer": ref });
  }

  // Strategy 3: CDN's own origin as referer (for CDNs that reject cross-origin)
  strategies.push({ ...base, "Referer": urlObj.origin + "/", "Origin": urlObj.origin });

  // Strategy 4: bare — no referer, no origin (last resort)
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
      // 403/429 → try next strategy
      if (res.status === 403 || res.status === 429) continue;
      // Other errors → return immediately (e.g. 404, 500)
      return res;
    } catch {
      clearTimeout(timeout);
      // Network error → try next strategy
      continue;
    }
  }

  // All strategies exhausted — do one final attempt to return the error
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

  try {
    const proxyRes = await proxyFetchWithRetry(target, ref, rangeHeader);
    const ct = proxyRes.headers.get("content-type") || "";
    const status = proxyRes.status;

    if (!proxyRes.ok) {
      return NextResponse.json({ error: `upstream ${status}` }, { status });
    }

    const isManifest = isManifestUrl(target, ct);
    const isSegment = isSegmentUrl(target);

    if (isManifest) {
      const body = await proxyRes.text();
      const rewritten = rewriteUrls(body, target);
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
