const BASE = 'https://new39.ngefilm.site';

/**
 * NgeFilm listings use WordPress thumbnail derivatives such as
 * `poster-152x228.jpg`. The original, higher-resolution file is available by
 * removing the `-WIDTHxHEIGHT` suffix.
 */
export function fullSizePoster(url: string): string {
  if (!url) return '';
  return url.replace(/-\d+x\d+(\.(?:jpe?g|png|webp|gif))(\?.*)?$/i, '$1$2');
}

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function extractListing(html: string) {
  const items: { title: string; url: string; poster: string; type: string; rating: string; quality: string; info: string }[] = [];
  const cards = html.match(/<article[\s\S]*?<\/article>/gi) || [];
  for (const card of cards) {
    const link = card.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
    const img = card.match(/<img[^>]*src="([^"]+)"/i);
    const titleMatch = card.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    let title = '';
    if (titleMatch) {
      const inner = titleMatch[1];
      const aText = inner.match(/<a[^>]*>([^<]+)<\/a>/i);
      title = aText?.[1]?.trim() || inner.replace(/<[^>]+>/g, '').trim();
    }
    if (!title) {
      const aTitle = card.match(/<a[^>]*title="Permalink ke:\s*([^"]+)"/i);
      title = aTitle?.[1]?.trim() || '';
    }
    if (!title) {
      const imgAlt = card.match(/<img[^>]*alt="([^"]+)"/i);
      title = imgAlt?.[1]?.trim() || '';
    }
    const rating = card.match(/class="[^"]*rating[^"]*"[^>]*>([^<]+)/i);
    const quality = card.match(/class="[^"]*quality[^"]*"[^>]*>([^<]+)/i);
    const info = card.match(/class="[^"]*post-on[^"]*"[^>]*>([^<]+)/i);
    const isSeries = (link?.[1] || '').includes('/tv/');
    items.push({
      title,
      url: link?.[1] || '',
      poster: fullSizePoster(img?.[1] || ''),
      type: isSeries ? 'series' : 'film',
      rating: rating?.[1]?.trim() || '',
      quality: quality?.[1]?.trim() || '',
      info: info?.[1]?.trim() || '',
    });
  }
  return items;
}

export function extractDetail(html: string) {
  const meta: Record<string, string> = {};
  const clean = (value?: string) =>
    (value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&#0?39;/g, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();

  const t = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  meta.title = clean(t?.[1]);

  const p =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  meta.poster = fullSizePoster(p?.[1] || '');

  // Rating is exposed through schema.org aggregateRating markup.
  const rating = html.match(/itemprop=["']ratingValue["'][^>]*>\s*([\d.,]+)/i);
  meta.rating = rating?.[1]?.replace(',', '.') || '';

  // Movie metadata lives inside the `.content-moviedata` block.
  const dataStart = html.search(/content-moviedata/i);
  const dataBlock = dataStart >= 0 ? html.slice(dataStart) : html;
  const field = (label: string) => {
    const re = new RegExp(
      `<strong[^>]*>\\s*${label}\\s*:?\\s*</strong>\\s*([\\s\\S]*?)(?=<div[^>]*class=["'][^"']*gmr-moviedata|</div>\\s*</div>|<div[^>]*class=["'][^"']*entry-|<strong)`,
      'i'
    );
    const m = dataBlock.match(re);
    return m ? clean(m[1]) : '';
  };
  meta.genre = field('Genre');
  meta.quality = field('Kualitas');
  meta.year = field('Tahun');
  meta.duration = field('Durasi');
  meta.country = field('Negara');
  meta.release = field('Rilis');
  meta.language = field('Bahasa');
  meta.director = field('Direksi');
  meta.cast = field('Pemain');
  meta.runtime = meta.duration.match(/(\d+)/)?.[1] || '';

  // Description ends before the movie metadata table.
  const desc = html.match(
    /itemprop=["']description["'][^>]*>([\s\S]*?)(?:<div[^>]*class=["'][^"']*content-moviedata|<!--\s*\.entry-content)/i
  );
  meta.description = clean(desc?.[1]);

  const servers: { name: string; href: string }[] = [];
  const tabs = html.match(/muvipro-player-tabs[\s\S]*?<\/div>/i);
  if (tabs) {
    const links = [...tabs[0].matchAll(/href="([^"]+)"[^>]*>([^<]+)/gi)];
    for (const m of links) {
      if (m[2].trim().includes('Server')) {
        servers.push({ name: m[2].trim(), href: m[1].startsWith('http') ? m[1] : BASE + m[1] });
      }
    }
  }
  meta.servers = JSON.stringify(servers);

  return meta;
}

export function extractEpisodes(html: string) {
  const eps: { number: string; title: string; url: string }[] = [];
  const list = html.match(/gmr-listseries[\s\S]*?<\/div>/i);
  if (list) {
    const links = [...list[0].matchAll(/href="([^"]+)"[^>]*>([^<]+)/gi)];
    for (const m of links) {
      if (!m[2].trim().includes('Pilih Episode')) {
        const n = m[2].trim().match(/(?:eps?|episode)\s*(\d+)/i) || m[2].trim().match(/(\d+)/);
        if (n) eps.push({
          number: n[1],
          title: m[2].trim(),
          url: m[1].startsWith('http') ? m[1] : BASE + m[1],
        });
      }
    }
  }
  return eps;
}

export async function ngefilmBrowse(page: number = 1, type: 'all' | 'film' | 'series' = 'all') {
  const allItems: { title: string; url: string; poster: string; type: string; rating: string; quality: string; info: string; source: string }[] = [];
  
  if (type === 'film' || type === 'all') {
    const url = `${BASE}/country/indonesia/page/${page}/`;
    const html = await fetchPage(url);
    const items = extractListing(html);
    allItems.push(...items.map(i => ({ ...i, source: 'ngefilm' })));
  }

  if (type === 'series' || type === 'all') {
    const baseUrl = `${BASE}/?s=&search=advanced&post_type=tv&country=indonesia`;
    const url = page > 1 ? `${BASE}/page/${page}/?s=&search=advanced&post_type=tv&country=indonesia` : baseUrl;
    const html = await fetchPage(url);
    const items = extractListing(html);
    allItems.push(...items.map(i => ({ ...i, source: 'ngefilm' })));
  }

  return allItems;
}

export async function ngefilmDetail(url: string) {
  const html = await fetchPage(url);
  const meta = extractDetail(html);
  const episodes = extractEpisodes(html);
  return { metadata: meta, episodes };
}

export async function ngefilmSearch(query: string) {
  const url = `${BASE}/?s=${encodeURIComponent(query)}&search=advanced&post_type=post&country=indonesia`;
  const html = await fetchPage(url);
  return extractListing(html);
}
