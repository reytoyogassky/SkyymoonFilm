#!/usr/bin/env python3
"""
NetShort Drama Scraper - FINAL v2
Scrapes: Drama listings, Episodes, MP4 Stream URLs
"""

import requests
import json
import re
import time
import os
from datetime import datetime

BASE_URL = "https://netshort.com"
LOCALE = "id"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en;q=0.7",
}
OUTPUT_DIR = "D:/gabut/film/netshort-scraper/output"
DELAY = 1.0


def ensure_dir():
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def fetch(url):
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"  [ERR] {e}")
        return None


def extract_rsc(html):
    pattern = r'self\.__next_f\.push\(\[(\d+),"((?:[^"\\]|\\.)*)"\]\)'
    return [c.replace('\\"', '"').replace('\\\\', '\\') for _, c in re.findall(pattern, html)]


def extract_dramas(html):
    dramas, seen = [], set()
    for content in extract_rsc(html):
        idx = content.find('"videoList":[')
        if idx == -1:
            continue
        start = idx + len('"videoList":[')
        depth, obj_start, i = 0, -1, start
        while i < len(content):
            c = content[i]
            if c == '{':
                if depth == 0:
                    obj_start = i
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0 and obj_start >= 0:
                    try:
                        obj = json.loads(content[obj_start:i+1])
                        sid = obj.get('shortPlayId')
                        if sid and sid not in seen:
                            seen.add(sid)
                            dramas.append(obj)
                    except:
                        pass
                    obj_start = -1
            elif c == '"' and depth > 0:
                i += 1
                while i < len(content):
                    if content[i] == '\\':
                        i += 2
                        continue
                    if content[i] == '"':
                        break
                    i += 1
            i += 1
    return dramas


def extract_episodes(html):
    episodes, seen = [], set()
    for content in extract_rsc(html):
        idx = content.find('"episodeList":[')
        if idx == -1:
            continue
        start = idx + len('"episodeList":[')
        depth, obj_start, i = 0, -1, start
        while i < len(content):
            c = content[i]
            if c == '{':
                if depth == 0:
                    obj_start = i
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0 and obj_start >= 0:
                    try:
                        obj = json.loads(content[obj_start:i+1])
                        eid = obj.get('episodeId') or obj.get('episodeNo')
                        if eid and eid not in seen:
                            seen.add(eid)
                            episodes.append(obj)
                    except:
                        pass
                    obj_start = -1
            elif c == '"' and depth > 0:
                i += 1
                while i < len(content):
                    if content[i] == '\\':
                        i += 2
                        continue
                    if content[i] == '"':
                        break
                    i += 1
            i += 1
    return episodes


def extract_stream_url(html):
    """Extract MP4 stream URL from episode page."""
    # Pattern: cfcdn URL with mime_type=video_mp4
    pattern = r'(https?://cfcdn\.netshort\.com/[^\s"<>]+?\\u0026mime_type=video_mp4[^\s"<>]+)'
    matches = re.findall(pattern, html)

    for raw in matches:
        cleaned = raw.replace('\\u0026', '&').rstrip('\\')
        return cleaned

    # Fallback: any cfcdn URL with auth_key
    cfcdn_pattern = r'(https?://cfcdn\.netshort\.com/[^\s"<>\\]+?auth_key=[^\s"<>\\]+)'
    cfcdn_matches = re.findall(cfcdn_pattern, html)
    if cfcdn_matches:
        return cfcdn_matches[0].replace('\\u0026', '&')

    return None


def get_episode_base_url(full_episode_url):
    """
    Convert full-episodes URL to episode base URL (without -ep-X suffix).
    /id/full-episodes/slug-ID -> /id/episode/slug-ID
    """
    # /id/full-episodes/slug-ID -> /id/episode/slug-ID
    return full_episode_url.replace('/full-episodes/', '/episode/')


def scrape_listings(pages=3):
    print("=" * 60)
    print("NETSHORT SCRAPER - FINAL v2")
    print("=" * 60)
    print()

    all_dramas = []
    for page in range(1, pages + 1):
        url = f"{BASE_URL}/{LOCALE}/drama/all-plots" if page == 1 else f"{BASE_URL}/{LOCALE}/drama/all-plots/page/{page}"
        print(f"[PAGE {page}] {url}")
        html = fetch(url)
        if not html:
            continue
        dramas = extract_dramas(html)
        for d in dramas:
            if d.get('shortPlayId') not in [x.get('shortPlayId') for x in all_dramas]:
                all_dramas.append(d)
        print(f"  -> {len(dramas)} dramas")
        time.sleep(DELAY)

    print(f"\nTotal: {len(all_dramas)} dramas\n")
    return all_dramas


def scrape_episodes(drama):
    url_path = drama.get('fullEpisodeNameUrl') or drama.get('shortPlayNameUrl')
    if not url_path:
        return []
    html = fetch(f"{BASE_URL}{url_path}")
    return extract_episodes(html) if html else []


def scrape_stream(episode_page_url):
    """Get stream URL - use base URL without -ep-X suffix."""
    html = fetch(episode_page_url)
    return extract_stream_url(html) if html else None


def save(dramas):
    path = os.path.join(OUTPUT_DIR, "netshort_full.json")
    data = {
        "scrape_date": datetime.now().isoformat(),
        "source": "netshort.com",
        "total": len(dramas),
        "dramas": dramas
    }
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\nSaved: {path}")


def main():
    ensure_dir()

    dramas = scrape_listings(pages=3)
    if not dramas:
        print("[ERROR] No dramas found")
        return

    print("=" * 60)
    print("SCRAPING EPISODES + STREAM URLs")
    print("=" * 60)

    for i, drama in enumerate(dramas[:10]):
        name = drama.get('shortPlayName', '?')
        print(f"\n[{i+1}/10] {name}")

        eps = scrape_episodes(drama)
        if not eps:
            print("  No episodes")
            continue

        print(f"  {len(eps)} episodes")
        drama['episodes'] = eps

        # Get stream URL from first episode
        # IMPORTANT: Use URL without -ep-X suffix!
        full_ep_url = drama.get('fullEpisodeNameUrl', '')
        if full_ep_url:
            base_ep_url = f"{BASE_URL}{get_episode_base_url(full_ep_url)}"
            print(f"  Stream: {base_ep_url}")
            time.sleep(DELAY)
            stream = scrape_stream(base_ep_url)
            if stream:
                drama['stream_url'] = stream
                print(f"  [OK] STREAM FOUND!")
            else:
                print("  [WARN] No stream")

        time.sleep(DELAY)

    save(dramas)

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)
    print(f"Dramas: {len(dramas)}")
    print(f"With episodes: {sum(1 for d in dramas if d.get('episodes'))}")
    print(f"With stream: {sum(1 for d in dramas if d.get('stream_url'))}")


if __name__ == "__main__":
    main()
