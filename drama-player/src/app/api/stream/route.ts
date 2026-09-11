import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const m3u8Cache = new Map<string, { body: string; ts: number }>();
const CACHE_TTL = 30_000;

function getCachedM3u8(key: string): string | null {
  const entry = m3u8Cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.body;
  if (entry) m3u8Cache.delete(key);
  return null;
}

function setCachedM3u8(key: string, body: string) {
  if (m3u8Cache.size > 200) {
    const oldest = m3u8Cache.keys().next().value;
    if (oldest) m3u8Cache.delete(oldest);
  }
  m3u8Cache.set(key, { body, ts: Date.now() });
}

async function proxyHls(originalUrl: string, requestOrigin: string): Promise<Response> {
  const cached = getCachedM3u8(originalUrl);
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  }

  const cdnUrl = new URL(originalUrl);
  const cdnOrigin = cdnUrl.origin;
  const queryString = cdnUrl.search;
  const dirPath = originalUrl.substring(0, originalUrl.lastIndexOf("/") + 1);

  const res = await fetch(originalUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Referer": cdnOrigin + "/",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return new Response(`Upstream ${res.status}`, { status: res.status });

  const body = await res.text();
  setCachedM3u8(originalUrl, body);

  const lines = body.split("\n");
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;

    let fullUrl: string;
    if (trimmed.startsWith("http")) {
      fullUrl = trimmed;
    } else if (trimmed.startsWith("/")) {
      fullUrl = `${cdnOrigin}${trimmed}`;
    } else {
      fullUrl = `${dirPath}${trimmed}`;
    }

    if (queryString) {
      try {
        const u = new URL(fullUrl);
        if (!u.search) u.search = queryString;
        fullUrl = u.toString();
      } catch {
        fullUrl = fullUrl + queryString;
      }
    }

    return `${requestOrigin}/api/stream?url=${encodeURIComponent(fullUrl)}`;
  });

  return new Response(rewritten.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    },
  });
}

async function proxySegment(url: string): Promise<Response> {
  const urlObj = new URL(url);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Referer": urlObj.origin + "/",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return new Response(`Upstream ${res.status}`, { status: res.status });

  const contentType = res.headers.get("content-type") || "video/mp2t";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  };
  const cl = res.headers.get("content-length");
  const cr = res.headers.get("content-range");
  if (cl) headers["Content-Length"] = cl;
  if (cr) headers["Content-Range"] = cr;
  return new Response(res.body, { status: res.status, headers });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const reqUrl = new URL(request.url);
  const origin = `${reqUrl.protocol}//${reqUrl.host}`;

  if (!url) {
    return NextResponse.json({ error: "Missing ?url= parameter" }, { status: 400 });
  }

  try {
    if (url.includes(".m3u8")) {
      return await proxyHls(url, origin);
    }
    return await proxySegment(url);
  } catch {
    return NextResponse.json({ error: "Stream fetch failed" }, { status: 502 });
  }
}
