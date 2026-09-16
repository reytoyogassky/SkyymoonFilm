function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const svgRaw: Record<string, string> = {
  netflix: `<svg fill="#FFFFFF" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="m5.398 0 8.348 23.602c2.346.059 4.856.398 4.856.398L10.113 0H5.398zm8.489 0v9.172l4.715 13.33V0h-4.715zM5.398 1.5V24c1.873-.225 2.81-.312 4.715-.398V14.83L5.398 1.5z"/></svg>`,
  hbo: `<svg viewBox="0 0 200 50" xmlns="http://www.w3.org/2000/svg"><text x="100" y="38" text-anchor="middle" fill="#FFFFFF" font-family="Arial Black,Arial,Helvetica,sans-serif" font-size="42" font-weight="900" letter-spacing="4">HBO</text></svg>`,
  "prime-video": `<svg viewBox="0 0 300 60" xmlns="http://www.w3.org/2000/svg"><text x="150" y="32" text-anchor="middle" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700" letter-spacing="1">prime</text><text x="150" y="52" text-anchor="middle" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="400" letter-spacing="3">V I D E O</text><path d="M100 55 Q150 65 200 55" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  "disney-plus": `<svg viewBox="0 0 220 60" xmlns="http://www.w3.org/2000/svg"><text x="105" y="42" text-anchor="middle" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="700" letter-spacing="-1">Disney+</text></svg>`,
  "apple-tv-plus": `<svg fill="#FFFFFF" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/></svg>`,
};

export const NetworkLogos: Record<string, string> = {};
for (const [slug, svg] of Object.entries(svgRaw)) {
  NetworkLogos[slug] = svgToDataUri(svg);
}

export function getNetworkSVG(slug: string): string | undefined {
  return NetworkLogos[slug];
}
