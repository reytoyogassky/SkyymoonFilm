import { NextRequest } from "next/server";

const AD_RE = /google|facebook|yandex|doubleclick|adsbygoogle|adsystem|analytics|beacon|gtag|metrika|adnxs|taboola|outbrain|chartbeat|hotjar|newrelic|cloudflareinsights/i;

const SERVER_PRIORITY: Record<string, number> = {
  "Server 5": 0, "Server 4": 1, "Server 3": 2,
  "Server 1": 99, "Server 2": 99,
};

let browserInstance: any = null;

function getPuppeteerArgs() {
  const args: string[] = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-translate",
    "--mute-audio",
    "--no-first-run",
  ];

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    args.push(
      "--disable-accelerated-2d-canvas",
      "--disable-gl-drawing-for-tests",
      "--disable-features=VizDisplayCompositor",
      "--js-flags=--max-old-space-size=256",
    );
  }

  return args;
}

async function getBrowser() {
  if (browserInstance && browserInstance.connected) return browserInstance;
  if (browserInstance) {
    try { await browserInstance.close(); } catch {}
    browserInstance = null;
  }
  const puppeteer = (await import("puppeteer")).default;
  const launchOptions: any = {
    headless: "new",
    args: getPuppeteerArgs(),
    protocolTimeout: 60000,
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  browserInstance = await puppeteer.launch(launchOptions);
  browserInstance.on("disconnected", () => { browserInstance = null; });
  return browserInstance;
}

interface StreamInfo { url: string; server: string; qualities: string[]; }

function parseQualities(manifest: string): string[] {
  const qualities: string[] = [];
  for (const m of manifest.matchAll(/RESOLUTION=(\d+x\d+)/gi)) {
    const h = m[1].split("x")[1];
    if (h) qualities.push(h + "p");
  }
  return [...new Set(qualities)].sort((a, b) => parseInt(b) - parseInt(a));
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const pageUrl = req.nextUrl.searchParams.get("url");
  if (!pageUrl) return Response.json({ error: "url required" }, { status: 400 });

  const slug = pageUrl.split("/").filter(Boolean).pop();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: string) => {
        console.log(`[NGEFILM-SSE] ${msg}`);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "log", msg })}\n\n`));
      };

      const allStreams: StreamInfo[] = [];
      const workingServers: { name: string; url: string; qualities: string[]; time: number }[] = [];
      const seen = new Set<string>();

      function listenStreams(pg: any, serverName: string) {
        pg.on("response", async (resp: any) => {
          try {
            const u = resp.url();
            const ct = resp.headers()["content-type"] || "";
            if (AD_RE.test(u)) return;
            if (u.includes(".m3u8") || u.includes("master.") || u.includes("/hlsmod/") ||
                u.includes("hls3/") || u.includes("hls4/") || ct.includes("mpegurl")) {
              const key = u.split("?")[0];
              if (!seen.has(key)) {
                seen.add(key);
                let body: string | null = null;
                try { body = await resp.text(); } catch {}
                const qualities = parseQualities(body || "");
                allStreams.push({ url: u, server: serverName, qualities });
                send(`[${serverName}] Stream ditemukan! ${qualities.length ? qualities.join(", ") : "HLS"}`);
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
        send("Browser siap");

        send("Membuka halaman film...");
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setRequestInterception(true);
        page.on("request", (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());

        let servers: { name: string; href: string }[] = [];
        let finalPageUrl = pageUrl;
        try {
          await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
          await new Promise(r => setTimeout(r, 3000));
          servers = await page.evaluate(() => {
            const tabs: { name: string; href: string }[] = [];
            document.querySelectorAll(".muvipro-player-tabs a").forEach(a => {
              tabs.push({ name: a.textContent?.trim() || "", href: (a as HTMLAnchorElement).href });
            });
            return tabs;
          });
        } catch (e: any) {
          send(`Error load halaman: ${e.message}`);
        }
        await page.close().catch(() => {});

        if (servers.length === 0 && !pageUrl.includes("/tv/")) {
          send(`Coba URL /tv/...`);
          const tvUrl = pageUrl.replace("://new39.ngefilm.site/", "://new39.ngefilm.site/tv/");
          finalPageUrl = tvUrl;
          const page2 = await browser.newPage();
          await page2.setViewport({ width: 1280, height: 720 });
          await page2.setRequestInterception(true);
          page2.on("request", (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());
          try {
            await page2.goto(tvUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
            await new Promise(r => setTimeout(r, 3000));
            servers = await page2.evaluate(() => {
              const tabs: { name: string; href: string }[] = [];
              document.querySelectorAll(".muvipro-player-tabs a").forEach(a => {
                tabs.push({ name: a.textContent?.trim() || "", href: (a as HTMLAnchorElement).href });
              });
              return tabs;
            });
            if (servers.length > 0) send(`✓ URL /tv/ berhasil!`);
          } catch (e: any) {
            send(`Error load /tv/ halaman: ${e.message}`);
          }
          await page2.close().catch(() => {});
        }

        servers.sort((a, b) => (SERVER_PRIORITY[a.name] ?? 50) - (SERVER_PRIORITY[b.name] ?? 50));
        const validServers = servers.filter(s => (SERVER_PRIORITY[s.name] ?? 50) < 99);

        send(`${servers.length} server ditemukan: ${servers.map(s => s.name).join(", ")}`);
        if (validServers.length === 0) {
          send("Semua server mati!");
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", msg: "Semua server mati" })}\n\n`));
          controller.close();
          return;
        }

        send(`Cek semua server: ${validServers.map(s => s.name).join(", ")}`);

        for (const srv of validServers) {
          send(`[${srv.name}] Mencoba...`);
          const streamsBefore = allStreams.length;

          const srvPage = await browser.newPage();
          await srvPage.setViewport({ width: 1280, height: 720 });
          listenStreams(srvPage, srv.name);
          blockAds(srvPage);

          try {
            await srvPage.goto(srv.href, { waitUntil: "domcontentloaded", timeout: 30000 });
            await new Promise(r => setTimeout(r, 2500));

            const iframeSrcs: string[] = await srvPage.evaluate(() => {
              return Array.from(document.querySelectorAll("iframe"))
                .map(f => (f as HTMLIFrameElement).src || f.getAttribute("data-src") || "")
                .filter(s => s && s.length > 10 && !/google|facebook|about:blank|rpmlive|abyssplayer|abyss\.to/i.test(s));
            });
            await srvPage.close().catch(() => {});

            if (iframeSrcs.length === 0) {
              send(`[${srv.name}] Tidak ada player iframe (dead)`);
              continue;
            }

            send(`[${srv.name}] Player ditemukan, membuka iframe...`);
            
            let videoTime = 0;
            let streamFound = false;
            for (let fi = 0; fi < Math.min(iframeSrcs.length, 3) && !streamFound; fi++) {
              const ifrPage = await browser.newPage();
              listenStreams(ifrPage, srv.name);
              blockAds(ifrPage);

              try {
                send(`[${srv.name}] Coba iframe ${fi + 1}/${Math.min(iframeSrcs.length, 3)}...`);
                await ifrPage.goto(iframeSrcs[fi], { waitUntil: "domcontentloaded", timeout: 30000 });
                await new Promise(r => setTimeout(r, 4000));

                send(`[${srv.name}] Player loaded, mencoba play...`);
                await ifrPage.evaluate(() => {
                  document.querySelectorAll("video").forEach(v => { (v as HTMLVideoElement).muted = true; (v as HTMLVideoElement).play().catch(()=>{}); });
                  document.querySelectorAll("button").forEach(b => { if (b.textContent?.toLowerCase().includes("play")) b.click(); });
                  try { (window as any).jwplayer?.().play(); } catch {}
                }).catch(() => {});
                await new Promise(r => setTimeout(r, 5000));

                videoTime = await ifrPage.evaluate(() => {
                  const v = document.querySelector("video") as HTMLVideoElement;
                  return v ? v.currentTime : 0;
                });

                const newStreams = allStreams.slice(streamsBefore);
                if (newStreams.length > 0) {
                  streamFound = true;
                }
              } catch (e: any) {
                send(`[${srv.name}] Error iframe ${fi + 1}: ${e.message}`);
              }
              await ifrPage.close().catch(() => {});
            }

            const newStreams = allStreams.slice(streamsBefore);
            if (newStreams.length > 0) {
              const bestStream = newStreams[0];
              const proxiedUrl = `/api/proxy?url=${encodeURIComponent(bestStream.url)}`;
              send(`[${srv.name}] ✓ Stream ditemukan! time=${videoTime}s, qualities=${bestStream.qualities.join(", ")}`);
              workingServers.push({
                name: srv.name,
                url: proxiedUrl,
                qualities: bestStream.qualities,
                time: videoTime,
              });

              if (videoTime > 0) {
                send(`✓ ${srv.name} langsung dipakai (time=${videoTime}s)`);
                const allServerResults = workingServers.map(s => ({
                  name: s.name, url: s.url, qualities: s.qualities, time: s.time,
                }));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: "result",
                  streamUrl: proxiedUrl,
                  kind: "hls",
                  subtitles: [],
                  qualities: bestStream.qualities,
                  server: srv.name,
                  servers: allServerResults,
                })}\n\n`));
                controller.close();
                return;
              }
            } else {
              send(`[${srv.name}] Gagal - tidak ada stream`);
            }
          } catch (e: any) {
            send(`[${srv.name}] Error server: ${e.message}`);
            await srvPage.close().catch(() => {});
          }
        }

        send(`Selesai cek semua server. ${workingServers.length} server berfungsi:`);
        for (const ws of workingServers) {
          send(`  ${ws.name}: time=${ws.time}s, qualities=${ws.qualities.join(", ")}`);
        }

        if (workingServers.length === 0) {
          send("Semua server gagal!");
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", msg: "Semua server gagal" })}\n\n`));
          controller.close();
          return;
        }

        const playable = workingServers.filter(s => s.time > 0);
        const best = playable.length > 0 ? playable[0] : workingServers[0];

        send(`✓ Server terbaik: ${best.name} (time=${best.time}s)`);

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "result",
          streamUrl: best.url,
          kind: "hls",
          subtitles: [],
          qualities: best.qualities,
          server: best.name,
          servers: workingServers.map(s => ({
            name: s.name,
            url: s.url,
            qualities: s.qualities,
            time: s.time,
          })),
        })}\n\n`));
      } catch (err) {
        send(`Error: ${(err as Error).message}`);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", msg: (err as Error).message })}\n\n`));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
