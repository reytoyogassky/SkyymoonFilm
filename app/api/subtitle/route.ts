import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const stripVttStyles = (txt: string): string =>
  txt
    .replace(/STYLE[\s\S]*?(?=\n\n|$)/i, "")
    .replace(/::cue[^{]*\{[^}]*\}\s*/g, "");

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url") || "";
  if (!target) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        Accept: "text/vtt,text/plain,*/*",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://majorplay.net/",
        Origin: "https://majorplay.net",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
    }

    const body = stripVttStyles(await res.text());

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }
}