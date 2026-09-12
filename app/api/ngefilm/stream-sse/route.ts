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
export const maxDuration = 120;

function waitForStreams(allStreams: StreamInfo[], before: number, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    if (allStreams.length > before) return resolve(true);
    const check = setInterval(() => {
      if (allStreams.length > before) { clearInterval(check); resolve(true); }
    }, 150);
    setTimeout(() => { clearInterval(check); resolve(allStreams.length > before); }, timeoutMs);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

function parseEpisodeFromHTML(html: string, baseUrl: string): string | null {
  const listMatch = html.match(/<div[^>]*class="[^"]*gmr-listseries[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (listMatch) {
    const linkRegex = /<a[^>]*href="([^"]*\/eps\/[^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(listMatch[1])) !== null) {
      let href = m[1].trim();
      const name = m[2].trim();
      if (!href) continue;
      if (href.startsWith("/")) {
        try { href = new URL(href, baseUrl).href; } catch { continue; }
      }
      if (href.startsWith("http")) {
        return href;
      }
    }
  }

  const linkRegex2 = /<a[^>]*href="([^"]*\/eps\/[^"]*)"[^>]*>([^<]*)<\/a>/gi;
  let m2: RegExpExecArray | null;
  while ((m2 = linkRegex2.exec(html)) !== null) {
    let href = m2[1].trim();
    if (href.startsWith("/")) {
      try { href = new URL(href, baseUrl).href; } catch { continue; }
    }
    if (href.startsWith("http")) {
      return href;
    }
  }

  return null;
}

function parseServersFromHTML(html: string, baseUrl: string): { name: string; href: string }[] {
  const servers: { name: string; href: string }[] = [];
  const seen = new Set<string>();

  const tabMatch = html.match(/<ul[^>]*class="[^"]*muvipro-player-tabs[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
  if (tabMatch) {
    const tabHtml = tabMatch[1];
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(tabHtml)) !== null) {
      let href = m[1].trim();
      const name = m[2].trim();
      if (!name || !/server/i.test(name)) continue;
      if (href.startsWith("/")) {
        try { href = new URL(href, baseUrl).href; } catch { continue; }
      }
      if (!href.startsWith("http")) continue;
      const key = name + "|" + href;
      if (seen.has(key)) continue;
      seen.add(key);
      servers.push({ name, href });
    }
  }

  if (servers.length === 0) {
    const linkRegex = /<a[^>]*href="([^"]*\?player=\d+)"[^>]*>([^<]*)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      let href = m[1].trim();
      const name = m[2].trim();
      if (!name || !href) continue;
      if (href.startsWith("/")) {
        try { href = new URL(href, baseUrl).href; } catch { continue; }
      }
      if (!href.startsWith("http")) continue;
      const key = name + "|" + href;
      if (seen.has(key)) continue;
      seen.add(key);
      servers.push({ name, href });
    }
  }

  return servers;
}

async function fetchHtmlViaPuppeteer(url: string, send: (msg: string) => void, browser: any): Promise<string> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.setRequestInterception(true);
  page.on("request", (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());
  let html = "";
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    html = await page.evaluate(() => document.documentElement.outerHTML);
    send(`Puppeteer: ${url.substring(0, 60)}... -> ${html.length} bytes`);
  } catch (e: any) {
    send(`Puppeteer error: ${e.message}`);
  }
  await page.close().catch(() => {});
  return html;
}

