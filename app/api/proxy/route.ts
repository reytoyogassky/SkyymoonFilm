import { NextRequest, NextResponse } from "next/server";
import { NGE_UA } from "@/lib/ngefilm";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const IDLIX_BASE = "https://z2.idlixku.com";
const RPM_REF = "https://playerngefilm21.rpmlive.online/";

function upstreamHeaders(target: string, ref: string | null): Record<string, string> {
  if (ref) {
    return {
      Referer: ref,
      Origin: ref.replace(/\/$/, ""),
      "User-Agent": NGE_UA,
    };
  }
  if (target.includes("rpmlive")) {
    return {
      Referer: RPM_REF,
      Origin: RPM_REF.replace(/\/$/, ""),
      "User-Agent": NGE_UA,
    };
  }
  return {
    Referer: `${IDLIX_BASE}/`,
    "User-Agent": NGE_UA,
  };
}

function proxied(uri: string, target: string, ref: string | null): string {
  const full = /^https?:\/\//i.test(uri) ? uri : new URL(uri, target).toString();
  let q = `url=${encodeURIComponent(full)}`;
  if (ref) q += `&ref=${encodeURIComponent(ref)}`;
  return `/api/proxy?${q}`;
}

function rewriteM3u8(text: string, target: string, ref: string | null): string {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      out.push(raw);
      continue;
    }
    if (line.startsWith("#")) {
      if (/^#(EXT-X-MEDIA|EXT-X-KEY|EXT-X-SESSION-KEY|EXT-X-MAP|EXT-X-I-FRAME-STREAM-INF)/.test(line)) {
        out.push(line.replace(/URI="([^"]*)"/g, (_m, uri: string) => `URI="${proxied(uri, target, ref)}"`));
      } else {
        out.push(raw);
      }
    } else {
      out.push(proxied(line, target, ref));
    }
  }
  return out.join("\n");
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  const ref = req.nextUrl.searchParams.get("ref");
  if (!target) return NextResponse.json({ error: "url required" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "url invalid" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "protocol not allowed" }, { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      headers: upstreamHeaders(target, ref),
      signal: AbortSignal.timeout(60000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: upstream.status });
    }

    const ctype = upstream.headers.get("Content-Type") ?? "application/octet-stream";
    const body = Buffer.from(await upstream.arrayBuffer());

    if (body.subarray(0, 16).toString("utf8").trimStart().startsWith("#EXTM3U")) {
      const rewritten = rewriteM3u8(body.toString("utf8"), target, ref);
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=120",
        },
      });
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": ctype,
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=300",
        ...(upstream.headers.get("Content-Length")
          ? { "Content-Length": upstream.headers.get("Content-Length")! }
          : {}),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}