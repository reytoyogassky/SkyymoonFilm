#!/usr/bin/env python3
"""
NetShort Scraper - Extract stream URLs + subtitles from each drama
"""
import requests
import json
import re
import time
import os

BASE_URL = "https://netshort.com"
LOCALE = "id"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en;q=0.7",
}
OUTPUT_DIR = "D:/gabut/film/drama-player/public"
DELAY = 0.8


def fetch(url):
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        return r.text
    except:
        return None


def extract_rsc(html):
    pattern = r'self\.__next_f\.push\(\[(\d+),"((?:[^"\\]|\\.)*)"\]\)'
    return [c.replace('\\"', '"').replace('\\\\', '\\') for _, c in re.findall(pattern, html)]


def extract_obj_array(html, key):
    """Extract array of objects from RSC data by key name."""
    results, seen = [], set()
    for content in extract_rsc(html):
        idx = content.find(f'"{key}":[')
        if idx == -1:
            continue
        start = idx + len(f'"{key}":[')
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
                        oid = obj.get('shortPlayId') or obj.get('episodeId') or obj.get('episodeNo')
                        if oid and oid not in seen:
                            seen.add(oid)
                            results.append(obj)
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
    return results


def extract_stream_and_subs(html):
    """Extract video URL + subtitle URLs from episode page."""
    result = {"stream_url": None, "subtitles": []}

    for content in extract_rsc(html):
        # --- stream URL (video_mp4) ---
        m = re.search(r'(https?://cfcdn\.netshort\.com/[^\s"<>]+?\\u0026mime_type=video_mp4[^\s"<>]+)', content)
        if m and not result["stream_url"]:
            result["stream_url"] = m.group(1).replace('\\u0026', '&').rstrip('\\')

        # --- subtitle list ---
        sl_idx = content.find('"subtitleList":[')
        if sl_idx != -1:
            arr_start = sl_idx + len('"subtitleList":[')
            depth, obj_start, j = 0, -1, arr_start
            while j < len(content):
                cc = content[j]
                if cc == '{':
                    if depth == 0:
                        obj_start = j
                    depth += 1
                elif cc == '}':
                    depth -= 1
                    if depth == 0 and obj_start >= 0:
                        try:
                            sub_obj = json.loads(content[obj_start:j+1])
                            sub_url = sub_obj.get('url', '').replace('\\u0026', '&')
                            if sub_url and 'text_plain' in sub_url:
                                result["subtitles"].append({
                                    "url": sub_url,
                                    "language": sub_obj.get('subtitleLanguage', ''),
                                    "format": sub_obj.get('format', 'webvtt'),
                                })
                        except:
                            pass
                        obj_start = -1
                elif cc == '"' and depth > 0:
                    j += 1
                    while j < len(content):
                        if content[j] == '\\':
                            j += 2
                            continue
                        if content[j] == '"':
                            break
                        j += 1
                j += 1

    return result


def scrape_all():
    print("=== NetShort Full Scraper ===\n")

    # 1) Get all dramas (5 pages = ~120)
    all_dramas = []
    for page in range(1, 6):
        url = f"{BASE_URL}/{LOCALE}/drama/all-plots" if page == 1 else f"{BASE_URL}/{LOCALE}/drama/all-plots/page/{page}"
        print(f"[LIST PAGE {page}]")
        html = fetch(url)
        if not html:
            continue
        dramas = extract_obj_array(html, 'videoList')
        for d in dramas:
            sid = d.get('shortPlayId')
            if sid and sid not in [x.get('shortPlayId') for x in all_dramas]:
                all_dramas.append(d)
        print(f"  +{len(dramas)} = {len(all_dramas)} total")
        time.sleep(DELAY)

    print(f"\nTotal dramas: {len(all_dramas)}\n")

    # 2) For each drama: get episodes + stream + subtitles (first ep only)
    for i, drama in enumerate(all_dramas):
        name = drama.get('shortPlayName', '?')
        ep_url = drama.get('fullEpisodeNameUrl', '')
        if not ep_url:
            continue

        print(f"[{i+1}/{len(all_dramas)}] {name}")

        # Get episode list
        html = fetch(f"{BASE_URL}{ep_url}")
        if not html:
            time.sleep(DELAY)
            continue

        episodes = extract_obj_array(html, 'episodeList')
        drama['episodes'] = episodes
        print(f"  {len(episodes)} episodes")

        # Get stream URL from first episode (use base URL without -ep-X)
        base_ep = ep_url.replace('/full-episodes/', '/episode/')
        html2 = fetch(f"{BASE_URL}{base_ep}")
        if html2:
            vs = extract_stream_and_subs(html2)
            if vs['stream_url']:
                drama['stream_url'] = vs['stream_url']
                print(f"  [STREAM OK]")
            if vs['subtitles']:
                drama['subtitles'] = vs['subtitles']
                print(f"  [SUBS: {len(vs['subtitles'])}]")

        time.sleep(DELAY)

    # 3) Save
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, "data.json")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({"total": len(all_dramas), "dramas": all_dramas}, f, ensure_ascii=False, indent=2)
    print(f"\nSaved {out_path}")
    print(f"Stream URLs: {sum(1 for d in all_dramas if d.get('stream_url'))}")
    print(f"With subs:   {sum(1 for d in all_dramas if d.get('subtitles'))}")


if __name__ == "__main__":
    scrape_all()
