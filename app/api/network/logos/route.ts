import { NextResponse } from "next/server";
import { getNetworkLogos } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const logos = await getNetworkLogos();
    return NextResponse.json(
      { ok: true, logos },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
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
