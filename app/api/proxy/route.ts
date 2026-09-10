import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const https = require("https");
const http = require("http");

const IDLIX_BASE = "https://z2.idlixku.com";
const IDLIX_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function extractOriginalUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.includes("/api/proxy") && u.searchParams.has("url")) {
      return u.searchParams.get("url")!;
    }
  } catch {}
  return url;
}

function rewriteUrls(content: string, originalUrl: string): string {
  const realUrl = extractOriginalUrl(originalUrl);
  const base = realUrl.substring(0, realUrl.lastIndexOf("/") + 1);

  return content.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    if (trimmed.startsWith("/api/proxy")) return line;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return line;
    let absolute: string;
    try {
      absolute = new URL(trimmed, base).href;
    } catch { return line; }
    return "/api/proxy?url=" + encodeURIComponent(absolute);
  }).join("\n");
}

function proxyFetch(targetUrl: string, ref: string | null, depth = 0): Promise<any> {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  const fetchUrl = extractOriginalUrl(targetUrl);

  return new Promise((resolve, reject) => {
    const client = fetchUrl.startsWith("https") ? https : http;
    const headers: Record<string, string> = {
      "User-Agent": IDLIX_UA,
      "Accept": "*/*",
    };
    if (ref) {
      headers["Referer"] = ref;
      headers["Origin"] = ref.replace(/\/$/, "");
    } else {
      headers["Referer"] = `${IDLIX_BASE}/`;
    }
    const req = client.get(fetchUrl, { headers, timeout: 30000 }, (res: any) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith("http")
          ? res.headers.location : new URL(res.headers.location, fetchUrl).href;
        resolve(proxyFetch(redirectUrl, ref, depth + 1));
        return;
      }
      resolve(res);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function isSegmentUrl(url: string): boolean {
  return /\.(ts|m4s|mp4|aac|fmp4)(\?|$)/i.test(url);
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  const ref = req.nextUrl.searchParams.get("ref");
  if (!target) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const proxyRes = await proxyFetch(target, ref);
    const ct = proxyRes.headers["content-type"] || "";
    const isManifest = ct.includes("mpegurl") || ct.includes("mpeg-url") || ct.includes("vnd.apple") ||
      target.includes(".m3u8") || target.includes("master.txt") || target.includes("index-v1");
    const isSegment = isSegmentUrl(target);

    if (isManifest) {
      let body = "";
      for await (const chunk of proxyRes) body += chunk;
      const rewritten = rewriteUrls(body, target);
      return new NextResponse(rewritten, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=120",
        },
      });
    }

    // Stream video segments directly instead of buffering into memory.
    // This reduces TTFB significantly for large .ts/.m4s segments.
    if (isSegment) {
      const contentLength = proxyRes.headers["content-length"];
      const stream = new ReadableStream({
        start(controller) {
          proxyRes.on("data", (chunk: Buffer) => {
            controller.enqueue(chunk);
          });
          proxyRes.on("end", () => {
            controller.close();
          });
          proxyRes.on("error", (err: Error) => {
            controller.error(err);
          });
        },
        cancel() {
          proxyRes.destroy();
        },
      });

      const headers: Record<string, string> = {
        "Content-Type": ct || "video/mp2t",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=600, immutable",
      };
      if (contentLength) headers["Content-Length"] = contentLength;

      return new NextResponse(stream, { headers });
    }

    // Non-segment, non-manifest: buffer as before (small payloads like keys)
    const chunks: Buffer[] = [];
    for await (const chunk of proxyRes) chunks.push(chunk);
    return new NextResponse(Buffer.concat(chunks), {
      headers: {
        "Content-Type": ct || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
