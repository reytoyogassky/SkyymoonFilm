const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const IDLIX_BASE = 'https://z2.idlixku.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DELAY_MS = 2000;
const MAX_PAGES = 30;

function curl(args, timeout = 25000) {
  return new Promise((resolve) => {
    execFile('curl', ['--max-time', String(timeout / 1000), ...args], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

async function get(url, referer) {
  const args = ['-s', '-A', UA, '-H', 'Accept: application/json'];
  if (referer) args.push('-H', `Referer: ${referer}`);
  args.push(url);
  const body = await curl(args);
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

async function post(url, referer, body) {
  const args = [
    '-s', '-A', UA,
    '-H', 'Accept: application/json',
    '-H', 'Content-Type: application/json',
    '-H', `Origin: ${IDLIX_BASE}`,
    '-H', `Referer: ${referer}`,
    '-X', 'POST',
    '-d', JSON.stringify(body),
    url,
  ];
  const out = await curl(args);
  if (!out) return null;
  try { return JSON.parse(out); } catch { return null; }
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeStream(uuid, type, referer) {
  const playInfo = type === 'movie'
    ? await get(`${IDLIX_BASE}/api/watch/play-info/movie/${uuid}`, referer)
    : await get(`${IDLIX_BASE}/api/watch/play-info/episode/${uuid}`, referer);

  if (!playInfo || playInfo.kind !== 'gate') return null;

  const gateToken = playInfo.gateToken;
  const unlockAt = Number(playInfo.unlockAt ?? 0);
  const wait = Math.max(0, unlockAt - Date.now()) + 500;

  if (wait > 0 && wait < 30000) await delay(wait);

  let claim = await post(`${IDLIX_BASE}/api/watch/session/claim`, referer, { gateToken });
  let attempts = 0;
  while (claim?.kind === 'pending' && attempts < 4) {
    const remaining = Math.max(0, Number(claim.remainingMs ?? 0));
    await delay(Math.min(remaining + 200, 5000));
    claim = await post(`${IDLIX_BASE}/api/watch/session/claim`, referer, { gateToken });
    attempts++;
  }

  if (!claim || claim.kind !== 'ready' && !claim.claim) return null;
  if (!claim.claim || !claim.redeemUrl) return null;

  // redeem (POST ke external domain pakai MOBILE_UA)
  const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';
  const redeem = await new Promise((resolve) => {
    execFile('curl', [
      '--max-time', '20',
      '-s',
      '-A', MOBILE_UA,
      '-H', 'accept: */*',
      '-H', 'content-type: text/plain',
      '-H', `origin: ${IDLIX_BASE}`,
      '-H', `referer: ${IDLIX_BASE}/`,
      '-H', 'sec-ch-ua: "Not/A)Brand";v="99", "Chromium";v="148"',
      '-H', 'sec-ch-ua-mobile: ?1',
      '-H', 'sec-ch-ua-platform: "Android"',
      '-H', 'sec-fetch-dest: empty',
      '-H', 'sec-fetch-mode: cors',
      '-H', 'sec-fetch-site: cross-site',
      '-X', 'POST',
      '-d', JSON.stringify({ claim: claim.claim }),
      claim.redeemUrl,
    ], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });

  if (!redeem || redeem.code !== 'ok' || !redeem.url) return null;

  return {
    streamUrl: redeem.url,
    expiresAt: (Number(redeem.expiresAt ?? 0) || Math.floor(Date.now() / 1000) + 7200) * 1000,
    videoId: redeem.videoId ?? claim.videoId,
    title: claim.title,
    maxHeight: redeem.maxHeight ?? claim.maxHeight ?? playInfo.maxHeight,
    subtitles: Array.isArray(redeem.subtitles) ? redeem.subtitles.map((s) => ({
      lang: s.lang ?? '',
      label: s.label ?? '',
      url: s.path ?? '',
    })) : [],
  };
}

async function scrapeMovie(slug) {
  const detail = await get(`${IDLIX_BASE}/api/movies/${slug}`, `${IDLIX_BASE}/movie/${slug}`);
  if (!detail?.id) return null;
  try {
    const stream = await scrapeStream(detail.id, 'movie', `${IDLIX_BASE}/movie/${slug}`);
    return { ...detail, stream };
  } catch (e) {
    return { ...detail, stream: null, error: e.message };
  }
}

async function scrapeSeries(slug) {
  const detail = await get(`${IDLIX_BASE}/api/series/${slug}`, `${IDLIX_BASE}/series/${slug}`);
  if (!detail?.id) return null;
  const episodes = [];
  const seasons = Array.isArray(detail.seasons) ? detail.seasons : [];
  for (const s of seasons) {
    const seasonData = await get(`${IDLIX_BASE}/api/series/${slug}/season/${s.seasonNumber}`, `${IDLIX_BASE}/series/${slug}`);
    const eps = seasonData?.season?.episodes ?? [];
    for (const ep of eps.filter((e) => e.hasVideo !== false)) {
      try {
        const stream = await scrapeStream(ep.id, 'episode', `${IDLIX_BASE}/series/${slug}`);
        episodes.push({ ...ep, stream });
        await delay(500);
      } catch (e) {
        episodes.push({ ...ep, stream: null });
      }
    }
  }
  return { ...detail, episodes };
}

async function main() {
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'idlix-data', 'idlix-catalog.json'), 'utf8'));
  const outDir = path.join(__dirname, '..', 'public', 'idlix-data', 'streams');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const items = cat.items;
  console.log(`🚀 Scraping streams for ${items.length} items\n`);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const safe = it.slug.replace(/[^a-z0-9-_]/gi, '_');
    const outFile = path.join(outDir, `${safe}.json`);
    if (fs.existsSync(outFile)) {
      process.stdout.write(`[${i+1}/${items.length}] ${it.slug} - cached\n`);
      continue;
    }
    process.stdout.write(`[${i+1}/${items.length}] ${it.slug} - scraping... `);
    try {
      const data = it.isSeries ? await scrapeSeries(it.slug) : await scrapeMovie(it.slug);
      fs.writeFileSync(outFile, JSON.stringify({ slug: it.slug, isSeries: it.isSeries, scrapedAt: new Date().toISOString(), data }, null, 2));
      const hasStream = data?.stream || (data?.episodes && data.episodes.some((e) => e.stream));
      console.log(hasStream ? '✅' : '❌ no stream');
    } catch (e) {
      console.log(`❌ ${e.message}`);
      fs.writeFileSync(outFile, JSON.stringify({ slug: it.slug, error: e.message }, null, 2));
    }
    await delay(DELAY_MS);
  }

  console.log(`\n✅ Done! Saved to: ${outDir}`);
}

main().catch(console.error);
