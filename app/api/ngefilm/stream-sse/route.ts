import { NextRequest } from "next/server";

const AD_RE = /google|facebook|yandex|doubleclick|adsbygoogle|adsystem|analytics|beacon|gtag|metrika|adnxs|taboola|outbrain|chartbeat|hotjar|newrelic|cloudflareinsights/i;

const SERVER_PRIORITY: Record<string, number> = {
  "Server 3": 0, "Server 5": 1, "Server 4": 2,
  "Server 1": 99, "Server 2": 99,
};

const NGEFILM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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
      if (!href) continue;
      if (href.startsWith("/")) {
        try { href = new URL(href, baseUrl).href; } catch { continue; }
      }
      if (href.startsWith("http")) return href;
    }
  }

  const linkRegex2 = /<a[^>]*href="([^"]*\/eps\/[^"]*)"[^>]*>([^<]*)<\/a>/gi;
  let m2: RegExpExecArray | null;
  while ((m2 = linkRegex2.exec(html)) !== null) {
    let href = m2[1].trim();
    if (href.startsWith("/")) {
      try { href = new URL(href, baseUrl).href; } catch { continue; }
    }
    if (href.startsWith("http")) return href;
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

async function extractServersFromDOM(pg: any, baseUrl: string): Promise<{ name: string; href: string }[]> {
  return await pg.evaluate((base: string) => {
    const servers: { name: string; href: string }[] = [];
    const tabs = document.querySelectorAll(".muvipro-player-tabs a, .nav-tabs a");
    for (const a of Array.from(tabs)) {
      const name = a.textContent?.trim() || "";
      let href = a.getAttribute("href") || "";
      if (!name || !/server/i.test(name)) continue;
      if (href.startsWith("/")) {
        try { href = new URL(href, base).href; } catch { continue; }
      }
      if (!href.startsWith("http")) continue;
      servers.push({ name, href });
    }
    return servers;
  }, baseUrl).catch(() => []);
}

async function extractVideoUrlFromDOM(page: any): Promise<string | null> {
  return await page.evaluate(() => {
    const video = document.querySelector("video");
    if (video) {
      const src = video.src || video.getAttribute("src") || "";
      if (src && src.startsWith("http")) return src;
      const source = video.querySelector("source");
      if (source) {
        const s = source.src || source.getAttribute("src") || "";
        if (s && s.startsWith("http")) return s;
      }
    }
    const sources = document.querySelectorAll("source[src]");
    for (const s of sources) {
      const src = s.getAttribute("src") || "";
      if (src && src.startsWith("http") && /\.(m3u8|mp4|ts)/i.test(src)) return src;
    }
    try { const p = (window as any).jwplayer?.(); if (p) { const f = p.getPlaylistItem?.()?.file; if (f && f.startsWith("http")) return f; } } catch {}
    try { const p = (window as any).videojs?.getAllPlayers?.()?.[0]; if (p) { const s = p.src?.(); if (s && typeof s === "string" && s.startsWith("http")) return s; } } catch {}
    try { const p = (window as any).flowplayer?.(); if (p) { const s = p.video?.src; if (s && s.startsWith("http")) return s; } } catch {}
    const scripts = document.querySelectorAll("script");
    for (const sc of scripts) {
      const text = sc.textContent || "";
      const m = text.match(/(?:file|src|source|url)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i);
      if (m) return m[1];
    }
    return null;
  }).catch(() => null);
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

        // === STEP 1: Buka 1 page, extract server atau episode URL ===
        const pg = await browser.newPage();
        await pg.setViewport({ width: 1280, height: 720 });
        await pg.setUserAgent(NGEFILM_UA);
        await pg.setRequestInterception(true);
        pg.on("request", (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());

        let servers: { name: string; href: string }[] = [];

        try {
          await pg.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 15000, referer: baseUrl });
          // Tunggu server tabs muncul (max 4s, jangan lama)
          await Promise.race([
            pg.waitForSelector(".muvipro-player-tabs", { timeout: 4000 }).catch(() => {}),
            new Promise(r => setTimeout(r, 4000)),
          ]);
          servers = await extractServersFromDOM(pg, pageUrl);
          send(`Servers ditemukan: ${servers.length} (${servers.map(s => s.name).join(", ")})`);

          // === STEP 2: Kalau series overview (tidak ada server), cari episode dari page yang SAMA ===
          if (servers.length === 0 && !pageUrl.includes("/eps/")) {
            send("Halaman series, cari link episode...");
            const episodeUrl = await pg.evaluate((base: string) => {
              const list = document.querySelector(".gmr-listseries");
              if (list) {
                const link = list.querySelector('a[href*="/eps/"]');
                if (link) {
                  const href = link.getAttribute("href") || "";
                  return href.startsWith("http") ? href : new URL(href, base).href;
                }
              }
              const allLinks = document.querySelectorAll('a[href*="/eps/"]');
              if (allLinks.length > 0) {
                const href = allLinks[0].getAttribute("href") || "";
                return href.startsWith("http") ? href : new URL(href, base).href;
              }
              return null;
            }, baseUrl);

            if (episodeUrl) {
              send(`Episode pertama: ${episodeUrl}`);
              // Navigasi ke episode di page yang SAMA (buka baru page baru)
              await pg.goto(episodeUrl, { waitUntil: "domcontentloaded", timeout: 15000, referer: pageUrl });
              await Promise.race([
                pg.waitForSelector(".muvipro-player-tabs", { timeout: 4000 }).catch(() => {}),
                new Promise(r => setTimeout(r, 4000)),
              ]);
              servers = await extractServersFromDOM(pg, episodeUrl);
              send(`Episode servers: ${servers.length} (${servers.map(s => s.name).join(", ")})`);
            } else {
              send("Tidak ada link episode ditemukan");
            }
          }
        } catch (e: any) {
          send(`Page error: ${e.message}`);
        }
        await pg.close().catch(() => {});

        // === STEP 3: Fallback ke /tv/ URL ===
        if (servers.length === 0 && !pageUrl.includes("/tv/")) {
          const tvUrl = pageUrl.replace("://new39.ngefilm.site/", "://new39.ngefilm.site/tv/");
          send(`Coba /tv/ URL: ${tvUrl}`);
          const pg2 = await browser.newPage();
          await pg2.setViewport({ width: 1280, height: 720 });
          await pg2.setUserAgent(NGEFILM_UA);
          try {
            await pg2.goto(tvUrl, { waitUntil: "domcontentloaded", timeout: 15000, referer: pageUrl });
            await Promise.race([
              pg2.waitForSelector(".muvipro-player-tabs", { timeout: 3000 }).catch(() => {}),
              new Promise(r => setTimeout(r, 3000)),
            ]);
            servers = await extractServersFromDOM(pg2, tvUrl);
            if (servers.length === 0) {
              const html = await pg2.evaluate(() => document.documentElement.outerHTML);
              servers = parseServersFromHTML(html, tvUrl);
            }
            if (servers.length > 0) send(`TV URL berhasil: ${servers.length} servers`);
          } catch {}
          await pg2.close().catch(() => {});
        }

        // === STEP 4: Fallback iframe langsung ===
        if (servers.length === 0) {
          send("Tidak ada server tabs, coba extract iframe langsung...");
          const pg3 = await browser.newPage();
          await pg3.setViewport({ width: 1280, height: 720 });
          await pg3.setUserAgent(NGEFILM_UA);
          try {
            await pg3.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 15000, referer: baseUrl });
            await new Promise(r => setTimeout(r, 2000));
            const iframes = await pg3.evaluate(() => {
              return Array.from(document.querySelectorAll("iframe"))
                .map(f => (f as HTMLIFrameElement).src || f.getAttribute("data-src") || "")
                .filter(s => s && s.length > 10 && !/google|facebook|about:blank/i.test(s));
            }).catch(() => []);
            send(`Iframes ditemukan: ${iframes.length}`);
            if (iframes.length > 0) {
              servers = iframes.map((href: string, i: number) => ({ name: `Server ${i + 1}`, href }));
            }
          } catch {}
          await pg3.close().catch(() => {});
        }

        servers.sort((a, b) => (SERVER_PRIORITY[a.name] ?? 50) - (SERVER_PRIORITY[b.name] ?? 50));
        const valid = servers.filter(s => (SERVER_PRIORITY[s.name] ?? 50) < 99);
        send(`${servers.length} server: ${servers.map(s => s.name).join(", ")}`);

        if (valid.length === 0) { sendError("Semua server mati"); return; }

        // === STEP 5: Coba server, stream detection via network ===
        async function tryOneServer(srv: { name: string; href: string }, before: number, timeoutMs: number): Promise<StreamInfo | null> {
          send(`[${srv.name}] Coba...`);
          const serverStart = Date.now();
          const sp = await browser.newPage();
          await sp.setViewport({ width: 1280, height: 720 });
          await sp.setUserAgent(NGEFILM_UA);
          listenStreams(sp, srv.name);
          blockAds(sp);

          try {
            await sp.goto(srv.href, { waitUntil: "domcontentloaded", timeout: 12000, referer: pageUrl });
            await new Promise(r => setTimeout(r, 1500));

            const srvVideoUrl = await extractVideoUrlFromDOM(sp);
            if (srvVideoUrl && !allStreams.some(s => s.url === srvVideoUrl)) {
              allStreams.push({ url: srvVideoUrl, server: srv.name, qualities: parseQualities("") });
              send(`[${srv.name}] Direct video URL from DOM`);
            }

            let iframes: string[] = await sp.evaluate(() => {
              return Array.from(document.querySelectorAll("iframe"))
                .map(f => (f as HTMLIFrameElement).src || f.getAttribute("data-src") || "")
                .filter(s => s && s.length > 10 && !/google|facebook|about:blank/i.test(s));
            }).catch(() => []);

            if (iframes.length === 0) {
              const srvHtml = await sp.evaluate(() => document.documentElement.outerHTML).catch(() => "");
              if (srvHtml) iframes = parseIframesFromHTML(srvHtml);
            }
            await sp.close().catch(() => {});

            if (iframes.length === 0) { send(`[${srv.name}] Tidak ada iframe`); return null; }

            for (let fi = 0; fi < Math.min(iframes.length, 2); fi++) {
              if (allStreams.length > before) break;
              if (Date.now() - serverStart > timeoutMs) break;

              const ip = await browser.newPage();
              await ip.setViewport({ width: 1280, height: 720 });
              await ip.setUserAgent(NGEFILM_UA);
              listenStreams(ip, srv.name);
              blockAds(ip);
              try {
                send(`[${srv.name}] iframe ${fi + 1}: ${iframes[fi].substring(0, 80)}...`);
                await ip.goto(iframes[fi], { waitUntil: "domcontentloaded", timeout: 12000, referer: srv.href });
                await new Promise(r => setTimeout(r, 2000));

                const domUrl = await extractVideoUrlFromDOM(ip);
                if (domUrl && !allStreams.some(s => s.url === domUrl)) {
                  allStreams.push({ url: domUrl, server: srv.name, qualities: parseQualities("") });
                }

                if (allStreams.length <= before) {
                  await ip.evaluate(() => {
                    document.querySelectorAll("video").forEach(v => { (v as HTMLVideoElement).muted = true; (v as HTMLVideoElement).play().catch(()=>{}); });
                    document.querySelectorAll("button").forEach(b => { if (b.textContent?.toLowerCase().includes("play")) b.click(); });
                    try { (window as any).jwplayer?.().play(); } catch {}
                    try { (window as any).videojs?.getAllPlayers?.()?.forEach((p: any) => p.play()); } catch {}
                    try { (window as any).flowplayer?.().play(); } catch {}
                  }).catch(() => {});

                  await waitForStreams(allStreams, before, 6000);
                }

                if (allStreams.length <= before) {
                  const domUrl2 = await extractVideoUrlFromDOM(ip);
                  if (domUrl2 && !allStreams.some(s => s.url === domUrl2)) {
                    allStreams.push({ url: domUrl2, server: srv.name, qualities: parseQualities("") });
                  }
                }
              } catch (e: any) { send(`[${srv.name}] Error: ${e.message}`); }
              await ip.close().catch(() => {});
            }
          } catch (e: any) { send(`[${srv.name}] Error: ${e.message}`); await sp.close().catch(() => {}); }

          if (allStreams.length > before) return allStreams[before];
          return null;
        }

        const priority = valid.find(s => s.name === "Server 3");
        const rest = valid.filter(s => s.name !== "Server 3");

        if (priority) {
          const before = allStreams.length;
          const result = await tryOneServer(priority, before, 25000);
          if (result) {
            workingServers.push({ name: priority.name, url: `/api/proxy?url=${encodeURIComponent(result.url)}`, qualities: result.qualities });
            send(`[${priority.name}] OK! ${result.qualities.join(", ")}`);
          } else {
            send(`[${priority.name}] Gagal, coba server lain...`);
          }
        }

        if (workingServers.length === 0 && rest.length > 0) {
          const PARALLEL = Math.min(rest.length, 2);
          for (let batch = 0; batch < rest.length; batch += PARALLEL) {
            if (workingServers.length > 0) break;
            const chunk = rest.slice(batch, batch + PARALLEL);
            const before = allStreams.length;

            const results = await Promise.allSettled(
              chunk.map(s => tryOneServer(s, before, 18000))
            );

            for (let i = 0; i < chunk.length; i++) {
              const r = results[i];
              if (r.status === "fulfilled" && r.value) {
                workingServers.push({ name: chunk[i].name, url: `/api/proxy?url=${encodeURIComponent(r.value.url)}`, qualities: r.value.qualities });
                send(`[${chunk[i].name}] OK! ${r.value.qualities.join(", ")}`);
                break;
              } else {
                send(`[${chunk[i].name}] Gagal`);
              }
            }
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
