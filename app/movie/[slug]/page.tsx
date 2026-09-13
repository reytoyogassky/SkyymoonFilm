import type { Metadata } from "next";
import MovieDetail from "@/components/MovieDetail";

const SITE_URL = "https://skyymovie.up.railway.app";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;

  try {
    const res = await fetch(`${SITE_URL}/api/catalog/${slug}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return { title: slug.replace(/-/g, " ") };
    }
    const d = await res.json();
    const movie = d.movie;
    if (!movie) return { title: slug.replace(/-/g, " ") };

    const title = movie.title || slug.replace(/-/g, " ");
    const year = movie.releaseDate?.slice(0, 4) || "";
    const genres = (movie.genres || []).map((g: { name: string }) => g.name).join(", ");
    const desc = movie.overview || `Nonton ${title} subtitle Indonesia gratis di SKYYMOVIE.`;
    const pageTitle = year ? `${title} (${year})` : title;
    const pageDesc = genres ? `${desc} Genre: ${genres}.` : desc;

    return {
      title: pageTitle,
      description: pageDesc.slice(0, 160),
      keywords: [
        `nonton ${title}`,
        `${title} subtitle indonesia`,
        `streaming ${title}`,
        ...((movie.genres || []).map((g: { name: string }) => g.name)),
      ],
      openGraph: {
        title: `${pageTitle} - SKYYMOVIE`,
        description: pageDesc.slice(0, 200),
        url: `${SITE_URL}/movie/${slug}`,
        type: "video.movie",
        images: movie.posterPath
          ? [{ url: movie.posterPath, width: 500, height: 750, alt: title }]
          : [],
      },
      twitter: {
        card: "summary_large_image",
        title: `${pageTitle} - SKYYMOVIE`,
        description: pageDesc.slice(0, 200),
        images: movie.posterPath ? [movie.posterPath] : [],
      },
      alternates: {
        canonical: `${SITE_URL}/movie/${slug}`,
      },
    };
  } catch {
    return { title: slug.replace(/-/g, " ") };
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MovieDetail slug={slug} />;
}
