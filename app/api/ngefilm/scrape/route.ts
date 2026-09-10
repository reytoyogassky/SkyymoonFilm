import { NextRequest } from 'next/server';

const AD_RE = /google|facebook|yandex|doubleclick|adsbygoogle|adsystem|analytics|beacon|gtag|metrika|adnxs|taboola|outbrain|chartbeat|hotjar|newrelic|cloudflareinsights/i;

const SERVER_PRIORITY: Record<string, number> = {
  'Server 5': 0,
  'Server 4': 1,
  'Server 3': 2,
  'Server 1': 99,
  'Server 2': 99,
};

let browserInstance: any = null;

function getPuppeteerArgs() {
  const args: string[] = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
         '--disable-extensions', '--disable-background-networking', '--disable-default-apps',
         '--disable-sync', '--disable-translate', '--mute-audio', '--no-first-run'];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    args.push('--single-process', '--no-zygote', '--disable-accelerated-2d-canvas',
              '--disable-gl-drawing-for-tests', '--disable-features=VizDisplayCompositor',
              '--js-flags=--max-old-space-size=256');
  }
  return args;
}

async function getBrowser() {
  if (browserInstance && browserInstance.connected) return browserInstance;
  const puppeteer = (await import('puppeteer')).default;
  const launchOptions: any = { headless: 'new', args: getPuppeteerArgs(), protocolTimeout: 60000 };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  browserInstance = await puppeteer.launch(launchOptions);
  return browserInstance;
}

interface StreamInfo { url: string; manifest: string | null; server: string; qualities: string[]; }

