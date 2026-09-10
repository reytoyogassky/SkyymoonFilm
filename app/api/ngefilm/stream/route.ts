import { NextRequest } from "next/server";

const https = require("https");
const http = require("http");

const AD_RE = /google|facebook|yandex|doubleclick|adsbygoogle|adsystem|analytics|beacon|gtag|metrika|adnxs|taboola|outbrain|chartbeat|hotjar|newrelic|cloudflareinsights/i;

const SERVER_PRIORITY: Record<string, number> = {
  "Server 5": 0,
  "Server 4": 1,
  "Server 3": 2,
  "Server 1": 99,
  "Server 2": 99,
};

let browserInstance: any = null;

function getPuppeteerArgs() {
  const args: string[] = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
         "--disable-extensions", "--disable-background-networking", "--disable-default-apps",
         "--disable-sync", "--disable-translate", "--mute-audio", "--no-first-run"];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    args.push("--disable-accelerated-2d-canvas", "--disable-gl-drawing-for-tests",
              "--disable-features=VizDisplayCompositor", "--js-flags=--max-old-space-size=256");
  }
  return args;
}

async function getBrowser() {
  if (browserInstance && browserInstance.connected) return browserInstance;
  if (browserInstance) { try { await browserInstance.close(); } catch {} browserInstance = null; }
  const puppeteer = (await import("puppeteer")).default;
  const launchOptions: any = { headless: "new", args: getPuppeteerArgs(), protocolTimeout: 60000 };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  browserInstance = await puppeteer.launch(launchOptions);
  browserInstance.on("disconnected", () => { browserInstance = null; });
  return browserInstance;
}

interface StreamInfo { url: string; manifest: string | null; server: string; qualities: string[]; }
interface ServerResult { name: string; url: string; qualities: string[]; status: string; }

