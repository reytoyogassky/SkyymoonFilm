const BASE = "https://api.anichin.bio";

async function main() {
  const dramaId = "1967772409659752450";
  
  // Get full detail with episodes
  const r = await fetch(`${BASE}/netshort/detail?id=${dramaId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  
  console.log("=== Drama Detail ===");
  console.log("Title:", data.data?.title);
  console.log("Episodes count:", data.data?.episodes?.length);
  
  if (data.data?.episodes) {
    const eps = data.data.episodes;
    
    // Show first 3 and last 3 episodes
    console.log("\n--- First 3 episodes ---");
    for (let i = 0; i < Math.min(3, eps.length); i++) {
      console.log(JSON.stringify(eps[i]));
    }
    
    console.log(`\n--- Episode 23 (should be VIP) ---`);
    const ep23 = eps.find(e => e.episodeNumber === 23);
    if (ep23) console.log(JSON.stringify(ep23));
    
    console.log(`\n--- Episode 50 (VIP) ---`);
    const ep50 = eps.find(e => e.episodeNumber === 50);
    if (ep50) console.log(JSON.stringify(ep50));
    
    console.log(`\n--- Last 3 episodes ---`);
    for (let i = Math.max(0, eps.length - 3); i < eps.length; i++) {
      console.log(JSON.stringify(eps[i]));
    }

    // Count locked vs unlocked
    const locked = eps.filter(e => e.locked === true).length;
    const unlocked = eps.filter(e => e.locked === false).length;
    console.log(`\nLocked: ${locked}, Unlocked: ${unlocked}, Total: ${eps.length}`);
  }

  // Try play endpoint with different formats
  console.log("\n=== Test Play/Video endpoints ===");
  const ep1 = data.data?.episodes?.[0];
  if (ep1) {
    const epId = ep1.id || ep1.episodeId;
    console.log("Ep1 ID:", epId);
    
    const playEndpoints = [
      `/netshort/play?id=${dramaId}&ep=1`,
      `/netshort/play?id=${dramaId}&episodeId=${epId}`,
      `/netshort/play/${dramaId}/1`,
      `/netshort/stream?id=${dramaId}&ep=1`,
      `/netshort/video?id=${dramaId}&ep=1`,
    ];
    
    for (const ep of playEndpoints) {
      try {
        const r2 = await fetch(`${BASE}${ep}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(8000),
        });
        const body = await r2.text();
        console.log(`${ep}: ${r2.status} ${body.substring(0, 200)}`);
      } catch (e) {
        console.log(`${ep}: TIMEOUT/ERROR`);
      }
    }
  }
}

main().catch(console.error);
