import { NextRequest, NextResponse } from "next/server";
import { findIdlixSlug, findIdlixTvSlug, getMovieStream, getTvStream } from "@/lib/idlix";
import { getMovieDetail, getTvDetail } from "@/lib/tmdb";
import { ngeStream, ngeUrlOf, RPM_BASE } from "@/lib/ngefilm";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const mappingCache = new Map<string, { slug: string | null; at: number }>();

async function resolveMovieIdlixSlug(tmdbId: string): Promise<string | null> {
  const key = `movie::${tmdbId}`;
  const hit = mappingCache.get(key);
  if (hit && Date.now() - hit.at < 12 * 60 * 60 * 1000) return hit.slug;

  let slug: string | null = null;
  try {
    const { movie } = await getMovieDetail(tmdbId);
    slug = await findIdlixSlug(movie.title, movie.releaseDate.slice(0, 4));
  } catch {
    slug = null;
  }

  mappingCache.set(key, { slug, at: Date.now() });
  return slug;
}

async function resolveTvIdlixSlug(tmdbTvId: string, force = false): Promise<string | null> {
  const key = `tv::${tmdbTvId}`;
  if (!force) {
    const hit = mappingCache.get(key);
    if (hit && Date.now() - hit.at < 12 * 60 * 60 * 1000) return hit.slug;
  }

  let slug: string | null = null;
  try {
    const { movie } = await getTvDetail(tmdbTvId);
    slug = await findIdlixTvSlug(movie.title, movie.releaseDate.slice(0, 4));
  } catch {
    slug = null;
  }

  mappingCache.set(key, { slug, at: Date.now() });
  return slug;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/stream/[slug]">) {
  try {
    const { slug } = await ctx.params;
    const renew = req.nextUrl.searchParams.get("renew") === "1";
    const episodeId = req.nextUrl.searchParams.get("episodeId") ?? undefined;

    // NgeFilm Indonesia: slug format "nge-{base64url}"
    if (slug.startsWith("nge-")) {
      const url = episodeId && /^https?:/i.test(episodeId) ? episodeId : ngeUrlOf(slug);
      const stream = await ngeStream(url);
      if (!stream) {
        return NextResponse.json(
          { error: "Stream untuk judul ini belum tersedia di katalog." },
          { status: 404 }
        );
      }
      if (stream.kind === "hls") {
        return NextResponse.json({
          streamUrl: `/api/proxy?url=${encodeURIComponent(stream.master)}&ref=${encodeURIComponent(`${RPM_BASE}/`)}`,
          expiresAt: Date.now() + 2 * 60 * 60 * 1000,
          subtitles: [],
          kind: "hls",
          levels: stream.levels,
        });
      }
      return NextResponse.json(
        { error: "Stream untuk judul ini belum tersedia di katalog." },
        { status: 404 }
      );
    }

    // IDLIX slug (dari browse): langsung stream pakai slug IDLIX
    if (!/^(\d+|tv-\d+)$/.test(slug)) {
      const isTv = req.nextUrl.searchParams.get("type") === "tv";
      const stream = isTv
        ? await getTvStream(slug, renew, episodeId)
        : await getMovieStream(slug, renew);
      return NextResponse.json(stream);
    }

    // TV series: slug format "tv-{id}"
    if (/^tv-\d+$/.test(slug)) {
      const tmdbId = slug.replace("tv-", "");
      const idlixSlug = await resolveTvIdlixSlug(tmdbId, renew);
      if (!idlixSlug) {
        return NextResponse.json(
          { error: "Stream untuk series ini belum tersedia di katalog." },
          { status: 404 }
        );
      }
      const stream = await getTvStream(idlixSlug, renew, episodeId);
      return NextResponse.json(stream);
    }

    // Movie: numeric slug
    const idlixSlug = await resolveMovieIdlixSlug(slug);
    if (!idlixSlug) {
      return NextResponse.json(
        { error: "Stream untuk judul ini belum tersedia di katalog." },
        { status: 404 }
      );
    }

    const stream = await getMovieStream(idlixSlug, renew);
    return NextResponse.json(stream);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}