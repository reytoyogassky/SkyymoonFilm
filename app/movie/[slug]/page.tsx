import MovieDetail from "@/components/MovieDetail";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MovieDetail slug={slug} />;
}