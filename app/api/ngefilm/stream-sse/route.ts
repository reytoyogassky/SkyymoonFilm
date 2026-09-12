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
        let html = "";
        try {
          const resp = await fetch(pageUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            },
          });
          html = await resp.text();
          send(`HTML fetched: ${html.length} bytes`);
        } catch (e: any) {
          send(`Fetch error: ${e.message}, trying Puppeteer...`);
        }

        if (!html || html.length < 1000) {
          send("Fetching via Puppeteer...");
          const browser = await getBrowser();
          const page = await browser.newPage();
          await page.setViewport({ width: 1280, height: 720 });
          await page.setRequestInterception(true);
          page.on("request", (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());
          try {
            await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
            await new Promise(r => setTimeout(r, 3000));
            html = await page.evaluate(() => document.documentElement.outerHTML);
            send(`Puppeteer HTML: ${html.length} bytes`);
          } catch (e: any) {
            send(`Puppeteer error: ${e.message}`);
          }
          await page.close().catch(() => {});
        }

        let servers = parseServersFromHTML(html, pageUrl);
        send(`Servers ditemukan: ${servers.length} (${servers.map(s => s.name).join(", ")})`);

        if (servers.length === 0 && !pageUrl.includes("/tv/")) {
          const tvUrl = pageUrl.replace("://new39.ngefilm.site/", "://new39.ngefilm.site/tv/");
          send(`Coba /tv/ URL: ${tvUrl}`);
          try {
            const resp = await fetch(tvUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              },
            });
            const tvHtml = await resp.text();
            servers = parseServersFromHTML(tvHtml, tvUrl);
            if (servers.length > 0) send(`TV URL berhasil: ${servers.length} servers`);
          } catch {}
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

        const browser = await getBrowser();

        for (const srv of valid) {
          send(`[${srv.name}] Coba...`);
          const before = allStreams.length;
          const serverStart = Date.now();
          const SERVER_TIMEOUT = 20000;

          const tryServer = async () => {
            const sp = await browser.newPage();
            await sp.setViewport({ width: 1280, height: 720 });
            listenStreams(sp, srv.name);
            blockAds(sp);

            try {
              await sp.goto(srv.href, { waitUntil: "domcontentloaded", timeout: 15000 });
              await new Promise(r => setTimeout(r, 2000));

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

              for (let fi = 0; fi < Math.min(iframes.length, 2); fi++) {
                if (allStreams.length > before) break;
                if (Date.now() - serverStart > SERVER_TIMEOUT) { send(`[${srv.name}] Timeout!`); return; }

                const ip = await browser.newPage();
                listenStreams(ip, srv.name);
                blockAds(ip);
                try {
                  send(`[${srv.name}] iframe ${fi + 1}: ${iframes[fi].substring(0, 60)}...`);
                  await ip.goto(iframes[fi], { waitUntil: "domcontentloaded", timeout: 12000 });
                  await new Promise(r => setTimeout(r, 3000));
                  await ip.evaluate(() => {
                    document.querySelectorAll("video").forEach(v => { (v as HTMLVideoElement).muted = true; (v as HTMLVideoElement).play().catch(()=>{}); });
                    document.querySelectorAll("button").forEach(b => { if (b.textContent?.toLowerCase().includes("play")) b.click(); });
                    try { (window as any).jwplayer?.().play(); } catch {}
                  }).catch(() => {});

                  await waitForStreams(allStreams, before, 10000);
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
