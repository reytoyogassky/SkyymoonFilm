const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const IDLIX_BASE = 'https://z2.idlixku.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const OUT_DIR = path.join(__dirname, '..', 'public', 'idlix-data');
const DELAY_MS = 1500;
const MAX_PAGES_PER_LIST = 50;

function curl(args) {
  return new Promise((resolve) => {
    execFile('curl', args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

async function fetchJson(url) {
  const args = [
    '-s',
    '-A', UA,
    '-H', 'Accept: application/json',
    url,
  ];
  const body = await curl(args);
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeList(sort) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES_PER_LIST; page++) {
    const url = `${IDLIX_BASE}/api/browse?page=${page}&limit=100&sort=${sort}`;
    process.stdout.write(`[${sort}] page ${page}... `);
    const data = await fetchJson(url);
    if (!data?.data || data.data.length === 0) {
      console.log('stop (empty)');
      break;
    }
    all.push(...data.data);
    console.log(`+${data.data.length} (total ${all.length})`);
    if (data.data.length < 100) break;
    await delay(DELAY_MS);
  }
  return all;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('🚀 Scraping IDLIX ke JSON\n');

  const popular = await scrapeList('popular');
  console.log(`\n✨ Popular: ${popular.length}\n`);
  await delay(DELAY_MS);

  const latest = await scrapeList('latest');
  console.log(`\n✨ Latest: ${latest.length}\n`);

  const seen = new Set();
  const merged = [];
  for (const item of [...popular, ...latest]) {
    if (!item.slug || seen.has(item.slug)) continue;
    seen.add(item.slug);
    merged.push({
      id: item.id,
      slug: item.slug,
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      releaseDate: item.releaseDate,
      firstAirDate: item.firstAirDate,
      voteAverage: item.voteAverage,
      quality: item.quality,
      country: item.country,
      runtime: item.runtime,
      genres: item.genres,
      overview: item.overview,
      contentType: item.contentType,
      isSeries: item.contentType === 'tv_series',
      numberOfSeasons: item.numberOfSeasons,
    });
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'idlix-catalog.json'),
    JSON.stringify({ items: merged, scrapedAt: new Date().toISOString(), total: merged.length }, null, 2)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'idlix-movies.json'),
    JSON.stringify(merged.filter((x) => !x.isSeries), null, 2)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'idlix-series.json'),
    JSON.stringify(merged.filter((x) => x.isSeries), null, 2)
  );

  console.log(`\n✅ Done! Total unique: ${merged.length}`);
  console.log(`   Movies: ${merged.filter((x) => !x.isSeries).length}`);
  console.log(`   Series: ${merged.filter((x) => x.isSeries).length}`);
  console.log(`\n📁 Saved to: ${OUT_DIR}`);
}

main().catch(console.error);
