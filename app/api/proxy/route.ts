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

async function proxyFetch(targetUrl: string, ref: string | null, rangeHeader: string | null, depth = 0): Promise<Response> {
  if (depth > 5) throw new Error("Too many redirects");
  const fetchUrl = extractOriginalUrl(targetUrl);
  const urlObj = new URL(fetchUrl);

  const headers: Record<string, string> = {
    "User-Agent": IDLIX_UA,
    "Accept": "*/*",
  };
  if (ref) {
    headers["Referer"] = ref;
    headers["Origin"] = ref.replace(/\/$/, "");
  } else {
    headers["Referer"] = urlObj.origin + "/";
    headers["Origin"] = urlObj.origin;
  }
  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(fetchUrl, {
      headers,
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
    const proxyRes = await proxyFetch(target, ref, rangeHeader);
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

    const stream = new ReadableStream({
      async start(controller) {
        const reader = proxyRes.body?.getReader();
        if (!reader) { controller.close(); return; }
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch {}
        controller.close();
      },
      cancel() { proxyRes.body?.cancel(); },
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