function parseIframesFromHTML(html: string): string[] {
  const iframes: string[] = [];
  const regex = /<iframe[^>]*src="([^"]*)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const src = m[1].trim();
    if (src && src.length > 10 && !/google|facebook|about:blank/i.test(src)) {
      iframes.push(src);
    }
  }
  return iframes;
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
        send("Fetching halaman...");
        const baseUrl = new URL(pageUrl).origin;
        const browser = await getBrowser();
        let html = await fetchHtmlViaPuppeteer(pageUrl, send, browser);

        let servers = parseServersFromHTML(html, pageUrl);
        send(`Servers ditemukan: ${servers.length} (${servers.map(s => s.name).join(", ")})`);

        if (servers.length === 0 && !pageUrl.includes("/eps/")) {
          send("Halaman series, cari link episode...");
          const episodeUrl = parseEpisodeFromHTML(html, pageUrl);
          if (episodeUrl) {
            send(`Episode pertama: ${episodeUrl}`);
            const epHtml = await fetchHtmlViaPuppeteer(episodeUrl, send, browser);
            if (epHtml) {
              servers = parseServersFromHTML(epHtml, episodeUrl);
              send(`Episode servers: ${servers.length} (${servers.map(s => s.name).join(", ")})`);
            }
          } else {
            send("Tidak ada link episode ditemukan");
          }
        }

        if (servers.length === 0 && !pageUrl.includes("/tv/")) {
          const tvUrl = pageUrl.replace("://new39.ngefilm.site/", "://new39.ngefilm.site/tv/");
          send(`Coba /tv/ URL: ${tvUrl}`);
          const tvHtml = await fetchHtmlViaPuppeteer(tvUrl, send, browser);
          if (tvHtml) {
            servers = parseServersFromHTML(tvHtml, tvUrl);
            if (servers.length > 0) send(`TV URL berhasil: ${servers.length} servers`);
          }
        }

        if (servers.length === 0) {
          send("Tidak ada server tabs, coba extract iframe langsung...");
          const iframes = parseIframesFromHTML(html);
          send(`Iframes ditemukan: ${iframes.length}`);
          if (iframes.length > 0) {
            servers = iframes.map((href, i) => ({ name: `Server ${i + 1}`, href }));
          }
        }

        servers.sort((a, b) => (SERVER_PRIORITY[a.name] ?? 50) - (SERVER_PRIORITY[b.name] ?? 50));
        const valid = servers.filter(s => (SERVER_PRIORITY[s.name] ?? 50) < 99);
        send(`${servers.length} server: ${servers.map(s => s.name).join(", ")}`);

        if (valid.length === 0) { sendError("Semua server mati"); return; }

        for (const srv of valid) {
          send(`[${srv.name}] Coba...`);
          const before = allStreams.length;
          const serverStart = Date.now();
          const SERVER_TIMEOUT = 45000;

          const tryServer = async () => {
            const sp = await browser.newPage();
            await sp.setViewport({ width: 1280, height: 720 });
            listenStreams(sp, srv.name);
            blockAds(sp);

            try {
              await sp.goto(srv.href, { waitUntil: "domcontentloaded", timeout: 20000 });
              await new Promise(r => setTimeout(r, 3000));

              let iframes: string[] = await sp.evaluate(() => {
                return Array.from(document.querySelectorAll("iframe"))
                  .map(f => (f as HTMLIFrameElement).src || f.getAttribute("data-src") || "")
                  .filter(s => s && s.length > 10 && !/google|facebook|about:blank/i.test(s));
              }).catch(() => []);

              if (iframes.length === 0) {
                let srvHtml = "";
                try {
                  const resp = await fetch(srv.href, {
                    headers: {
                      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                      "Accept": "text/html",
                    },
                  });
                  srvHtml = await resp.text();
                } catch {}
                if (srvHtml) {
                  iframes = parseIframesFromHTML(srvHtml);
                }
              }
              await sp.close().catch(() => {});

              if (iframes.length === 0) { send(`[${srv.name}] Tidak ada iframe`); return; }

              for (let fi = 0; fi < Math.min(iframes.length, 3); fi++) {
                if (allStreams.length > before) break;
                if (Date.now() - serverStart > SERVER_TIMEOUT) { send(`[${srv.name}] Timeout!`); return; }

                const ip = await browser.newPage();
                listenStreams(ip, srv.name);
                blockAds(ip);
                try {
                  send(`[${srv.name}] iframe ${fi + 1}: ${iframes[fi].substring(0, 60)}...`);
                  await ip.goto(iframes[fi], { waitUntil: "domcontentloaded", timeout: 20000 });
                  await new Promise(r => setTimeout(r, 5000));
                  await ip.evaluate(() => {
                    document.querySelectorAll("video").forEach(v => { (v as HTMLVideoElement).muted = true; (v as HTMLVideoElement).play().catch(()=>{}); });
                    document.querySelectorAll("button").forEach(b => { if (b.textContent?.toLowerCase().includes("play")) b.click(); });
                    try { (window as any).jwplayer?.().play(); } catch {}
                    try { (window as any).videojs?.getAllPlayers?.()?.forEach((p: any) => p.play()); } catch {}
                  }).catch(() => {});

                  await waitForStreams(allStreams, before, 15000);
                } catch (e: any) { send(`[${srv.name}] Error: ${e.message}`); }
                await ip.close().catch(() => {});
              }
            } catch (e: any) { send(`[${srv.name}] Error: ${e.message}`); await sp.close().catch(() => {}); }
          };

          try {
            await withTimeout(tryServer(), SERVER_TIMEOUT);
          } catch { send(`[${srv.name}] Timeout! Skip.`); }

          if (allStreams.length > before) {
            const best = allStreams[before];
            workingServers.push({ name: srv.name, url: `/api/proxy?url=${encodeURIComponent(best.url)}`, qualities: best.qualities });
            send(`[${srv.name}] OK! ${best.qualities.join(", ")}`);
            break;
          } else {
            send(`[${srv.name}] Gagal`);
          }
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
