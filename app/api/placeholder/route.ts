import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const seed = sp.get("seed") ?? "?";
  const kind = sp.get("kind") === "backdrop" ? "backdrop" : "poster";
  const initial = esc((seed.trim()[0] ?? "?").toUpperCase());

  const w = kind === "backdrop" ? 1280 : 600;
  const h = kind === "backdrop" ? 720 : 900;
  const fontSize = kind === "backdrop" ? 300 : 260;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4a0d18"/>
      <stop offset="45%" stop-color="#1c060b"/>
      <stop offset="100%" stop-color="#0b0507"/>
    </linearGradient>
    <radialGradient id="r" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#e11d2e" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#e11d2e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#r)"/>
  <circle cx="${w * 0.5}" cy="${h * 0.42}" r="${w * 0.16}" fill="none" stroke="#ff5566" stroke-opacity="0.22" stroke-width="3"/>
  <text x="${w / 2}" y="${h * 0.47}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff" fill-opacity="0.14">${initial}</text>
  <text x="${w / 2}" y="${h * 0.9}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(w * 0.045)}" font-weight="700" letter-spacing="8" fill="#ff5566" fill-opacity="0.5">SKYMOON</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}