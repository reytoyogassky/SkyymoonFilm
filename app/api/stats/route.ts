import { NextResponse } from "next/server";
import { catalogStats } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// Legacy redirect: /api/stats → /api/catalog/stats
export async function GET() {
  try {
    const stats = catalogStats();
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
