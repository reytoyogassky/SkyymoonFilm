import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const IDLIX_BASE = "https://z2.idlixku.com";
const IDLIX_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function upstreamHeaders(target: string, ref: string | null): Record<string, string> {
  if (ref) {
    return {
      Referer: ref,
      Origin: ref.replace(/\/$/, ""),
      "User-Agent": IDLIX_UA,
    };
  }
  return {
    Referer: `${IDLIX_BASE}/`,
    "User-Agent": IDLIX_UA,
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
    let upstream = await fetch(target, {
      headers: upstreamHeaders(target, ref),
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok) {
      await new Promise((r) => setTimeout(r, 500));
      upstream = await fetch(target, {
        headers: upstreamHeaders(target, ref),
        signal: AbortSignal.timeout(30000),
      });
    }
    if (!upstream.ok) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: upstream.status });
    }

    const ctype = upstream.headers.get("Content-Type") ?? "application/octet-stream";
    const contentLength = upstream.headers.get("Content-Length");

    const reader = upstream.body!.getReader();
    const { value: head, done: headDone } = await reader.read();
    if (headDone) {
      return new NextResponse(new Uint8Array(0), {
        status: 200,
        headers: { "Content-Type": ctype, "Access-Control-Allow-Origin": "*" },
      });
    }

    const headStr = new TextDecoder().decode(head.subarray(0, Math.min(head.length, 16))).trimStart();
    if (headStr.startsWith("#EXTM3U")) {
      let m3u8Text = new TextDecoder().decode(head);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        m3u8Text += new TextDecoder().decode(value);
      }
      const rewritten = rewriteM3u8(m3u8Text, target, ref);
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=120",
        },
      });
    }

    const rest = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(head);
        const pump = async () => {
          while (true) {
            const { value, done } = await reader.read();
            if (done) { ctrl.close(); break; }
            ctrl.enqueue(value);
          }
        };
        pump().catch((e) => ctrl.error(e));
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": ctype,
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=300",
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    return new NextResponse(rest, { status: 200, headers });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}