function parseQualities(manifest: string): string[] {
  const qualities: string[] = [];
  const resMatches = manifest.matchAll(/RESOLUTION=(\d+x\d+)/gi);
  for (const m of resMatches) {
    const h = m[1].split('x')[1];
    if (h) qualities.push(h + 'p');
  }
  return [...new Set(qualities)].sort((a, b) => parseInt(b) - parseInt(a));
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const pageUrl = req.nextUrl.searchParams.get('url');
  if (!pageUrl) {
    return new Response(JSON.stringify({ streams: [], error: 'Missing url' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const allStreams: StreamInfo[] = [];
      const seen = new Set<string>();
      const slug = pageUrl.split('/').filter(Boolean).pop();

      send('log', { msg: `[${slug}] Mulai scraping...` });

      function listenStreams(pg: any, serverName: string) {
        pg.on('response', async (resp: any) => {
          try {
            const u = resp.url();
            const ct = resp.headers()['content-type'] || '';
            if (AD_RE.test(u)) return;
            if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.ts') ||
                u.includes('master.') || u.includes('/hlsmod/') || u.includes('hls3/') ||
                u.includes('hls4/') || ct.includes('mpegurl') || ct.includes('video/mp4')) {
              const key = u.split('?')[0];
              if (!seen.has(key)) {
                seen.add(key);
                let body: string | null = null;
                try { body = await resp.text(); } catch {}
                const qualities = parseQualities(body || '');
                allStreams.push({ url: u, manifest: body?.substring(0, 2000) || null, server: serverName, qualities });
                send('log', { msg: `[${serverName}] Stream ditemukan! ${qualities.length ? qualities.join(', ') : 'HLS'}`, type: 'success' });
              }
            }
          } catch {}
        });
      }

      function blockAds(pg: any) {
        pg.setRequestInterception(true);
        pg.on('request', (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());
      }

      try {
        const browser = await getBrowser();
        send('log', { msg: 'Browser siap' });

        send('log', { msg: `Loading halaman...` });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setRequestInterception(true);
        page.on('request', (r: any) => AD_RE.test(r.url()) ? r.abort() : r.continue());

        let servers: { name: string; href: string }[] = [];
        try {
          await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
          await new Promise((r: any) => setTimeout(r, 1500));
          servers = await page.evaluate(() => {
            const tabs: { name: string; href: string }[] = [];
            document.querySelectorAll('.muvipro-player-tabs a').forEach(a => {
              tabs.push({ name: a.textContent?.trim() || '', href: (a as HTMLAnchorElement).href });
            });
            return tabs;
          });
        } catch {}
        await page.close().catch(() => {});

        servers.sort((a, b) => {
          const pa = SERVER_PRIORITY[a.name] ?? 50;
          const pb = SERVER_PRIORITY[b.name] ?? 50;
          return pa - pb;
        });

        send('log', { msg: `${servers.length} server ditemukan: ${servers.map(s => s.name).join(', ')}` });
        send('servers', { servers: servers.map(s => s.name) });

        for (const srv of servers) {
          if ((SERVER_PRIORITY[srv.name] ?? 50) >= 99) {
            send('log', { msg: `[${srv.name}] Skip (server mati)` });
            send('server_status', { server: srv.name, status: 'skipped' });
            continue;
          }

          send('log', { msg: `[${srv.name}] Mencoba...` });
          send('server_status', { server: srv.name, status: 'trying' });

          const srvPage = await browser.newPage();
          await srvPage.setViewport({ width: 1280, height: 720 });
          listenStreams(srvPage, srv.name);
          blockAds(srvPage);

          try {
            await srvPage.goto(srv.href, { waitUntil: 'networkidle2', timeout: 15000 });
            await new Promise((r: any) => setTimeout(r, 1500));

            const iframeSrcs: string[] = await srvPage.evaluate(() => {
              return Array.from(document.querySelectorAll('iframe'))
                .map(f => (f as HTMLIFrameElement).src || f.getAttribute('data-src') || '')
                .filter(s => s && !/google|facebook|about:blank|uploads\//.test(s) && s.length > 10);
            });

            const liveIframes = iframeSrcs.filter((s: string) => !/rpmlive|abyssplayer|abyss\.to/i.test(s));

            if (liveIframes.length === 0) {
              send('log', { msg: `[${srv.name}] Tidak ada player iframe (dead)` });
              send('server_status', { server: srv.name, status: 'dead' });
              await srvPage.close().catch(() => {});
              continue;
            }

            send('log', { msg: `[${srv.name}] Player ditemukan, mengikuti iframe...` });

            const src = liveIframes[0];
            const ifrPage = await browser.newPage();
            listenStreams(ifrPage, srv.name);
            blockAds(ifrPage);

            try {
              await ifrPage.goto(src, { waitUntil: 'networkidle2', timeout: 15000 });
              await new Promise((r: any) => setTimeout(r, 2000));

              send('log', { msg: `[${srv.name}] Player loaded, mencoba play...` });

              await ifrPage.evaluate(() => {
                document.querySelectorAll('video').forEach(v => { (v as HTMLVideoElement).muted = true; (v as HTMLVideoElement).play().catch(()=>{}); });
                document.querySelectorAll('button').forEach(b => { if (b.textContent?.toLowerCase().includes('play')) b.click(); });
                try { (window as any).jwplayer?.().play(); } catch {}
              }).catch(() => {});

              await new Promise((r: any) => setTimeout(r, 3000));
            } catch (e: any) {
              send('log', { msg: `[${srv.name}] Error: ${e.message}` });
            }
            await ifrPage.close().catch(() => {});
          } catch (e: any) {
            send('log', { msg: `[${srv.name}] Error: ${e.message}` });
          }
          await srvPage.close().catch(() => {});

          if (allStreams.length > 0) {
            send('log', { msg: `[${srv.name}] ✓ BERHASIL! ${allStreams.length} stream`, type: 'success' });
            send('server_status', { server: srv.name, status: 'success' });
          } else {
            send('log', { msg: `[${srv.name}] Gagal, coba server berikutnya...` });
            send('server_status', { server: srv.name, status: 'failed' });
          }
        }

        if (allStreams.length === 0) {
          send('log', { msg: 'Semua server gagal', type: 'error' });
        }

        send('result', { streams: allStreams });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Scrape error';
        send('log', { msg: `Error: ${msg}`, type: 'error' });
        send('result', { streams: [], error: msg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
