import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const stripVttStyles = (txt: string): string =>
  txt
    .replace(/STYLE[\s\S]*?(?=\n\n|$)/i, "")
    .replace(/::cue[^{]*\{[^}]*\}\s*/g, "");

/** Try to convert SRT content to VTT */
function srtToVtt(text: string): string {
  if (text.trimStart().startsWith("WEBVTT")) return text;
  return (
    "WEBVTT\n\n" +
    text
      .replace(/\r\n/g, "\n")
      .replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, "$1:$2:$3.$4")
  );
}

async function tryFetch(url: string, referer: string, origin: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      Accept: "text/vtt,text/plain,*/*",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: referer,
      Origin: origin,
    },
    cache: "force-cache",
    signal: AbortSignal.timeout(15000),
  });
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url") || "";
  if (!target) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // Derive referer from the subtitle URL's own domain as a fallback
  let subtitleOrigin = "";
  try {
    const u = new URL(target);
    subtitleOrigin = u.origin;
  } catch {}

  // Try multiple referer strategies — different providers need different referers
  const strategies = [
    { referer: "https://majorplay.net/", origin: "https://majorplay.net" },
    ...(subtitleOrigin ? [{ referer: `${subtitleOrigin}/`, origin: subtitleOrigin }] : []),
    { referer: "https://idlix.tv/", origin: "https://idlix.tv" },
    { referer: "", origin: "" },
  ];

  for (const { referer, origin } of strategies) {
    try {
      const res = await tryFetch(target, referer, origin);
      if (!res.ok) continue;

      let body = await res.text();
      if (!body.trim()) continue;

      body = srtToVtt(stripVttStyles(body));

      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/vtt; charset=utf-8",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
}
