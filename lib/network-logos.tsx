export const NetworkSVGs: Record<string, string> = {
  netflix: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="currentColor"><path d="M0 0h2.8v14H0V0zm4.2 0L7 10.5 9.8 0h2.8L8.4 14h-2.8L4.2 0zm4.2 0h2.8v14H8.4V0z"/></svg>`,
  hbo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" fill="currentColor"><path d="M0 0h192v192H0V0zm42.5 42.5h15v107h-15v-107zm50 0h45v15h-30v25h28v15h-28v37h30v15h-45v-107zm52.5 0h15v107h-15v-107z"/></svg>`,
  "prime-video": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor"><path d="M6 20c0 0 2.5 3 10 3s10-4 10-4l-3-3c0 0-2 2.5-7 2.5S9 17 9 17L6 20zM25.5 7.5l-3 7h-3l3-7h-3l-2.5 7h-3L11 7.5h3l2.5 7 3-7h3l-3 7 3-7h2.5zM7 25c4 2 9 2.5 12.5 1.5 3.5-1 6-3.5 6-3.5l-2-2c0 0-2 2-5 2.5s-7.5 0-9.5-1.5L7 25z"/></svg>`,
  "disney-plus": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 3h19v18h-19V3zm4.5 4v10l7-5-7-5z"/></svg>`,
  "apple-tv-plus": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor"><path d="M25.5 16.5c0-3.8-3-5.5-6.2-5.5-3.3 0-6.3 1.7-6.3 5.5 0 3.7 3 5.5 6.3 5.5 1.6 0 3.2-.5 4.5-1.5l-1.8-2c-.8.6-1.8.9-2.7.9-1.8 0-3-1-3-2.4h8.2c0-.1.3-.5.3-1zM19.3 13c1.5 0 2.5 1 2.5 2.5h-5.3c.1-1.4 1.2-2.5 2.8-2.5zM8 11.5h-3v10h3v-10zM4.5 7.5h3v3h-3v-3z"/></svg>`,
};

export function getNetworkSVG(slug: string): string | undefined {
  return NetworkSVGs[slug];
}
