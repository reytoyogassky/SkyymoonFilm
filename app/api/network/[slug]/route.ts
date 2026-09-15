import { NextRequest, NextResponse } from "next/server";
import { fetchNetworkContent, getNetworkBySlug } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const network = getNetworkBySlug(slug);
    if (!network) {
      return NextResponse.json({ ok: false, error: "Network not found" }, { status: 404 });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.min(500, Math.max(1, Number(sp.get("page") ?? 1)));
    const typeParam = sp.get("type") ?? "all";
    const mediaType: "movie" | "tv" | "all" =
      typeParam === "movie" || typeParam === "tv" ? typeParam : "all";

    const items = await fetchNetworkContent(slug, page, mediaType);

    return NextResponse.json(
      { ok: true, network, data: items },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
