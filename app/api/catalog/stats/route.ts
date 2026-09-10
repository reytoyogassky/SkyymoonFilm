import { NextResponse } from "next/server";
import { catalogStats } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = catalogStats();

    return NextResponse.json(
      { ok: true, ...stats },
      {
        headers: {
          "Cache-Control": "public, max-age=600, stale-while-revalidate=1200",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 }
    );
  }
}
