import { NextRequest } from "next/server";

const AD_RE = /google|facebook|yandex|doubleclick|adsbygoogle|adsystem|analytics|beacon|gtag|metrika|adnxs|taboola|outbrain|chartbeat|hotjar|newrelic|cloudflareinsights/i;

const SERVER_PRIORITY: Record<string, number> = {
  "Server 5": 0, "Server 4": 1, "Server 3": 2,
  "Server 1": 99, "Server 2": 99,
};

let browserInstance: any = null;

function getPuppeteerArgs() {
  const args: string[] = [
    "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
    "--disable-gpu", "--disable-extensions", "--disable-background-networking",
    "--disable-default-apps", "--disable-sync", "--disable-translate",
    "--mute-audio", "--no-first-run",
  ];
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
  const opts: any = { headless: "new", args: getPuppeteerArgs(), protocolTimeout: 60000 };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  browserInstance = await puppeteer.launch(opts);
  browserInstance.on("disconnected", () => { browserInstance = null; });
  return browserInstance;
}

interface StreamInfo { url: string; server: string; qualities: string[]; }

function parseQualities(m: string): string[] {
  const q: string[] = [];
  for (const x of m.matchAll(/RESOLUTION=(\d+x\d+)/gi)) {
    const h = x[1].split("x")[1];
    if (h) q.push(h + "p");
  }
  return [...new Set(q)].sort((a, b) => parseInt(b) - parseInt(a));
}

export const dynamic = "force-dynamic";
export const maxDuration = 90;

async function safeEval(page: any, fn: () => any, fb: any = null): Promise<any> {
  try { return await page.evaluate(fn); } catch { return fb; }
}

function waitForStreams(allStreams: StreamInfo[], before: number, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    if (allStreams.length > before) return resolve(true);
    const check = setInterval(() => {
      if (allStreams.length > before) { clearInterval(check); resolve(true); }
    }, 200);
    setTimeout(() => { clearInterval(check); resolve(allStreams.length > before); }, timeoutMs);
  });
}

