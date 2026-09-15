import { NextResponse } from "next/server";
import { NetworkSVGs } from "@/lib/network-logos";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { ok: true, logos: NetworkSVGs },
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
