import { NextResponse } from "next/server";
import { fetchProviderSections } from "@/lib/scraper";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = (searchParams.get("provider") || "").trim();
  
  if (!provider) {
    return NextResponse.json({ error: "provider required" }, { status: 400 });
  }
  
  const dramas = await fetchProviderSections(provider);
  return NextResponse.json({ total: dramas.length, dramas });
}