export async function GET(req: NextRequest) {
  const pageUrl = req.nextUrl.searchParams.get("url");
  if (!pageUrl) return Response.json({ error: "url required" }, { status: 400 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: string) => {
        console.log(`[NGEFILM-SSE] ${msg}`);
        if (!closed) try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "log", msg })}\n\n`)); } catch {}
      };
      const sendResult = (data: any) => {
        if (!closed) try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); controller.close(); closed = true; } catch {}
      };
      const sendError = (msg: string) => { send(`Error: ${msg}`); sendResult({ type: "error", msg }); };

      const allStreams: StreamInfo[] = [];
      const workingServers: { name: string; url: string; qualities: string[] }[] = [];
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
                allStreams.push({ url: u, server: serverName, qualities: parseQualities(body || "") });
                send(`[${serverName}] Stream! ${allStreams.find(s => s.url === u)?.qualities.join(", ") || "HLS"}`);
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
        send("Browser siap, membuka halaman...");

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setRequestInterception(true);
        page.on("request", (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());

        let servers: { name: string; href: string }[] = [];
        try {
          await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await new Promise(r => setTimeout(r, 2000));
          servers = await safeEval(page, () => {
            const tabs: { name: string; href: string }[] = [];
            document.querySelectorAll(".muvipro-player-tabs a").forEach(a => {
              tabs.push({ name: a.textContent?.trim() || "", href: (a as HTMLAnchorElement).href });
            });
            return tabs;
          }, []);
        } catch (e: any) { send(`Error halaman: ${e.message}`); }
        await page.close().catch(() => {});

        if (servers.length === 0 && !pageUrl.includes("/tv/")) {
          send("Coba URL /tv/...");
          const tvUrl = pageUrl.replace("://new39.ngefilm.site/", "://new39.ngefilm.site/tv/");
          const p2 = await browser.newPage();
          await p2.setViewport({ width: 1280, height: 720 });
          await p2.setRequestInterception(true);
          p2.on("request", (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());
          try {
            await p2.goto(tvUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
            await new Promise(r => setTimeout(r, 2000));
            servers = await safeEval(p2, () => {
              const tabs: { name: string; href: string }[] = [];
              document.querySelectorAll(".muvipro-player-tabs a").forEach(a => {
                tabs.push({ name: a.textContent?.trim() || "", href: (a as HTMLAnchorElement).href });
              });
              return tabs;
            }, []);
            if (servers.length > 0) send("URL /tv/ berhasil!");
          } catch {}
          await p2.close().catch(() => {});
        }

        servers.sort((a, b) => (SERVER_PRIORITY[a.name] ?? 50) - (SERVER_PRIORITY[b.name] ?? 50));
        const valid = servers.filter(s => (SERVER_PRIORITY[s.name] ?? 50) < 99);
        send(`${servers.length} server: ${servers.map(s => s.name).join(", ")}`);

        if (valid.length === 0) { sendError("Semua server mati"); return; }

        for (const srv of valid) {
          send(`[${srv.name}] Coba...`);
          const before = allStreams.length;
          const sp = await browser.newPage();
          await sp.setViewport({ width: 1280, height: 720 });
          listenStreams(sp, srv.name);
          blockAds(sp);

          try {
            await sp.goto(srv.href, { waitUntil: "domcontentloaded", timeout: 15000 });
            await new Promise(r => setTimeout(r, 1500));

            const iframes: string[] = await safeEval(sp, () => {
              return Array.from(document.querySelectorAll("iframe"))
                .map(f => (f as HTMLIFrameElement).src || f.getAttribute("data-src") || "")
                .filter(s => s && s.length > 10 && !/google|facebook|about:blank|rpmlive|abyssplayer|abyss\.to/i.test(s));
            }, []);
            await sp.close().catch(() => {});

            if (iframes.length === 0) { send(`[${srv.name}] Tidak ada iframe`); continue; }

            for (let fi = 0; fi < Math.min(iframes.length, 2); fi++) {
              if (allStreams.length > before) break;
              const ip = await browser.newPage();
              listenStreams(ip, srv.name);
              blockAds(ip);
              try {
                send(`[${srv.name}] iframe ${fi + 1}/${Math.min(iframes.length, 2)}...`);
                await ip.goto(iframes[fi], { waitUntil: "domcontentloaded", timeout: 15000 });
                await new Promise(r => setTimeout(r, 2000));
                await ip.evaluate(() => {
                  document.querySelectorAll("video").forEach(v => { (v as HTMLVideoElement).muted = true; (v as HTMLVideoElement).play().catch(()=>{}); });
                  document.querySelectorAll("button").forEach(b => { if (b.textContent?.toLowerCase().includes("play")) b.click(); });
                  try { (window as any).jwplayer?.().play(); } catch {}
                }).catch(() => {});

                await waitForStreams(allStreams, before, 6000);
              } catch (e: any) { send(`[${srv.name}] Error: ${e.message}`); }
              await ip.close().catch(() => {});
            }

            if (allStreams.length > before) {
              const best = allStreams[before];
              workingServers.push({ name: srv.name, url: `/api/proxy?url=${encodeURIComponent(best.url)}`, qualities: best.qualities });
              send(`[${srv.name}] OK! ${best.qualities.join(", ")}`);
              break;
            } else {
              send(`[${srv.name}] Gagal`);
            }
          } catch (e: any) { send(`[${srv.name}] Error: ${e.message}`); await sp.close().catch(() => {}); }
        }

        if (workingServers.length === 0) { sendError("Semua server gagal"); return; }
        const best = workingServers[0];
        sendResult({
          type: "result", streamUrl: best.url, kind: "hls", subtitles: [],
          qualities: best.qualities, server: best.name,
          servers: workingServers.map(s => ({ name: s.name, url: s.url, qualities: s.qualities })),
        });
      } catch (err) { sendError((err as Error).message); }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive" },
  });
}
