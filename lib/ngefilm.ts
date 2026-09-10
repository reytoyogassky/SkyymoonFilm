const BASE = 'https://new39.ngefilm.site';

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' },
  });
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
      poster: img?.[1] || '',
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
  const t = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/i);
  meta.title = t?.[1]?.trim() || '';
  const p = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
  meta.poster = p?.[1] || '';

  const article = html.match(/entry-content[\s\S]*?<\/div>/i)?.[0] || html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html;
  const field = (label: string) => {
    const m = article.match(new RegExp('<strong[^>]*>' + label + '[^<]*</strong>\\s*([\\s\\S]*?)(?:</div>|<strong)', 'i'));
    if (m) return m[1].replace(/<[^>]+>/g, '').trim();
    const m2 = article.match(new RegExp(label + '[:\\s]*([^\\n<]+)', 'i'));
    return m2?.[1]?.trim() || '';
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

  const desc = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  meta.description = desc?.[1]?.replace(/<[^>]+>/g, '').trim() || '';

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
  const allItems: any[] = [];
  
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