function parseQualities(manifest: string): string[] {
  const qualities: string[] = [];
  const resMatches = manifest.matchAll(/RESOLUTION=(\d+x\d+)/gi);
  for (const m of resMatches) {
    const h = m[1].split("x")[1];
    if (h) qualities.push(h + "p");
  }
  return [...new Set(qualities)].sort((a, b) => parseInt(b) - parseInt(a));
}

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET(req: NextRequest) {
  const pageUrl = req.nextUrl.searchParams.get("url");
  if (!pageUrl) {
    return Response.json({ error: "url required" }, { status: 400 });
  }

  const slug = pageUrl.split("/").filter(Boolean).pop();
  console.log(`[NGEFILM-STREAM] Mulai untuk slug: ${slug}, url: ${pageUrl}`);

  const allStreams: StreamInfo[] = [];
  const seen = new Set<string>();
  const serverResults: ServerResult[] = [];

  function listenStreams(pg: any, serverName: string) {
    pg.on("response", async (resp: any) => {
      try {
        const u = resp.url();
        const ct = resp.headers()["content-type"] || "";
        if (AD_RE.test(u)) return;
        if (u.includes(".m3u8") || u.includes(".mp4") || u.includes(".ts") ||
            u.includes("master.") || u.includes("/hlsmod/") || u.includes("hls3/") ||
            u.includes("hls4/") || ct.includes("mpegurl") || ct.includes("video/mp4")) {
          const key = u.split("?")[0];
          if (!seen.has(key)) {
            seen.add(key);
            let body: string | null = null;
            try { body = await resp.text(); } catch {}
            const qualities = parseQualities(body || "");
            allStreams.push({ url: u, manifest: body?.substring(0, 2000) || null, server: serverName, qualities });
            console.log(`[NGEFILM-STREAM] [${serverName}] Stream ditemukan! ${qualities.length ? qualities.join(", ") : "HLS"} url=${u.substring(0, 120)}`);
          }
        }
      } catch {}
    });
  }

  function blockAds(pg: any) {
    pg.setRequestInterception(true);
    pg.on("request", (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());
  }

  try {
    const browser = await getBrowser();
    console.log(`[NGEFILM-STREAM] Browser siap`);

    console.log(`[NGEFILM-STREAM] Loading halaman...`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setRequestInterception(true);
    page.on("request", (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());

    let servers: { name: string; href: string }[] = [];
    try {
      await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 20000 });
      await new Promise((r: any) => setTimeout(r, 1500));
      servers = await page.evaluate(() => {
        const tabs: { name: string; href: string }[] = [];
        document.querySelectorAll(".muvipro-player-tabs a").forEach(a => {
          tabs.push({ name: a.textContent?.trim() || "", href: (a as HTMLAnchorElement).href });
        });
        return tabs;
      });
    } catch (e: any) {
      console.log(`[NGEFILM-STREAM] Error load halaman: ${e.message}`);
    }
    await page.close().catch(() => {});

    servers.sort((a, b) => (SERVER_PRIORITY[a.name] ?? 50) - (SERVER_PRIORITY[b.name] ?? 50));
    console.log(`[NGEFILM-STREAM] ${servers.length} server ditemukan: ${servers.map(s => s.name).join(", ")}`);

    for (const srv of servers) {
      if ((SERVER_PRIORITY[srv.name] ?? 50) >= 99) {
        console.log(`[NGEFILM-STREAM] [${srv.name}] Skip (server mati)`);
        serverResults.push({ name: srv.name, url: "", qualities: [], status: "skipped" });
        continue;
      }

      console.log(`[NGEFILM-STREAM] [${srv.name}] Mencoba...`);
      const streamsBefore = allStreams.length;
      const srvPage = await browser.newPage();
      await srvPage.setViewport({ width: 1280, height: 720 });
      listenStreams(srvPage, srv.name);
      blockAds(srvPage);

      try {
        await srvPage.goto(srv.href, { waitUntil: "networkidle2", timeout: 15000 });
        await new Promise((r: any) => setTimeout(r, 1500));

        const iframeSrcs: string[] = await srvPage.evaluate(() => {
          return Array.from(document.querySelectorAll("iframe"))
            .map(f => (f as HTMLIFrameElement).src || f.getAttribute("data-src") || "")
            .filter(s => s && !/google|facebook|about:blank|uploads\//.test(s) && s.length > 10);
        });
        const liveIframes = iframeSrcs.filter((s: string) => !/rpmlive|abyssplayer|abyss\.to/i.test(s));

        if (liveIframes.length === 0) {
          console.log(`[NGEFILM-STREAM] [${srv.name}] Tidak ada player iframe (dead)`);
          serverResults.push({ name: srv.name, url: "", qualities: [], status: "dead" });
          await srvPage.close().catch(() => {});
          continue;
        }

        console.log(`[NGEFILM-STREAM] [${srv.name}] Player ditemukan: ${liveIframes[0].substring(0, 80)}`);

        const ifrPage = await browser.newPage();
        listenStreams(ifrPage, srv.name);
        blockAds(ifrPage);

        try {
          await ifrPage.goto(liveIframes[0], { waitUntil: "networkidle2", timeout: 15000 });
          await new Promise((r: any) => setTimeout(r, 2000));

          console.log(`[NGEFILM-STREAM] [${srv.name}] Player loaded, mencoba play...`);
          await ifrPage.evaluate(() => {
            document.querySelectorAll("video").forEach(v => { (v as HTMLVideoElement).muted = true; (v as HTMLVideoElement).play().catch(()=>{}); });
            document.querySelectorAll("button").forEach(b => { if (b.textContent?.toLowerCase().includes("play")) b.click(); });
            try { (window as any).jwplayer?.().play(); } catch {}
          }).catch(() => {});
          await new Promise((r: any) => setTimeout(r, 3000));
        } catch (e: any) {
          console.log(`[NGEFILM-STREAM] [${srv.name}] Error iframe: ${e.message}`);
        }
        await ifrPage.close().catch(() => {});
      } catch (e: any) {
        console.log(`[NGEFILM-STREAM] [${srv.name}] Error server: ${e.message}`);
      }
      await srvPage.close().catch(() => {});

      const newStreams = allStreams.slice(streamsBefore);
      if (newStreams.length > 0) {
        const bestForServer = newStreams[0];
        console.log(`[NGEFILM-STREAM] [${srv.name}] ✓ BERHASIL! ${newStreams.length} stream`);
        serverResults.push({ name: srv.name, url: bestForServer.url, qualities: bestForServer.qualities, status: "success" });
      } else {
        console.log(`[NGEFILM-STREAM] [${srv.name}] Gagal, coba server berikutnya...`);
        serverResults.push({ name: srv.name, url: "", qualities: [], status: "failed" });
      }
    }

    if (allStreams.length === 0) {
      console.log(`[NGEFILM-STREAM] Semua server gagal untuk ${slug}`);
      return Response.json({ error: "Semua server NgeFilm gagal" }, { status: 502 });
    }

    const best = allStreams[0];
    const bestUrl = `/api/proxy?url=${encodeURIComponent(best.url)}`;
    console.log(`[NGEFILM-STREAM] ✓ Final: server=${best.server}, qualities=${best.qualities.join(", ")}`);

    const validServers = serverResults
      .filter(s => s.status === "success" && s.url)
      .map(s => ({
        name: s.name,
        url: `/api/proxy?url=${encodeURIComponent(s.url)}`,
        qualities: s.qualities,
      }));

    return Response.json({
      streamUrl: bestUrl,
      kind: "hls",
      subtitles: [],
      qualities: best.qualities,
      server: best.server,
      servers: validServers,
    });
  } catch (err) {
    console.log(`[NGEFILM-STREAM] Error: ${(err as Error).message}`);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
