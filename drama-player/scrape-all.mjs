import { writeFileSync } from "fs";

const BASE = "https://netshort.com";
const LOCALE = "id";
const H = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en;q=0.7",
};

let fetchCount = 0;

async function fetchPage(url) {
  fetchCount++;
  if (fetchCount % 100 === 0) console.log(`  ... ${fetchCount} requests`);
  try {
    const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractRsc(html) {
  const pat = /self\.__next_f\.push\(\[(\d+),"((?:[^"\\]|\\.)*)"\]\)/g;
  const out = [];
  let m;
  while ((m = pat.exec(html)) !== null) {
    out.push(m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  }
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
            const obj = JSON.parse(c.substring(os, i + 1));
            const id = obj.shortPlayId || obj.episodeId || obj.episodeNo;
            if (id && !seen.has(id)) { seen.add(id); results.push(obj); }
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

function extractStream(html) {
  for (const c of extractRsc(html)) {
    let m = c.match(
      /(https?:\/\/cfcdn\.netshort\.com\/[^\s"<>]+?\\u0026mime_type=video_mp4[^\s"<>]+)/
    );
    if (m) return m[1].replace(/\\u0026/g, "&").replace(/\\+$/, "");
    m = c.match(
      /(https?:\/\/cfcdn\.netshort\.com\/[^\s"<>]+?&mime_type=video_mp4[^\s"<>]*)/
    );
    if (m) return m[1];
    m = c.match(
      /(https?:\/\/cfcdn\.netshort\.com\/[^\s"<>]+?auth_key=[^\s"<>]+)/
    );
    if (m) return m[1].replace(/\\u0026/g, "&");
  }
  return null;
}

function extractSubs(html) {
  const subs = [];
  for (const c of extractRsc(html)) {
    const idx = c.indexOf('"subtitleList":[');
    if (idx === -1) continue;
    const s = idx + '"subtitleList":['.length;
    let depth = 0, os = -1;
    for (let j = s; j < c.length; j++) {
      const ch = c[j];
      if (ch === "{") { if (!depth) os = j; depth++; }
      else if (ch === "}") {
        depth--;
        if (!depth && os >= 0) {
          try {
            const sub = JSON.parse(c.substring(os, j + 1));
            const url = (sub.url || "").replace(/\\u0026/g, "&");
            if (url.includes("text_plain")) {
              subs.push({ url, language: sub.subtitleLanguage || "" });
            }
          } catch {}
          os = -1;
        }
      } else if (ch === '"' && depth > 0) {
        j++;
        while (j < c.length) {
          if (c[j] === "\\") { j += 2; continue; }
          if (c[j] === '"') break;
          j++;
        }
      }
    }
  }
  return subs;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const totalPages = Math.ceil(4920 / 24);

  console.log(`\n========================================`);
  console.log(`NetShort FULL SCRAPER`);
  console.log(`~4920 dramas, ${totalPages} pages`);
  console.log(`========================================\n`);

  // STEP 1: ALL listings
  console.log("STEP 1: Drama listings...\n");
  const allDramas = [];
  const seenIds = new Set();

  for (let batch = 0; batch < totalPages; batch += 10) {
    const end = Math.min(batch + 10, totalPages);
    const promises = [];
    for (let p = batch + 1; p <= end; p++) {
      const url = p === 1
        ? `${BASE}/${LOCALE}/drama/all-plots`
        : `${BASE}/${LOCALE}/drama/all-plots/page/${p}`;
      promises.push(fetchPage(url).then(h => ({ page: p, html: h })));
    }
    const results = await Promise.all(promises);
    let add = 0;
    for (const { html } of results) {
      if (!html) continue;
      for (const d of extractArray(html, "videoList")) {
        const sid = d.shortPlayId;
        if (sid && !seenIds.has(sid)) { seenIds.add(sid); allDramas.push(d); add++; }
      }
    }
    console.log(`  Batch ${Math.floor(batch/10)+1}: +${add} = ${allDramas.length}`);
    await sleep(200);
  }

  console.log(`\n  Total: ${allDramas.length} dramas\n`);

  // STEP 2: Stream URLs
  console.log("STEP 2: Stream URLs + subtitles...\n");
  let ok = 0, fail = 0;

  for (let i = 0; i < allDramas.length; i++) {
    const d = allDramas[i];
    const epUrl = d.fullEpisodeNameUrl || d.shortPlayNameUrl || "";
    if (!epUrl) { fail++; continue; }

    const baseEp = epUrl.replace("/full-episodes/", "/episode/");
    const html = await fetchPage(`${BASE}${baseEp}`);

    if (!html) { fail++; continue; }

    d.stream_url = extractStream(html);
    d.subtitles = extractSubs(html);

    if (d.stream_url) ok++; else fail++;

    if ((i + 1) % 100 === 0) {
      console.log(`  [${i + 1}/${allDramas.length}] OK: ${ok} | FAIL: ${fail}`);
    }
    if ((i + 1) % 10 === 0) await sleep(50);
  }

  console.log(`\n  Stream OK: ${ok} | FAIL: ${fail}\n`);

  // STEP 3: Save
  const out = {
    scrape_date: new Date().toISOString(),
    source: "netshort.com",
    total: allDramas.length,
    with_stream: ok,
    dramas: allDramas,
  };

  const path = "D:/gabut/film/drama-player/public/data.json";
  writeFileSync(path, JSON.stringify(out), "utf-8");
  const mb = (JSON.stringify(out).length / 1024 / 1024).toFixed(1);
  console.log(`Saved: ${path} (${mb} MB)`);
  console.log(`DONE!`);
}

main().catch(console.error);
