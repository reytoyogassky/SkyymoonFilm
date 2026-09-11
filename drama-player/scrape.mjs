import { writeFileSync } from "fs";

const BASE = "https://netshort.com";
const LOCALE = "id";
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en;q=0.7",
};

let count = 0;
async function fetchPage(url) {
  count++;
  if (count % 50 === 0) console.log(`  ${count} requests...`);
  try {
    const res = await fetch(url, { headers: H, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function extractRsc(html) {
  const pat = /self\.__next_f\.push\(\[(\d+),"((?:[^"\\]|\\.)*)"\]\)/g;
  const out = [];
  let m;
  while ((m = pat.exec(html)) !== null) out.push(m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  return out;
}

function extractArray(html, key) {
  const results = [];
  const seen = new Set();
  for (const c of extractRsc(html)) {
    const idx = c.indexOf(`"${key}":[`);
    if (idx === -1) continue;
    const s = idx + `"${key}":`.length + 1;
    let depth = 0, os = -1;
    for (let i = s; i < c.length; i++) {
      const ch = c[i];
      if (ch === "{") { if (!depth) os = i; depth++; }
      else if (ch === "}") {
        depth--;
        if (!depth && os >= 0) {
          try {
            const o = JSON.parse(c.substring(os, i + 1));
            const id = o.shortPlayId || o.episodeId;
            if (id && !seen.has(id)) { seen.add(id); results.push(o); }
          } catch {}
          os = -1;
        }
      } else if (ch === '"' && depth > 0) {
        i++;
        while (i < c.length) {
          if (c[i] === "\\") { i += 2; continue; }
          if (c[i] === '"') break;
          i++;
        }
      }
    }
  }
  return results;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const totalPages = Math.ceil(4920 / 24);
  console.log(`Scraping ${totalPages} pages...`);

  const all = [];
  const seen = new Set();

  for (let batch = 0; batch < totalPages; batch += 10) {
    const end = Math.min(batch + 10, totalPages);
    const promises = [];
    for (let p = batch + 1; p <= end; p++) {
      const url = p === 1
        ? `${BASE}/${LOCALE}/drama/all-plots`
        : `${BASE}/${LOCALE}/drama/all-plots/page/${p}`;
      promises.push(fetchPage(url).then(h => ({ h })));
    }
    const results = await Promise.all(promises);
    let add = 0;
    for (const { h } of results) {
      if (!h) continue;
      for (const d of extractArray(h, "videoList")) {
        const sid = d.shortPlayId;
        if (sid && !seen.has(sid)) { seen.add(sid); all.push(d); add++; }
      }
    }
    console.log(`  Batch ${Math.floor(batch/10)+1}/${Math.ceil(totalPages/10)}: +${add} = ${all.length}`);
    await sleep(150);
  }

  console.log(`\nTotal: ${all.length} dramas`);

  const out = { scrape_date: new Date().toISOString(), total: all.length, dramas: all };
  writeFileSync("D:/gabut/film/drama-player/public/data.json", JSON.stringify(out), "utf-8");
  console.log(`Saved to public/data.json`);
}

main().catch(console.error);
